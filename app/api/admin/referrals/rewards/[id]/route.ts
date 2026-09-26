import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError, ApiError } from '@/lib/api-helpers'
import { referralRewardDecisionSchema } from '@/lib/validations/referral'
import { logReferralAudit } from '@/lib/referrals'

/**
 * POST /api/admin/referrals/rewards/[id] — قرار الإدارة على ميزة إحالة (الجولة 75)
 * ------------------------------------------------------------
 * للمزايا ذات الحالة PENDING_REVIEW فقط (عند تفعيل المراجعة من الإعدادات):
 * - APPROVE: اعتماد → ACCRUED تدخل ضمن المزايا المتاحة للخصم.
 * - CANCEL: إلغاء موثق → CANCELLED مع السبب — لا تدخل المزايا أبداً.
 * المزايا المعتمدة تلقائياً (بلا مراجعة) لا تُلمس من هنا.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('ADMIN')
    const { id } = await params

    const body = await req.json().catch(() => null)
    const parsed = referralRewardDecisionSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }
    const { decision, note } = parsed.data

    const reward = await db.referralReward.findUnique({
      where: { id },
      include: { referrer: { select: { id: true, name: true } } },
    })
    if (!reward) throw new ApiError('ميزة الاستحقاق غير موجودة', 404)
    if (reward.status !== 'PENDING_REVIEW') {
      throw new ApiError('هذه الميزة حُسمت مسبقاً — قرار المراجعة متاح للمزايا المعلقة حصراً', 409)
    }

    const newStatus = decision === 'APPROVE' ? 'ACCRUED' : 'CANCELLED'
    const updated = await db.referralReward.update({
      where: { id },
      data: {
        status: newStatus,
        decidedById: session.user.id,
        decidedAt: new Date(),
        decisionNote: note || null,
      },
    })

    await logReferralAudit({
      actorId: session.user.id,
      actorRole: 'ADMIN',
      action: 'REFERRAL_REWARD_DECIDED',
      entityType: 'ReferralReward',
      entityId: id,
      meta: {
        decision,
        amount: reward.amount,
        currency: reward.currency,
        originLabel: reward.originLabel,
        note: note || null,
      },
    })

    await notifyDecision(updated, reward.referrer.id, reward.amount, reward.currency, reward.originLabel, decision, note)

    return NextResponse.json({
      message:
        decision === 'APPROVE'
          ? `اعتُمدت الميزة (${reward.amount.toLocaleString('ar-YE')} ${reward.currency}) — دخلت ضمن مزايا المُحيل المتاحة`
          : `أُلغيت الميزة (${reward.amount.toLocaleString('ar-YE')} ${reward.currency}) ووُثّق السبب في السجل`,
      reward: { id: updated.id, status: updated.status },
    })
  } catch (error) {
    return handleApiError(error)
  }
}

/** إشعار المُحيل بقرار المراجعة — لا يفشل القرار الأساسي أبداً */
async function notifyDecision(
  _updated: unknown,
  referrerId: string,
  amount: number,
  currency: string,
  originLabel: string,
  decision: string,
  note?: string
) {
  try {
    const { notify } = await import('@/lib/notifications')
    await notify(referrerId, {
      title:
        decision === 'APPROVE' ? 'اعتُمدت ميزة إحالة بانتظارك' : 'أُلغيت ميزة إحالة بعد المراجعة',
      body:
        decision === 'APPROVE'
          ? `${originLabel} — استحقاق ${amount.toLocaleString('ar-YE')} ${currency} اعتُمد وأصبح ضمن مزايا إحالتك. تُستخدم مزايا الإحالة كخصم على رسوم المنصة وفق سياسة تكليفات، ولا تمثل رصيداً نقدياً قابلاً للسحب.`
          : `${originLabel} — استحقاق ${amount.toLocaleString('ar-YE')} ${currency} لم يُعتمد بعد المراجعة${note ? ` — السبب: ${note}` : ''}.`,
      type: decision === 'APPROVE' ? 'REFERRAL_REWARD_ACCRUED' : 'GENERIC',
      link: '/referrals',
    })
  } catch (error) {
    console.error('referral decision notify failed:', error)
  }
  void _updated
}
