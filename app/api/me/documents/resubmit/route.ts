import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { notify } from '@/lib/notifications'

/**
 * POST /api/me/documents/resubmit
 * إعادة تقديم الحساب للاعتماد بعد الرفض — بعد تحديث المستندات
 */
export async function POST() {
  try {
    const session = await requireRole('NURSE', 'DOCTOR')

    const user = await db.user.findUnique({ where: { id: session.user.id } })
    if (!user) return jsonError('الحساب غير موجود', 404)
    if (user.status !== 'REJECTED') {
      return jsonError('إعادة التقديم متاحة فقط للحسابات المرفوضة', 409)
    }

    const docsCount = await db.document.count({ where: { userId: user.id } })
    if (docsCount === 0) {
      return jsonError('يجب رفع مستند واحد على الأقل قبل إعادة التقديم', 422)
    }

    await db.user.update({
      where: { id: user.id },
      data: { status: 'PENDING', rejectNote: null },
    })

    // تصفير حالة المستندات المرفوضة لتكون قيد المراجعة مجدداً
    await db.document.updateMany({
      where: { userId: user.id, status: 'REJECTED' },
      data: { status: 'PENDING', reviewNote: null },
    })

    const admins = await db.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
    await Promise.all(
      admins.map((admin) =>
        notify(admin.id, {
          title: 'طلب إعادة اعتماد',
          body: `${user.name} أعد تقديم مستنداته بانتظار المراجعة`,
          type: 'GENERIC',
          link: '/admin/nurses',
        })
      )
    )

    return NextResponse.json({ message: 'تم إعادة تقديم الحساب للمراجعة' })
  } catch (error) {
    return handleApiError(error)
  }
}
