import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { updateAssignmentStatusSchema } from '@/lib/validations/assignment'
import { notify } from '@/lib/notifications'
import { ASSIGNMENT_STATUS_LABELS, formatCurrency } from '@/lib/utils'
import { settleAssignmentFees, settlementNote, type FeeSettlement } from '@/lib/fees'

const ACTION_MESSAGES: Record<string, string> = {
  COMPLETED: 'تم إنجاز التكليف',
  CANCELLED: 'تم إلغاء التكليف',
  ACTIVE: 'تم تنشيط التكليف',
}

const paymentStatusSchema = z.object({
  paymentStatus: z.enum(['UNPAID', 'PAID'], { error: 'حالة الدفع غير صحيحة' }),
})

// إعادة احتساب وتوزيع رسوم التكليف — يعالج التكليفات القديمة التي أُنهيت دون توزيع
const redistributeSchema = z.object({
  redistributeFees: z.literal(true, { error: 'طلب غير صحيح' }),
})

/** إشعار المستلم الإداري بإضافة ربحه بعد التوزيع — يُرسل عند إنشاء سجل ربح جديد فقط */
async function notifyReceiverEarning(
  receiverId: string,
  assignmentTitle: string,
  settlement: FeeSettlement
) {
  if (!settlement.earningCreated || settlement.earningAmount <= 0) return
  await notify(receiverId, {
    title: 'تم توزيع رسوم التكليف',
    body: `أُضيف ربح ${formatCurrency(settlement.earningAmount)} من التكليف «${assignmentTitle}» إلى قسم أرباحك — نسبة ${settlement.sharePercent}٪ من قيمة التكليف`,
    type: 'GENERIC',
    link: '/receiver/earnings',
  })
}

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

    // إعادة احتساب وتوزيع رسوم التكليف (الإدارة) — لمعالجة التكليفات المنتهية دون توزيع
    const redistributeParsed = redistributeSchema.safeParse(raw)
    if (redistributeParsed.success) {
      const assignment = await db.assignment.findUnique({ where: { id } })
      if (!assignment) return jsonError('التكليف غير موجود', 404)
      if (assignment.status === 'CANCELLED') {
        return jsonError('لا يمكن توزيع رسوم تكليف ملغى', 409)
      }

      const settlement = await settleAssignmentFees(id)
      const note = settlement ? settlementNote(settlement, assignment.value) : ''
      await db.assignmentLog.create({
        data: {
          assignmentId: id,
          userId: session.user.id,
          action: 'إعادة احتساب وتوزيع رسوم التكليف',
          note: note || undefined,
        },
      })
      if (settlement) await notifyReceiverEarning(assignment.receiverId, assignment.title, settlement)

      return NextResponse.json({
        message:
          settlement && settlement.earningAmount > 0
            ? `تم إعادة احتساب الرسوم وتوزيعها — ربح المستلم الإداري ${formatCurrency(settlement.earningAmount)} مُضاف إلى قسم أرباحه`
            : 'تم إعادة الاحتساب — لا توجد قيمة تكليف لتوزيع ربح منها',
        settlement,
      })
    }

    // تحديث حالة الدفع للإدارة
    const paymentParsed = paymentStatusSchema.safeParse(raw)
    if (paymentParsed.success) {
      const assignment = await db.assignment.findUnique({ where: { id } })
      if (!assignment) return jsonError('التكليف غير موجود', 404)

      const isPaid = paymentParsed.data.paymentStatus === 'PAID'

      // توزيع رسوم التكليف فور تأكيد الدفع — حتى لو لم يُنهِ الكادر أو المستلم التكليف
      // (سابقاً كان الربح يُحتسب في مسار إنهاء المستلم فقط فلا يُوزَّع أبداً)
      const settlement =
        isPaid && assignment.status !== 'CANCELLED' ? await settleAssignmentFees(id) : null

      await db.assignment.update({
        where: { id },
        data: { paymentStatus: paymentParsed.data.paymentStatus },
      })
      await db.assignmentLog.create({
        data: {
          assignmentId: id,
          userId: session.user.id,
          action: isPaid ? 'تأكيد دفع الرسوم للإدارة' : 'إلغاء تأكيد الدفع',
          note: settlement ? settlementNote(settlement, assignment.value) || undefined : undefined,
        },
      })
      if (settlement) await notifyReceiverEarning(assignment.receiverId, assignment.title, settlement)

      const distributed = settlement && settlement.earningAmount > 0
      return NextResponse.json({
        message: isPaid
          ? distributed
            ? `تم تأكيد دفع الرسوم للإدارة — وتم توزيع رسوم التكليف: أُضيف ربح ${formatCurrency(settlement.earningAmount)} إلى حساب المستلم الإداري`
            : 'تم تأكيد دفع الرسوم للإدارة'
          : 'تم إلغاء تأكيد الدفع',
        settlement,
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

    // عند إنهاء التكليف من الإدارة مباشرة — تُوزَّع الرسوم أيضاً (ربح المستلم الإداري)
    const settlement =
      status === 'COMPLETED' && assignment.status !== 'CANCELLED'
        ? await settleAssignmentFees(id)
        : null

    await db.assignmentLog.create({
      data: {
        assignmentId: id,
        userId: session.user.id,
        action: `تحديث الحالة: ${ASSIGNMENT_STATUS_LABELS[status]}`,
        note: [note || undefined, settlement ? settlementNote(settlement, assignment.value) || undefined : undefined]
          .filter(Boolean)
          .join(' — ') || undefined,
      },
    })
    if (settlement) await notifyReceiverEarning(assignment.receiverId, assignment.title, settlement)

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

    return NextResponse.json({ message, assignment: updated, settlement })
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
