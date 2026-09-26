import { randomBytes } from 'crypto'
import { db } from '@/lib/db'
import { notify, notifyAdmins } from '@/lib/notifications'
import type { ReferralSettings } from '@prisma/client'
import {
  REFERRAL_ELIGIBLE_ROLES,
  isReferralEligibleRole,
  referralPercentForRolePure,
  REFERRAL_COOKIE,
  REFERRAL_COOKIE_MAX_AGE,
  REFERRAL_STATUS_LABELS,
  REFERRAL_REWARD_STATUS_LABELS,
  REFERRAL_SOURCE_LABELS,
  REFERRAL_ORIGIN_LABELS,
  REFERRAL_AUDIT_ACTION_LABELS,
} from '@/lib/referral-labels'

// الثوابت والتسميات الحقة في lib/referral-labels (نقية آمنة للعميل) —
// يُعاد تصديرها هنا للتوافق مع مستوردي الخادم دون تكرار مصدر الحقيقة
export {
  REFERRAL_ELIGIBLE_ROLES,
  isReferralEligibleRole,
  referralPercentForRolePure as referralPercentForRole,
  REFERRAL_COOKIE,
  REFERRAL_COOKIE_MAX_AGE,
  REFERRAL_STATUS_LABELS,
  REFERRAL_REWARD_STATUS_LABELS,
  REFERRAL_SOURCE_LABELS,
  REFERRAL_ORIGIN_LABELS,
  REFERRAL_AUDIT_ACTION_LABELS,
}
export type { ReferralEligibleRole } from '@/lib/referral-labels'

/**
 * برنامج إحالة تكليفات — الجولة 75 | تكليفات | Takleefat
 * ============================================================
 * محرك الإحالة الإضافي البحت فوق النظام القائم:
 * - كل المنطق الحساسي Backend حصراً — لا حساب استحقاق في الواجهة أبداً.
 * - لا استحقاق إلا بعد تأكيد وصول رسوم العملية فعلياً (تكليف/فرصة)
 *   عبر الخطافات onReferralAssignmentFeePaid / onReferralOpportunityFeePaid.
 * - منع التكرار مضمون بمفتاح فريد على مستوى القاعدة @@unique([originType, originId]).
 * - لا محافظ ولا سحب نقدي: المزايا سجل محاسبي (Ledger) يُستخدم كخصم من
 *   رسوم المنصة بقرار إداري موثق فقط.
 * - كل الخطافات لا تفشل العملية الأساسية أبداً (try/catch + سجل أخطاء)
 *   — نفس فلسفة الإشعارات وسجل تدقيق «فرصة».
 */

export type { ReferralSettings }

// ---------- الإعدادات ----------

/** الافتراضيات الآمنة — مطابقة لافتراضيات المخطط (تُستخدم قبل إنشاء السجل) */
export const REFERRAL_SETTINGS_DEFAULTS: ReferralSettings = {
  id: 'singleton',
  enabled: true,
  percentNURSE: 10,
  percentDOCTOR: 10,
  percentDOCTOR_SUPERVISOR: 10,
  percentRECEIVER: 10,
  percentHR: 10,
  maxRewardPerReferral: 0,
  maxInvitesPerReferrer: 200,
  minOperationValue: 0,
  validityDays: 180,
  includeAssignments: true,
  includeOpportunities: true,
  rewardsRequireReview: false,
  policyNote: null,
  updatedAt: new Date(),
}

/** قراءة إعدادات برنامج الإحالة — غياب السجل أو أي خطأ = الافتراضيات الآمنة */
export async function getReferralSettings(): Promise<ReferralSettings> {
  try {
    const row = await db.referralSettings.findUnique({ where: { id: 'singleton' } })
    return row ?? { ...REFERRAL_SETTINGS_DEFAULTS }
  } catch {
    return { ...REFERRAL_SETTINGS_DEFAULTS }
  }
}

// ---------- سجل التدقيق ----------

