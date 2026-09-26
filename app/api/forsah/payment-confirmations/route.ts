import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError, ApiError } from '@/lib/api-helpers'
import { requireForsahPermission } from '@/lib/forsah/server'
import {
  OPPORTUNITY_PAYMENT_TIMING_LABELS,
  OPPORTUNITY_TRANSACTION_STATUS_LABELS,
} from '@/lib/forsah/constants'
import { logForsahAudit } from '@/lib/forsah/audit'
import { notify } from '@/lib/notifications'

/**
 * مسار تأكيدات دفع رسوم «فرصة» — الجولة 71 (البوابة الإلزامية)
 * ============================================================
 * GET   /api/forsah/payment-confirmations — قائمة الإثباتات المرفوعة
 *       بانتظار قرار الإدارة (الإدارة حصراً بصلاحية viewFinancials):
 *       كل عملية مالية عليها إثبات دفع مرفوع وحالتها لم تُسدَّد بعد.
 * PATCH /api/forsah/payment-confirmations — قرار الإدارة (صلاحية manage):
 *  - CONFIRM: تأكيد وصول الدفعة → العملية «مسددة» + paidAt + إشعار المرشح وHR
 *    — بعدها تُرفع بطاقة السداد الحاجبة عن المرشح تلقائياً.
 *  - REJECT: رفض الإثبات (صورة غير مقروءة/مبلغ خاطئ/حوالة غير واصلة) →
 *    تُمسح حقول الإثبات (يمكن إعادة الرفع) + ملاحظة السبب تظهر للمرشح + إشعار.
 * كل قرار يُسجل في سجل تدقيق «فرصة» — لا تعديل مباشر للحالات الأخرى من هنا
 * (مسار العملية المالية الكامل القائم /api/opportunities/[id]/transaction يبقى كما هو).
 */

