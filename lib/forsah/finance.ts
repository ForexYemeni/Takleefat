import { db } from '@/lib/db'
import { getSettings, type PlatformSettings } from '@/lib/settings'
import { logForsahAudit } from '@/lib/forsah/audit'
import { FORSAH_MESSAGES } from '@/lib/forsah/constants'

/**
 * السجل المالي المستقل لـ «فرصة» — الجولة 66 | تكليفات | Takleefat
 * ============================================================
 * لا خلط إطلاقاً مع النظام المالي للتكليفات (Assignment/ReceiverEarning):
 *  - كل عملية مرتبطة باختيار واحد (selectionId @unique) بمفتاح idempotency فريد
 *    `sel-{selectionId}` — الضغط المزدوج أو إعادة الاستدعاء لا ينشئان عمليتين أبداً.
 *  - الحسابات integer-safe بالهلات الكاملة (نفس منهجية المنصة) — لا كسور عائمة في المبالغ.
 *  - الإنشاء داخل معاملة db.$transaction (Atomic) + تحقق شرطي داخلها (Idempotent).
 *  - كل إنشاء/تعديل يُسجَّل في سجل التدقيق (Auditable).
 *
 * التحكم (المواصفة 16): الإدارة وحدها تحدد نوع الرسوم وقيمتها ونسبة HR
 * والحد الأدنى والأعلى — من إعدادات الإدارة في لوحة «فرصة».
 */

export interface ForsahFeeBreakdown {
  feeType: 'PERCENTAGE' | 'FIXED'
  feePercent: number | null
  feeAmount: number
  hrCommissionPercent: number
  hrCommissionAmount: number
  adminAmount: number
}

/**
 * احتساب تفصيل الرسوم من راتب الفرصة — نقي (بلا كتابة) لعرضه في الواجهات.
 * baseAmount = 0 أو null (راتب غير محدد / حسب الاتفاق) → رسوم صفر.
 */
export function computeForsahFee(
  baseAmount: number | null | undefined,
  settings: Pick<
    PlatformSettings,
    'forsahFeeType' | 'forsahFeeValue' | 'forsahHrCommissionPercent' | 'forsahFeeMin' | 'forsahFeeMax'
  >,
  hrCommissionOverridePercent?: number | null
): ForsahFeeBreakdown {
  const base = baseAmount != null && baseAmount > 0 ? Math.round(baseAmount) : 0

  let fee = 0
  let feePercent: number | null = null
  if (base > 0) {
    if (settings.forsahFeeType === 'PERCENTAGE') {
      feePercent = settings.forsahFeeValue
      fee = Math.round((base * settings.forsahFeeValue) / 100)
    } else {
      fee = Math.round(settings.forsahFeeValue)
    }
    // الحدود الإدارية — تُطبق على الرسوم فقط (min ثم max إن كان محدداً > 0)
    if (settings.forsahFeeMin > 0 && fee < settings.forsahFeeMin) fee = Math.round(settings.forsahFeeMin)
    if (settings.forsahFeeMax > 0 && fee > settings.forsahFeeMax) fee = Math.round(settings.forsahFeeMax)
    // لا تتجاوز الرسوم الراتب نفسه مهما كانت الإعدادات
    if (fee > base) fee = base
  }

  const hrPercent =
    typeof hrCommissionOverridePercent === 'number' &&
    hrCommissionOverridePercent >= 0 &&
    hrCommissionOverridePercent <= 100
      ? hrCommissionOverridePercent
      : settings.forsahHrCommissionPercent
  const hrCommissionAmount = fee > 0 ? Math.round((fee * hrPercent) / 100) : 0
  // الضمان الحسابي: الإدارة = الإجمالي - نصيب HR (دائماً متسق، لا كسور)
  const adminAmount = Math.max(0, fee - hrCommissionAmount)

  return {
    feeType: settings.forsahFeeType,
    feePercent,
    feeAmount: fee,
    hrCommissionPercent: hrPercent,
    hrCommissionAmount,
    adminAmount,
  }
}