export async function logReferralAudit(input: {
  actorId?: string | null
  actorRole: string
  action: string
  entityType: 'Referral' | 'ReferralCode' | 'ReferralReward' | 'ReferralTransaction' | 'User' | 'Settings' | 'Assignment' | 'OpportunityTransaction'
  entityId: string
  meta?: unknown
}): Promise<void> {
  try {
    await db.referralAuditLog.create({
      data: {
        actorId: input.actorId ?? null,
        actorRole: input.actorRole,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        meta: input.meta != null ? JSON.stringify(input.meta).slice(0, 4000) : null,
      },
    })
  } catch (error) {
    console.error('logReferralAudit failed:', error)
  }
}

// ---------- كود الإحالة الشخصي ----------

/** ألفباء الكود — بلا أحرف ملتبسة (I/L/O/0/1) */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function generateCodeToken(length = 6): string {
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  }
  return out
}

/**
 * ضمان وجود كود إحالة فريد للمستخدم — يُنشأ مرة واحدة مدى الحياة.
 * آمن مع التزامن: محاولة إنشاء مكرر تُعالج بقراءة الموجود (P2002).
 */
export async function ensureReferralCode(userId: string) {
  const existing = await db.referralCode.findUnique({ where: { userId } })
  if (existing) return existing

  for (let attempt = 0; attempt < 6; attempt++) {
    const code = `TKF-${generateCodeToken()}`
    try {
      const created = await db.referralCode.create({ data: { userId, code } })
      await logReferralAudit({
        actorId: userId,
        actorRole: 'SYSTEM',
        action: 'REFERRAL_CODE_CREATED',
        entityType: 'ReferralCode',
        entityId: created.id,
        meta: { code },
      })
      return created
    } catch (error) {
      const isDuplicate =
        typeof error === 'object' &&
        error !== null &&
        (error as { code?: string }).code === 'P2002'
      if (!isDuplicate) throw error
      // تعارض كود أو كود قائم بالفعل لمالك آخر — نعيد المحاولة أو نقرأ الموجود
      const raceOwner = await db.referralCode.findUnique({ where: { userId } })
      if (raceOwner) return raceOwner
    }
  }
  throw new Error('تعذر توليد كود إحالة فريد — أعد المحاولة')
}

// ---------- ربط الإحالة عند التسجيل ----------

/**
 * ربط المُحال الجديد بالإحالة — يُستدعى حصراً من مسار التسجيل بعد إنشاء الحساب.
 * المصدران:
 * 1) كوكي رابط الدعوة (refCode) — إن كان صالحاً ونشطاً ولم يكن إحالة ذاتية.
 * 2) مطابقة الدعوة المباشرة برقم الهاتف (آخر دعوة معلقة بنفس الرقم).
 * لا يعطل التسجيل أبداً — أي فشل يُسجل ولا يُرمى.
 */
