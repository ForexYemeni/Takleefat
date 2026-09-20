import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError, ApiError } from '@/lib/api-helpers'
import { assertForsahEnabled, assertOpportunityOwnership, requireForsahPermission } from '@/lib/forsah/server'
import { OPPORTUNITY_TRANSACTION_STATUS_LABELS, FORSAH_MESSAGES } from '@/lib/forsah/constants'
import { logForsahAudit } from '@/lib/forsah/audit'
import { notify } from '@/lib/notifications'

/**
 * مسار العملية المالية للفرصة — الجولة 66 | ميزة «فرصة» (المواصفة 16/17)
 * ============================================================
 * GET   /api/opportunities/[id]/transaction — العملية المالية للفرصة
 *       (HR بصلاحية viewFinancials — يرى مستحقه هو — / الإدارة ترى الكل)
 * PATCH /api/opportunities/[id]/transaction — تحديث الحالة (الإدارة حصراً):
 *       كل حالات المواصفة 17 (PAID / PARTIALLY_PAID / FAILED / CANCELLED /
 *       REFUNDED / COMPLETED) — كل تغيير يُسجَّل تدقيقاً ويُشعر HR.
 *       لا إنشاء يدوي إطلاقاً — العمليات تُنشأ آلياً من الاختيار فقط (لا تكرار).
 */
const EDITABLE_STATUSES = ['PENDING', 'AWAITING_PAYMENT', 'PAID', 'PARTIALLY_PAID', 'FAILED', 'CANCELLED', 'REFUNDED', 'COMPLETED'] as const

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('HR', 'ADMIN')
    const actor = await requireForsahPermission(session, 'opportunity.viewFinancials')
    // الجولة 67: الإغلاق الكلي — الإدارة مستثناة
    await assertForsahEnabled(actor.role)
    const { id } = await params

    const opportunity = await db.opportunity.findUnique({
      where: { id },
      select: { id: true, title: true, createdById: true },
    })
    if (!opportunity) throw new ApiError(FORSAH_MESSAGES.NOT_AVAILABLE, 404)
    await assertOpportunityOwnership(opportunity, actor)

    const transactions = await db.opportunityTransaction.findMany({
      where: { opportunityId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        opportunity: { select: { id: true, title: true, number: true } },
      },
    })

    return NextResponse.json({ transactions, opportunity: { id: opportunity.id, title: opportunity.title } })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // الإدارة وحدها تُعدّل العمليات المالية — HR يعرضها فقط (المواصفة 16)
    const session = await requireRole('ADMIN')
    const { id } = await params
    await requireForsahPermission(session, 'opportunity.manage')

    const body = await req.json().catch(() => ({}))
    const txId = String(body?.transactionId ?? '')
    const status = String(body?.status ?? '')
    const note = typeof body?.note === 'string' ? body.note.slice(0, 500) : null
    if (!txId) return jsonError('معرف العملية مطلوب', 422)
    if (!EDITABLE_STATUSES.includes(status as (typeof EDITABLE_STATUSES)[number])) {
      return jsonError('حالة العملية غير صحيحة', 422)
    }

    const transaction = await db.opportunityTransaction.findUnique({
      where: { id: txId },
      include: { opportunity: { select: { id: true, title: true, createdById: true } } },
    })
    if (!transaction) throw new ApiError('العملية المالية غير موجودة', 404)
    if (transaction.opportunityId !== id) return jsonError('العملية لا تنتمي لهذه الفرصة', 422)

    const isPaying = status === 'PAID' || status === 'COMPLETED'
    const updated = await db.opportunityTransaction.update({
      where: { id: txId },
      data: {
        status: status as (typeof EDITABLE_STATUSES)[number],
        note: note ?? transaction.note,
        paidAt: isPaying ? (transaction.paidAt ?? new Date()) : transaction.paidAt,
      },
    })

    await logForsahAudit({
      actorId: session.user.id,
      actorRole: 'ADMIN',
      action: 'TRANSACTION_UPDATED',
      entityType: 'Transaction',
      entityId: txId,
      meta: { from: transaction.status, to: status, feeAmount: updated.feeAmount },
    })

    // إشعار HR المالك بحالة مستحقه (PAYMENT_COMPLETED / PAYMENT_PENDING)
    if (transaction.opportunity.createdById !== session.user.id) {
      await notify(transaction.opportunity.createdById, {
        title: isPaying ? 'سُددت عملية مالية لفرصتك' : 'تحديث على عملية مالية',
        body: `«${transaction.opportunity.title}» — الحالة: ${OPPORTUNITY_TRANSACTION_STATUS_LABELS[updated.status]} — مستحقك: ${updated.hrCommissionAmount.toLocaleString('ar-YE')}`,
        type: isPaying ? 'OPPORTUNITY_PAYMENT_COMPLETED' : 'OPPORTUNITY_PAYMENT_PENDING',
        link: `/hr/financials`,
      })
    }

    return NextResponse.json({ message: `حُدّثت حالة العملية إلى «${OPPORTUNITY_TRANSACTION_STATUS_LABELS[updated.status]}»`, transaction: updated })
  } catch (error) {
    return handleApiError(error)
  }
}
