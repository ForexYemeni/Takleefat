import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { updateAssignmentStatusSchema } from '@/lib/validations/assignment'
import { notify } from '@/lib/notifications'
import { ASSIGNMENT_STATUS_LABELS } from '@/lib/utils'

const ACTION_MESSAGES: Record<string, string> = {
  COMPLETED: 'تم إنجاز التكليف',
  CANCELLED: 'تم إلغاء التكليف',
  ACTIVE: 'تم تنشيط التكليف',
}

const paymentStatusSchema = z.object({
  paymentStatus: z.enum(['UNPAID', 'PAID'], { error: 'حالة الدفع غير صحيحة' }),
})

/**
 * PATCH /api/admin/assignments/[id]
 * تحديث حالة التكليف (إنجاز / إلغاء / تنشيط) أو حالة الدفع (مدفوع/غير مدفوع)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('ADMIN')
    const { id } = await params

    const raw = await req.json()

    // تحديث حالة الدفع للإدارة
    const paymentParsed = paymentStatusSchema.safeParse(raw)
    if (paymentParsed.success) {
      const assignment = await db.assignment.findUnique({ where: { id } })
      if (!assignment) return jsonError('التكليف غير موجود', 404)

      await db.assignment.update({
        where: { id },
        data: { paymentStatus: paymentParsed.data.paymentStatus },
      })
      await db.assignmentLog.create({
        data: {
          assignmentId: id,
          userId: session.user.id,
          action:
            paymentParsed.data.paymentStatus === 'PAID'
              ? 'تأكيد دفع الرسوم للإدارة'
              : 'إلغاء تأكيد الدفع',
        },
      })

      return NextResponse.json({
        message:
          paymentParsed.data.paymentStatus === 'PAID'
            ? 'تم تأكيد دفع الرسوم للإدارة'
            : 'تم إلغاء تأكيد الدفع',
      })
    }

    const parsed = updateAssignmentStatusSchema.safeParse(raw)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const assignment = await db.assignment.findUnique({ where: { id } })
    if (!assignment) return jsonError('التكليف غير موجود', 404)

    const { status, note } = parsed.data

    // لا يمكن الإنهاء قبل الاستلام
    if (status === 'COMPLETED' && assignment.status === 'ACTIVE') {
      return jsonError('لا يمكن إنجاز التكليف قبل تأكيد استلامه من المستلم الإداري', 409)
    }

    const updated = await db.assignment.update({
      where: { id },
      data: { status },
    })

    await db.assignmentLog.create({
      data: {
        assignmentId: id,
        userId: session.user.id,
        action: `تحديث الحالة: ${ASSIGNMENT_STATUS_LABELS[status]}`,
        note: note || undefined,
      },
    })

    const message = ACTION_MESSAGES[status] ?? `تم تحديث حالة التكليف إلى ${ASSIGNMENT_STATUS_LABELS[status]}`

    // إشعار المعنيين
    await Promise.all([
      notify(assignment.nurseId, {
        title: 'تحديث على التكليف',
        body: `${message}: ${assignment.title}`,
        type: 'ASSIGNMENT_COMPLETED',
        link: '/nurse/assignments',
      }),
      notify(assignment.receiverId, {
        title: 'تحديث على التكليف',
        body: `${message}: ${assignment.title}`,
        type: 'ASSIGNMENT_COMPLETED',
        link: '/receiver/assignments',
      }),
    ])

    return NextResponse.json({ message, assignment: updated })
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * DELETE /api/admin/assignments/[id] — حذف تكليف (للإدارة)
 * يُستخدم لتنظيف البيانات التجريبية/الخاطئة مع إشعار المعنيين.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('ADMIN')
    const { id } = await params

    const assignment = await db.assignment.findUnique({ where: { id } })
    if (!assignment) return jsonError('التكليف غير موجود', 404)

    await db.assignment.delete({ where: { id } })

    // إشعار المعنيين بالحذف
    await Promise.all([
      notify(assignment.nurseId, {
        title: 'حذف تكليف',
        body: `تم حذف التكليف (${assignment.title}) من قِبل إدارة المنصة`,
        type: 'GENERIC',
        link: '/nurse/assignments',
      }),
      notify(assignment.receiverId, {
        title: 'حذف تكليف',
        body: `تم حذف التكليف (${assignment.title}) من قِبل إدارة المنصة`,
        type: 'GENERIC',
        link: '/receiver/assignments',
      }),
    ])

    return NextResponse.json({
      message: `تم حذف التكليف (${assignment.title}) بنجاح — بواسطة ${session.user.name}`,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