export async function bindReferralOnRegistration(
  referredUserId: string,
  referredPhone: string,
  refCode: string | null
): Promise<void> {
  try {
    // سبق أن رُبط هذا الحساب بإحالة؟ (ضمان إضافي فوق القيد الفريد)
    const alreadyBound = await db.referral.findUnique({ where: { referredId: referredUserId } })
    if (alreadyBound) return

    // ---------- المصدر 1: رابط الدعوة ----------
    if (refCode) {
      const codeRow = await db.referralCode.findUnique({
        where: { code: refCode },
        include: { user: { select: { id: true, role: true, status: true } } },
      })
      if (
        codeRow &&
        codeRow.isActive &&
        codeRow.userId !== referredUserId && // منع الإحالة الذاتية
        codeRow.user.status === 'APPROVED' &&
        isReferralEligibleRole(codeRow.user.role)
      ) {
        const created = await db.referral
          .create({
            data: {
              referrerId: codeRow.userId,
              referredId: referredUserId,
              codeId: codeRow.id,
              source: 'LINK',
              status: 'REGISTERED',
              registeredAt: new Date(),
            },
          })
          .catch(() => null)
        if (created) {
          await logReferralAudit({
            actorId: referredUserId,
            actorRole: 'SYSTEM',
            action: 'REFERRAL_BOUND_LINK',
            entityType: 'Referral',
            entityId: created.id,
            meta: { code: refCode, referrerId: codeRow.userId },
          })
          await notify(codeRow.userId, {
            title: 'تم تسجيل شخص من خلال رابط دعوتك',
            body: 'سجّل كادر جديد في تكليفات عبر رابط دعوتك الشخصي — سيُشعَرك النظام فور توثيق حسابه وكل تحديث لاحق.',
            type: 'REFERRAL_REGISTERED',
            link: '/referrals',
          })
          return
        }
      }
    }

    // ---------- المصدر 2: الدعوة المباشرة بمطابقة الهاتف ----------
    const direct = await db.referral.findFirst({
      where: { invitedPhone: referredPhone, referredId: null, status: 'INVITED' },
      orderBy: { createdAt: 'desc' },
    })
    if (direct && direct.referrerId !== referredUserId) {
      const referrer = await db.user.findUnique({
        where: { id: direct.referrerId },
        select: { id: true, role: true, status: true },
      })
      if (referrer && referrer.status === 'APPROVED' && isReferralEligibleRole(referrer.role)) {
        const settings = await getReferralSettings()
        // صلاحية الدعوة المباشرة: يجب التسجيل خلال validityDays من إنشائها (0 = بلا مدة)
        const expired =
          settings.validityDays > 0 &&
          Date.now() - direct.createdAt.getTime() > settings.validityDays * 86_400_000
        if (!expired) {
          await db.referral
            .update({
              where: { id: direct.id },
              data: { referredId: referredUserId, status: 'REGISTERED', registeredAt: new Date() },
            })
            .catch(() => null)
          await logReferralAudit({
            actorId: referredUserId,
            actorRole: 'SYSTEM',
            action: 'REFERRAL_BOUND_DIRECT',
            entityType: 'Referral',
            entityId: direct.id,
            meta: { referrerId: direct.referrerId, phone: referredPhone },
          })
          await notify(direct.referrerId, {
            title: 'تم تسجيل شخص من خلال دعوتك',
            body: `${direct.invitedName ?? 'الشخص الذي دعوتَه'} سجّل في تكليفات برقم الهاتف الذي دعوتَه به — سيصلك إشعار فور توثيق حسابه.`,
            type: 'REFERRAL_REGISTERED',
            link: '/referrals',
          })
        }
      }
    }
  } catch (error) {
    console.error('bindReferralOnRegistration failed:', error)
  }
}

// ---------- خطاف التوثيق (اعتماد الحساب) ----------

/**
 * تحديث حالة الإحالة إلى «موثق» عند اعتماد حساب المُحال من الإدارة.
 * يُستدعى حصراً من مسار مراجعة الحسابات (PATCH /api/admin/users/[id]) بعد الاعتماد.
 */
export async function onReferralReferredVerified(referredUserId: string): Promise<void> {
  try {
    const referral = await db.referral.findFirst({
      where: { referredId: referredUserId, status: 'REGISTERED' },
    })
    if (!referral) return

    await db.referral.update({
      where: { id: referral.id },
      data: { status: 'VERIFIED', verifiedAt: new Date() },
    })
    await logReferralAudit({
      actorId: referredUserId,
      actorRole: 'SYSTEM',
      action: 'REFERRAL_VERIFIED',
      entityType: 'Referral',
      entityId: referral.id,
    })
    await notify(referral.referrerId, {
      title: 'تم توثيق الحساب الذي دعوتَه',
      body: 'اعتُمد حساب الكادر الذي دعوتَه وأُكمل توثيقه — عند حصوله على تكليف أو فرصة مؤهلة تُحتسب مزايا إحالتك تلقائياً.',
      type: 'REFERRAL_VERIFIED',
      link: '/referrals',
    })
  } catch (error) {
    console.error('onReferralReferredVerified failed:', error)
  }
}

