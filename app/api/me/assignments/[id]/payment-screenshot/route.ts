import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { saveImageToDb, validateImageFile } from '@/lib/storage'
import { notify } from '@/lib/notifications'

/**
 * POST /api/me/assignments/[id]/payment-screenshot
 * رفع لقطة شاشة إثبات دفع رسوم/نسبة الإدارة من الكادر التمريضي.
 * - صورة مضغوطة من جهة العميل تُخزَّن في قاعدة البيانات
 * - تظهر للإدارة بشكل احترافي مع التكبير (مثل عرض المستندات)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('NURSE', 'DOCTOR')
    const { id } = await params

    const assignment = await db.assignment.findUnique({ where: { id } })
    if (!assignment) return jsonError('التكليف غير موجود', 404)
    if (assignment.nurseId !== session.user.id) {
      return jsonError('ليست لديك صلاحية على هذا التكليف', 403)
    }
    if (assignment.status === 'CANCELLED') {
      return jsonError('لا يمكن رفع إثبات دفع لتكليف ملغى', 409)
    }
    if (assignment.paymentStatus === 'PAID') {
      return jsonError('تم تأكيد دفع الرسوم لهذا التكليف مسبقاً — لا حاجة لرفع الإثبات', 409)
    }

    const formData = await req.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return jsonError('لقطة الشاشة مطلوبة', 422)
    }
    const validationError = validateImageFile(file)
    if (validationError) {
      return jsonError(validationError, 422)
    }

    const stored = await saveImageToDb(file)

    const updated = await db.assignment.update({
      where: { id },
      data: {
        paymentScreenshotUrl: stored.url,
        paymentScreenshotName: stored.fileName,
      },
      select: { id: true, paymentScreenshotUrl: true, paymentScreenshotName: true },
    })

    await db.assignmentLog.create({
      data: {
        assignmentId: id,
        userId: session.user.id,
        action: 'رفع إثبات دفع الرسوم',
        note: `رفع الكادر لقطة شاشة إثبات الدفع (${stored.fileName}) — بانتظار تأكيد الإدارة`,
      },
    })

    // إشعار الإدارة والمستلم الإداري بوجود إثبات دفع جديد
    const admins = await db.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
    await Promise.all([
      ...admins.map((admin) =>
        notify(admin.id, {
          title: 'إثبات دفع جديد بانتظار التأكيد',
          body: `${session.user.name} رفع لقطة شاشة إثبات دفع رسوم التكليف (${assignment.title}) — راجعها وأكد الدفع`,
          type: 'DOCUMENT_UPLOADED',
          link: '/admin/assignments',
        })
      ),
      notify(assignment.receiverId, {
        title: 'إثبات دفع رسوم التكليف',
        body: `رفع الكادر إثبات دفع رسوم التكليف (${assignment.title}) — بانتظار تأكيد إدارة المنصة`,
        type: 'DOCUMENT_UPLOADED',
        link: '/receiver/assignments',
      }),
    ])

    return NextResponse.json({
      message: 'تم رفع لقطة شاشة إثبات الدفع بنجاح — ستُراجع من إدارة المنصة',
      screenshot: updated,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