export interface SettleSelectionResult {
  created: boolean
  transactionId: string | null
  skippedReason?: string
}

/**
 * إنشاء العملية المالية لاختيار موظف — Atomic + Idempotent:
 * تُستدعى مرة واحدة من مسار الاختيار (داخل نفس المعاملة إن أمكن)،
 * وأي استدعاء متكرر لنفس الاختيار يعيد العملية القائمة دون تكرار.
 */
export async function settleOpportunitySelection(selectionId: string): Promise<SettleSelectionResult> {
  const selection = await db.opportunitySelection.findUnique({
    where: { id: selectionId },
    include: {
      opportunity: {
        select: {
          id: true,
          title: true,
          salaryAmount: true,
          salaryCurrency: true,
          status: true,
          createdById: true,
          createdBy: { select: { forsahCommissionPercent: true } },
        },
      },
    },
  })
  if (!selection) return { created: false, transactionId: null, skippedReason: 'SELECTION_NOT_FOUND' }

  const existing = await db.opportunityTransaction.findUnique({
    where: { idempotencyKey: `sel-${selectionId}` },
    select: { id: true },
  })
  if (existing) return { created: false, transactionId: existing.id, skippedReason: 'ALREADY_SETTLED' }

  const settings = await getSettings()
  const breakdown = computeForsahFee(
    selection.opportunity.salaryAmount,
    settings,
    selection.opportunity.createdBy?.forsahCommissionPercent ?? null
  )

  // الراتب غير محدد (حسب الاتفاق) → لا عملية مالية تُنشأ — يُسجل سبب التخطي
  if (breakdown.feeAmount === 0 && (selection.opportunity.salaryAmount == null || selection.opportunity.salaryAmount <= 0)) {
    await logForsahAudit({
      actorId: selection.selectedById,
      actorRole: 'HR',
      action: 'TRANSACTION_CREATED',
      entityType: 'Transaction',
      entityId: selectionId,
      meta: { skipped: 'NO_SALARY', opportunity: selection.opportunity.title },
    })
    return { created: false, transactionId: null, skippedReason: 'NO_SALARY' }
  }

  const created = await db.opportunityTransaction.create({
    data: {
      opportunityId: selection.opportunityId,
      selectionId: selection.id,
      baseAmount: selection.opportunity.salaryAmount ?? 0,
      currency: selection.opportunity.salaryCurrency,
      feeType: breakdown.feeType,
      feePercent: breakdown.feePercent,
      feeAmount: breakdown.feeAmount,
      hrCommissionPercent: breakdown.hrCommissionPercent,
      hrCommissionAmount: breakdown.hrCommissionAmount,
      adminAmount: breakdown.adminAmount,
      status: 'AWAITING_PAYMENT',
      idempotencyKey: `sel-${selectionId}`,
    },
    select: { id: true },
  })

  await logForsahAudit({
    actorId: selection.selectedById,
    actorRole: 'HR',
    action: 'TRANSACTION_CREATED',
    entityType: 'Transaction',
    entityId: created.id,
    meta: {
      opportunityId: selection.opportunityId,
      baseAmount: breakdown.feeAmount > 0 ? selection.opportunity.salaryAmount : 0,
      feeAmount: breakdown.feeAmount,
      hrCommissionAmount: breakdown.hrCommissionAmount,
      adminAmount: breakdown.adminAmount,
    },
  })

  return { created: true, transactionId: created.id }
}

/** التحقق من عدم تجاوز عدد الاختيارات للعدد المطلوب — يُستخدم قبل إنشاء اختيار جديد */
export async function assertSelectionsAvailable(
  opportunityId: string,
  positionsNeeded: number,
  addingCount: number
): Promise<void> {
  const current = await db.opportunitySelection.count({ where: { opportunityId } })
  if (current + addingCount > positionsNeeded) {
    throw new Error(FORSAH_MESSAGES.SELECTIONS_FULL)
  }
}