// ---------- الاحتساب المشترك ----------

interface AccrualInput {
  referredUserId: string
  originType: 'ASSIGNMENT' | 'OPPORTUNITY'
  originId: string
  originLabel: string
  baseValue: number
  platformFeeAmount: number
  currency: string
}

/**
 * احتساب ميزة الإحالة — Backend حصراً، يُستدعى فقط بعد تأكيد وصول الرسوم فعلياً.
 * الشروط كلها هنا: النظام مفعّل، النوع مشمول، الإحالة موثقة، الصلاحية سارية،
 * الحد الأدنى مستوفى، المُحيل مؤهل ومعتمد، النسبة > 0، الرسوم > 0.
 * منع التكرار النهائي بقيد فريد على (originType, originId).
 */
async function accrueReferralReward(input: AccrualInput): Promise<void> {
  const settings = await getReferralSettings()
  const skip = (reason: string) =>
    logReferralAudit({
      actorId: null,
      actorRole: 'SYSTEM',
      action: 'REFERRAL_REWARD_SKIPPED',
      entityType: input.originType === 'ASSIGNMENT' ? 'Assignment' : 'OpportunityTransaction',
      entityId: input.originId,
      meta: { reason, originLabel: input.originLabel },
    })

  if (!settings.enabled) return
  if (input.originType === 'ASSIGNMENT' && !settings.includeAssignments) return
  if (input.originType === 'OPPORTUNITY' && !settings.includeOpportunities) return

  const referral = await db.referral.findFirst({
    where: { referredId: input.referredUserId, status: { in: ['VERIFIED', 'REWARDED'] } },
  })
  if (!referral) {
    await skip('لا توجد إحالة موثقة لهذا المستخدم')
    return
  }

  // صلاحية الاستحقاق: العملية يجب أن تحدث خلال validityDays من تسجيل المُحال (0 = بلا مدة)
  if (settings.validityDays > 0 && referral.registeredAt) {
    const deadline = referral.registeredAt.getTime() + settings.validityDays * 86_400_000
    if (Date.now() > deadline) {
      await skip('انتهت مدة صلاحية الإحالة')
      return
    }
  }

  // الحد الأدنى لقيمة العملية
  if (settings.minOperationValue > 0 && input.baseValue < settings.minOperationValue) {
    await skip(`قيمة العملية أقل من الحد الأدنى (${settings.minOperationValue})`)
    return
  }

  // أهلية المُحيل (دور من الأدوار الخمسة + حساب معتمد)
  const referrer = await db.user.findUnique({
    where: { id: referral.referrerId },
    select: { id: true, role: true, status: true },
  })
  if (!referrer || !isReferralEligibleRole(referrer.role) || referrer.status !== 'APPROVED') {
    await skip('المُحيل غير مؤهل أو غير معتمد')
    return
  }

  const percent = referralPercentForRolePure(settings, referrer.role)
  if (percent <= 0) {
    await skip('نسبة الإحالة صفر لهذا الدور')
    return
  }
  if (input.platformFeeAmount <= 0) {
    await skip('لا توجد رسوم منصة محصلة على العملية')
    return
  }

  let amount = Math.round((input.platformFeeAmount * percent) / 100)
  if (settings.maxRewardPerReferral > 0) {
    amount = Math.min(amount, settings.maxRewardPerReferral)
  }
  if (amount <= 0) {
    await skip('قيمة الاستحقاق المحسوبة صفر')
    return
  }

  try {
    const reward = await db.referralReward.create({
      data: {
        referralId: referral.id,
        referrerId: referrer.id,
        originType: input.originType,
        originId: input.originId,
        originLabel: input.originLabel,
        baseValue: input.baseValue,
        platformFeeAmount: input.platformFeeAmount,
        currency: input.currency,
        percent,
        amount,
        status: settings.rewardsRequireReview ? 'PENDING_REVIEW' : 'ACCRUED',
      },
    })

    await db.referral.update({
      where: { id: referral.id },
      data: { status: 'REWARDED', firstRewardAt: referral.firstRewardAt ?? new Date() },
    })

    await logReferralAudit({
      actorId: null,
      actorRole: 'SYSTEM',
      action: 'REFERRAL_REWARD_ACCRUED',
      entityType: input.originType === 'ASSIGNMENT' ? 'Assignment' : 'OpportunityTransaction',
      entityId: input.originId,
      meta: {
        rewardId: reward.id,
        referrerId: referrer.id,
        referralId: referral.id,
        platformFeeAmount: input.platformFeeAmount,
        percent,
        amount,
        currency: input.currency,
        status: reward.status,
      },
    })

    await notify(referrer.id, {
      title: 'تم احتساب مزايا إحالة جديدة لك',
      body: `${input.originLabel} — استحقاق ${amount.toLocaleString('ar-YE')} ${input.currency} (${percent}٪ من رسوم المنصة المحصلة). تُستخدم مزايا الإحالة كخصم على رسوم المنصة وفق سياسة تكليفات، ولا تمثل رصيداً نقدياً قابلاً للسحب.`,
      type: 'REFERRAL_REWARD_ACCRUED',
      link: '/referrals',
    })

    if (settings.rewardsRequireReview) {
      await notifyAdmins({
        title: 'ميزة إحالة بانتظار المراجعة',
        body: `${input.originLabel} — استحقاق ${amount.toLocaleString('ar-YE')} ${input.currency} للمُحيل — راجعه من «إدارة الإحالات» لاعتماده أو إلغائه.`,
        link: '/admin/referrals',
      })
    }
  } catch (error) {
    // المفتاح الفريد (originType, originId) موجود مسبقاً → حُسب هذا الأصل قبل ذلك — آمن
    const isDuplicate =
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === 'P2002'
    if (!isDuplicate) throw error
  }
}

