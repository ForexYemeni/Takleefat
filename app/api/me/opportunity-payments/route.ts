import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError, ApiError } from '@/lib/api-helpers'
import { forsahPaymentTimingSchema } from '@/lib/validations/forsah'
import { assertForsahEnabled } from '@/lib/forsah/server'
import { OPPORTUNITY_PAYMENT_TIMING_LABELS } from '@/lib/forsah/constants'
import { logForsahAudit } from '@/lib/forsah/audit'
import { notify } from '@/lib/notifications'

/**
 * مسار سداد رسوم «فرصة» من جهة المرشح — الجولة 70
 * ============================================================
 * PATCH /api/me/opportunity-payments — اختيار توقيت سداد رسوم الخدمة
 * بعد الاختيار (شفافية كاملة — قرار المرشح مسجل وموثق):
 *  - WITHIN_FIRST_TEN_DAYS: خلال أول 10 أيام من الدوام (مرن — يُحدد مع بدء الدوام)
 *  - DIRECT: دفع مباشر (يستحق فوراً)
 *  - AFTER_THREE_DAYS: بعد ثلاثة أيام من لحظة الاختيار
 * الحماية:
 *  - حصراً لصاحب الطلب نفسه — لا يمكن لغيره لمس عملية غيره.
 *  - لا اختيار توقيت إلا لطلب مُختار فعلاً وعليه عملية مالية قائمة.
 *  - لا تعديل التوقيت بعد السداد (PAID/COMPLETED) أو الإلغاء/الاسترداد.
 *  - كل اختيار يُسجل في سجل تدقيق «فرصة» + إشعار لجهة التوظيف (HR المالك).
 */

/** الحالات التي يُسمح فيها باختيار/تغيير توقيت السداد */
const TIMING_EDITABLE_STATUSES = ['PENDING', 'AWAITING_PAYMENT'] as const

/** موعد الاستحقاق التقديري من التوقيت المختار */
function computePaymentDueAt(timing: 'WITHIN_FIRST_TEN_DAYS' | 'DIRECT' | 'AFTER_THREE_DAYS'): Date | null {
  const now = new Date()
  if (timing === 'DIRECT') return now
  if (timing === 'AFTER_THREE_DAYS') return new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
  // أول 10 أيام من الدوام — مرن لحظة بدء الدوام الفعلي
  return null
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireRole('NURSE', 'DOCTOR')
    const role = session.user.activeRole ?? session.user.role
    await assertForsahEnabled(role)

    const parsed = forsahPaymentTimingSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }
    const { applicationId, timing } = parsed.data

    // الطلب: له حصراً + مُختار فعلاً
    const application = await db.opportunityApplication.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        userId: true,
        status: true,
        selection: { select: { id: true } },
        opportunity: { select: { id: true, title: true, createdById: true } },
      },
    })
    if (!application) throw new ApiError('الطلب غير موجود', 404)
    if (application.userId !== session.user.id) {
      throw new ApiError('لا يمكنك تعديل عملية لا تخصك', 403)
    }
    if (!application.selection) {
      throw new ApiError('لم يتم اختيارك لهذه الفرصة بعد — يظهر توقيت السداد بعد الاختيار', 409)
    }

    const transaction = await db.opportunityTransaction.findUnique({
      where: { selectionId: application.selection.id },
    })
    if (!transaction) {
      throw new ApiError('لا توجد رسوم مستحقة على هذا الطلب — الفرصة بلا رسوم مسجلة', 404)
    }
    if (!TIMING_EDITABLE_STATUSES.includes(transaction.status as (typeof TIMING_EDITABLE_STATUSES)[number])) {
      throw new ApiError('لا يمكن تعديل توقيت السداد بعد تسديد الرسوم أو إغلاق العملية', 409)
    }

    // Idempotent: نفس التوقيت المختار مسبقاً — رسالة ودية بلا تكرار كتابة
    if (transaction.paymentTiming === timing) {
      return NextResponse.json({
        message: `توقيت السداد المختار مسبقاً: ${OPPORTUNITY_PAYMENT_TIMING_LABELS[timing]}`,
        payment: {
          feeAmount: transaction.feeAmount,
          currency: transaction.currency,
          status: transaction.status,
          paymentTiming: transaction.paymentTiming,
          paymentTimingLabel: OPPORTUNITY_PAYMENT_TIMING_LABELS[timing],
          paymentDueAt: transaction.paymentDueAt,
        },
      })
    }

    const dueAt = computePaymentDueAt(timing)
    const updated = await db.opportunityTransaction.update({
      where: { id: transaction.id },
      data: {
        paymentTiming: timing,
        paymentTimingChosenAt: new Date(),
        paymentDueAt: dueAt,
      },
    })

    await logForsahAudit({
      actorId: session.user.id,
      actorRole: role,
      action: 'PAYMENT_TIMING_SELECTED',
      entityType: 'Transaction',
      entityId: transaction.id,
      meta: {
        applicationId,
        opportunityId: application.opportunity.id,
        from: transaction.paymentTiming ?? null,
        to: timing,
        feeAmount: transaction.feeAmount,
      },
    })

    // إشعار جهة التوظيف (HR المالك) — يجهز لتحصيل الرسوم وفق التوقيت المختار
    if (application.opportunity.createdById !== session.user.id) {
      await notify(application.opportunity.createdById, {
        title: 'اختار المرشح توقيت سداد الرسوم',
        body: `${session.user.name} — فرصة «${application.opportunity.title}» — اختار: ${OPPORTUNITY_PAYMENT_TIMING_LABELS[timing]} — الرسوم: ${updated.feeAmount.toLocaleString('ar-YE')} ${updated.currency}`,
        type: 'OPPORTUNITY_PAYMENT_TIMING_SELECTED',
        link: `/hr/opportunities/${application.opportunity.id}`,
      })
    }

    return NextResponse.json({
      message: `تم اعتماد توقيت السداد: ${OPPORTUNITY_PAYMENT_TIMING_LABELS[timing]}`,
      payment: {
        feeAmount: updated.feeAmount,
        currency: updated.currency,
        status: updated.status,
        paymentTiming: updated.paymentTiming,
        paymentTimingLabel: OPPORTUNITY_PAYMENT_TIMING_LABELS[timing],
        paymentDueAt: updated.paymentDueAt,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