export async function GET() {
  try {
    const session = await requireRole('ADMIN')
    await requireForsahPermission(session, 'opportunity.viewFinancials')

    const transactions = await db.opportunityTransaction.findMany({
      where: {
        paymentProofUrl: { not: null },
        status: { in: ['PENDING', 'AWAITING_PAYMENT'] },
      },
      orderBy: { paymentProofUploadedAt: 'desc' },
      take: 100,
      include: {
        opportunity: { select: { id: true, title: true, number: true } },
      },
    })

    // المرشح لكل عملية — علاقة الاختيار → الطلب → المستخدم
    const selections = await db.opportunitySelection.findMany({
      where: { id: { in: transactions.map((t) => t.selectionId) } },
      select: {
        id: true,
        candidate: { select: { id: true, name: true, phone: true } },
      },
    })
    const candidateBySelection = new Map(selections.map((s) => [s.id, s.candidate]))

    return NextResponse.json({
      items: transactions.map((t) => ({
        id: t.id,
        opportunity: t.opportunity,
        feeAmount: t.feeAmount,
        currency: t.currency,
        feeType: t.feeType,
        feePercent: t.feePercent,
        status: t.status,
        statusLabel: OPPORTUNITY_TRANSACTION_STATUS_LABELS[t.status],
        paymentTiming: t.paymentTiming,
        paymentTimingLabel: t.paymentTiming ? OPPORTUNITY_PAYMENT_TIMING_LABELS[t.paymentTiming] : null,
        paymentDueAt: t.paymentDueAt,
        paymentProofUrl: t.paymentProofUrl,
        paymentProofFileName: t.paymentProofFileName,
        paymentProofUploadedAt: t.paymentProofUploadedAt,
        candidate: candidateBySelection.get(t.selectionId) ?? null,
      })),
      total: transactions.length,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireRole('ADMIN')
    await requireForsahPermission(session, 'opportunity.manage')

    const body = await req.json().catch(() => ({}))
    const transactionId = String(body?.transactionId ?? '')
    const action = String(body?.action ?? '')
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 300) : ''

    if (!transactionId) return jsonError('معرف العملية مطلوب', 422)
    if (!['CONFIRM', 'REJECT'].includes(action)) {
      return jsonError('الإجراء غير صحيح — المتاح: تأكيد أو رفض الإثبات', 422)
    }
    if (action === 'REJECT' && !note) {
      return jsonError('سبب رفض الإثبات مطلوب ليظهر للمرشح', 422)
    }

    const transaction = await db.opportunityTransaction.findUnique({
      where: { id: transactionId },
      include: {
        opportunity: {
          select: {
            id: true,
            title: true,
            createdById: true,
            selections: {
              select: { id: true, candidateId: true },
            },
          },
        },
      },
    })
    if (!transaction) throw new ApiError('العملية المالية غير موجودة', 404)
    if (!transaction.paymentProofUrl) {
      throw new ApiError('لا يوجد إثبات دفع مرفوع لهذه العملية', 409)
    }
    if (!['PENDING', 'AWAITING_PAYMENT'].includes(transaction.status)) {
      throw new ApiError('تمت معالجة هذه العملية مسبقاً — حدّث القائمة', 409)
    }

    const candidateId = transaction.opportunity.selections.find((s) => s.id === transaction.selectionId)?.candidateId ?? null

    if (action === 'CONFIRM') {
      const updated = await db.opportunityTransaction.update({
        where: { id: transaction.id },
        data: {
          status: 'PAID',
          paidAt: transaction.paidAt ?? new Date(),
          note: transaction.note,
        },
      })

      await logForsahAudit({
        actorId: session.user.id,
        actorRole: 'ADMIN',
        action: 'PAYMENT_CONFIRMED',
        entityType: 'Transaction',
        entityId: transaction.id,
        meta: {
          feeAmount: updated.feeAmount,
          proofFileName: transaction.paymentProofFileName,
          opportunityId: transaction.opportunity.id,
        },
      })

      // ---------- الجولة 75: استحقاق الإحالة عند تأكيد رسوم «فرصة» (إضافي بحت) ----------
      // يُحتسب مرة واحدة فقط لكل عملية مالية (قيد فريد على مستوى القاعدة)
      try {
        const { onReferralOpportunityFeePaid } = await import('@/lib/referrals')
        await onReferralOpportunityFeePaid({
          transactionId: updated.id,
          candidateId,
          platformFeeAmount: updated.feeAmount,
          baseValue: updated.baseAmount,
          currency: updated.currency,
          opportunityTitle: transaction.opportunity.title,
        })
      } catch (referralError) {
        console.error('referral opportunity hook skipped:', referralError)
      }

      // إشعار المرشح — البطاقة الحاجبة تُرفع عنه تلقائياً بعد التأكيد
      if (candidateId) {
        const link = '/nurse/opportunities'
        await notify(candidateId, {
          title: 'تأكدت إدارة المنصة استلام رسوم الخدمة',
          body: `فرصة «${transaction.opportunity.title}» — تم تأكيد دفع الرسوم (${updated.feeAmount.toLocaleString('ar-YE')} ${updated.currency}) — شكراً لالتزامك`,
          type: 'OPPORTUNITY_PAYMENT_CONFIRMED',
          link,
        })
      }
      // إشعار HR المالك — الرسوم سُددت
      if (transaction.opportunity.createdById !== session.user.id) {
        await notify(transaction.opportunity.createdById, {
          title: 'سُددت رسوم الخدمة لفرصتك',
          body: `«${transaction.opportunity.title}» — أكدت الإدارة استلام رسوم المرشح (${updated.feeAmount.toLocaleString('ar-YE')} ${updated.currency}) — مستحقك: ${updated.hrCommissionAmount.toLocaleString('ar-YE')}`,
          type: 'OPPORTUNITY_PAYMENT_COMPLETED',
          link: '/hr/financials',
        })
      }

      return NextResponse.json({
        message: `تم تأكيد الدفع — العملية الآن «${OPPORTUNITY_TRANSACTION_STATUS_LABELS[updated.status]}» وارتفعت البطاقة عن المرشح`,
      })
    }

    // REJECT — رفض الإثبات: تُمسح حقول الإثبات ويمكن للمرشح إعادة الرفع
    const updated = await db.opportunityTransaction.update({
      where: { id: transaction.id },
      data: {
        paymentProofUrl: null,
        paymentProofFileName: null,
        paymentProofUploadedAt: null,
        paymentProofRejectedAt: new Date(),
        paymentProofRejectionNote: note,
      },
    })

    await logForsahAudit({
      actorId: session.user.id,
      actorRole: 'ADMIN',
      action: 'PAYMENT_PROOF_REJECTED',
      entityType: 'Transaction',
      entityId: transaction.id,
      meta: {
        rejectedFileName: transaction.paymentProofFileName,
        note,
        opportunityId: transaction.opportunity.id,
      },
    })

    if (candidateId) {
      await notify(candidateId, {
        title: 'رُفض إثبات دفع رسوم الخدمة — أعد الرفع',
        body: `فرصة «${transaction.opportunity.title}» — السبب: ${note} — يمكنك رفع إثبات جديد من بطاقة السداد`,
        type: 'OPPORTUNITY_PAYMENT_PROOF_REJECTED',
        link: '/nurse/opportunities',
      })
    }

    return NextResponse.json({
      message: 'رُفض الإثبات — حُذفت الصورة وأُشعر المرشح بالسبب ويمكنه رفع إثبات جديد',
      feeAmount: updated.feeAmount,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