// ---------- الخطافات الثلاثة (تُستدعى من مسارات النظام القائمة دون تعديل سلوكها) ----------

/**
 * خطاف دفع رسوم التكليف — يُستدعى بعد تأكيد الإدارة دفع الرسوم وتوزيعها.
 * رسوم المنصة المحصلة = adminFee المحدث للتكليف (قراءة طازجة بعد التسوية).
 */
export async function onReferralAssignmentFeePaid(assignmentId: string): Promise<void> {
  try {
    const fresh = await db.assignment.findUnique({
      where: { id: assignmentId },
      select: { id: true, nurseId: true, value: true, adminFee: true, title: true, paymentStatus: true },
    })
    if (!fresh || fresh.paymentStatus !== 'PAID') return
    await accrueReferralReward({
      referredUserId: fresh.nurseId,
      originType: 'ASSIGNMENT',
      originId: fresh.id,
      originLabel: `تكليف: ${fresh.title}`,
      baseValue: fresh.value ?? 0,
      platformFeeAmount: fresh.adminFee ?? 0,
      currency: 'YER',
    })
  } catch (error) {
    console.error('onReferralAssignmentFeePaid failed:', error)
  }
}

/**
 * خطاف تأكيد رسوم «فرصة» — يُستدعى عند تأكيد الإدارة وصول دفعة رسوم الخدمة.
 * رسوم المنصة المحصلة = feeAmount للعملية المالية.
 */
export async function onReferralOpportunityFeePaid(input: {
  transactionId: string
  candidateId: string | null
  platformFeeAmount: number
  baseValue: number
  currency: string
  opportunityTitle: string
}): Promise<void> {
  try {
    if (!input.candidateId) return
    await accrueReferralReward({
      referredUserId: input.candidateId,
      originType: 'OPPORTUNITY',
      originId: input.transactionId,
      originLabel: `فرصة: ${input.opportunityTitle}`,
      baseValue: input.baseValue,
      platformFeeAmount: input.platformFeeAmount,
      currency: input.currency,
    })
  } catch (error) {
    console.error('onReferralOpportunityFeePaid failed:', error)
  }
}

