import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { saveImageToDb, validateImageFile } from '@/lib/storage'
import { notify } from '@/lib/notifications'
import { DOCUMENT_TYPE_LABELS } from '@/lib/utils'

const VALID_TYPES = ['ID_CARD', 'PRACTICE_LICENSE', 'EXPERIENCE_CERT', 'OTHER']

/**
 * POST /api/upload — رفع مستند صورة للكادر التمريضي
 * FormData: file (صورة فقط)، type (نوع المستند)
 * - الصور فقط (JPG/PNG/WEBP) — مضغوطة من جهة العميل قبل الإرسال
 * - تُخزن داخل قاعدة البيانات وتُقدَّم عبر /api/files/blob/{id}
 * - تُسجل بانتظار مراجعة الإدارة
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole('NURSE', 'DOCTOR')

    const formData = await req.formData()
    const file = formData.get('file')
    const type = String(formData.get('type') ?? 'OTHER')

    if (!(file instanceof File)) {
      return jsonError('الصورة مطلوبة', 422)
    }
    if (!VALID_TYPES.includes(type)) {
      return jsonError('نوع المستند غير صحيح', 422)
    }

    const validationError = validateImageFile(file)
    if (validationError) {
      return jsonError(validationError, 422)
    }

    // الجولة 45 — قفل إعادة الرفع من الخادم (حماية مطابقة للواجهة):
    // «بعد الموافقة على المستندات من الإدارة لا يُسمح بإعادة الرفع إلا إذا رُفض
    // المستند من حساب الإدارة» — وجود نسخة معتمدة أو قيد المراجعة من نفس النوع
    // يمنع الرفع كلياً؛ المرفوض وحده يمكن استبداله.
    const blocking = await db.document.findFirst({
      where: {
        userId: session.user.id,
        type: type as 'ID_CARD' | 'PRACTICE_LICENSE' | 'EXPERIENCE_CERT' | 'OTHER',
        status: { in: ['APPROVED', 'PENDING'] },
      },
      select: { status: true, title: true },
    })
    if (blocking) {
      return jsonError(
        blocking.status === 'APPROVED'
          ? `المستند (${blocking.title}) معتمد من الإدارة — لا يمكن إعادة رفعه إلا إذا رفضته الإدارة`
          : `المستند (${blocking.title}) قيد مراجعة الإدارة — لا يمكن إعادة رفعه حتى يصدر قرار الإدارة`,
        409
      )
    }

    const stored = await saveImageToDb(file)

    const document = await db.document.create({
      data: {
        userId: session.user.id,
        type: type as 'ID_CARD' | 'PRACTICE_LICENSE' | 'EXPERIENCE_CERT' | 'OTHER',
        title: DOCUMENT_TYPE_LABELS[type as keyof typeof DOCUMENT_TYPE_LABELS] ?? 'مستند',
        fileUrl: stored.url,
        fileName: stored.fileName,
        fileSize: stored.fileSize,
        mimeType: stored.mimeType,
        status: 'PENDING',
      },
      select: {
        id: true,
        type: true,
        title: true,
        fileUrl: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        status: true,
        createdAt: true,
      },
    })

    // إشعار الإدارة بوجود مستند جديد بانتظار المراجعة
    const admins = await db.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
    await Promise.all(
      admins.map((admin) =>
        notify(admin.id, {
          title: 'مستند جديد بانتظار المراجعة',
          body: `${session.user.name} رفع مستند (${document.title}) — بانتظار المراجعة والاعتماد`,
          type: 'DOCUMENT_UPLOADED',
          link: '/admin/documents',
        })
      )
    )

    return NextResponse.json(
      { message: 'تم رفع المستند بنجاح وسيُراجع من إدارة المنصة', document },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