// ---------- ملخص المزايا (Ledger — لا محفظة ولا سحب) ----------

export interface ReferralBenefitsSummary {
  totalAccrued: number
  used: number
  remaining: number
  pendingReview: number
}

export async function getReferralBenefits(referrerId: string): Promise<ReferralBenefitsSummary> {
  try {
    const [eligible, pending, usedAgg] = await Promise.all([
      db.referralReward.aggregate({
        where: { referrerId, status: { in: ['ACCRUED', 'PARTIALLY_USED', 'USED'] } },
        _sum: { amount: true },
      }),
      db.referralReward.aggregate({
        where: { referrerId, status: 'PENDING_REVIEW' },
        _sum: { amount: true },
      }),
      db.referralTransaction.aggregate({ where: { referrerId }, _sum: { amount: true } }),
    ])
    const totalAccrued = eligible._sum.amount ?? 0
    const used = usedAgg._sum.amount ?? 0
    return {
      totalAccrued,
      used,
      remaining: Math.max(0, totalAccrued - used),
      pendingReview: pending._sum.amount ?? 0,
    }
  } catch (error) {
    console.error('getReferralBenefits failed:', error)
    return { totalAccrued: 0, used: 0, remaining: 0, pendingReview: 0 }
  }
}

/**
 * تسجيل استخدام مزايا (خصم من رسوم المنصة) — إدارة حصراً.
 * يوزع المبلغ على المزايا المتاحة بالأقدم أولاً (FIFO) ويحدّث حالاتها،
 * ويرفض إن تجاوز المتبقي — لا قيم سلبية ولا رصيد وهمي أبداً.
 */
export async function recordReferralBenefitsUsage(input: {
  referrerId: string
  amount: number
  note?: string
  createdById: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const amount = Math.round(input.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'قيمة الخصم يجب أن تكون رقماً موجباً' }
  }

  const benefits = await getReferralBenefits(input.referrerId)
  if (amount > benefits.remaining) {
    return {
      ok: false,
      error: `المبلغ يتجاوز المتبقي من المزايا (${benefits.remaining.toLocaleString('ar-YE')})`,
    }
  }

  const transaction = await db.referralTransaction.create({
    data: {
      referrerId: input.referrerId,
      amount,
      note: input.note?.trim().slice(0, 300) || null,
      createdById: input.createdById,
    },
  })

  // توزيع FIFO على المزايا المتاحة
  let remainingToAllocate = amount
  const rewards = await db.referralReward.findMany({
    where: { referrerId: input.referrerId, status: { in: ['ACCRUED', 'PARTIALLY_USED'] } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, amount: true, usedAmount: true },
  })
  for (const reward of rewards) {
    if (remainingToAllocate <= 0) break
    const capacity = reward.amount - reward.usedAmount
    if (capacity <= 0) continue
    const take = Math.min(capacity, remainingToAllocate)
    const newUsed = reward.usedAmount + take
    const status = newUsed >= reward.amount ? 'USED' : 'PARTIALLY_USED'
    await db.referralReward.update({
      where: { id: reward.id },
      data: { usedAmount: newUsed, status },
    })
    remainingToAllocate -= take
  }

  await logReferralAudit({
    actorId: input.createdById,
    actorRole: 'ADMIN',
    action: 'REFERRAL_BENEFITS_USED',
    entityType: 'ReferralTransaction',
    entityId: transaction.id,
    meta: { referrerId: input.referrerId, amount, note: input.note ?? null },
  })

  await notify(input.referrerId, {
    title: 'تم استخدام جزء من مزايا الإحالة',
    body: `خُصم ${amount.toLocaleString('ar-YE')} من مزايا إحالتك كخصم على رسوم المنصة وفق سياسة تكليفات${input.note ? ` — ${input.note}` : ''}. المتبقي: ${(benefits.remaining - amount).toLocaleString('ar-YE')}.`,
    type: 'REFERRAL_REWARD_USED',
    link: '/referrals',
  })

  return { ok: true }
}
