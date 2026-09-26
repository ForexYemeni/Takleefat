import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSession, handleApiError, jsonError } from '@/lib/api-helpers'
import { referralInviteSchema } from '@/lib/validations/referral'
import {
  getReferralSettings,
  isReferralEligibleRole,
  logReferralAudit,
} from '@/lib/referrals'
import { rateLimit } from '@/lib/rate-limit'

/**
 * POST /api/referrals/invites — دعوة مباشرة لكادر بالاسم والهاتف (الجولة 75)
 * ------------------------------------------------------------
 * المستخدم المؤهل يبدأ دعوة مباشرة، ثم يُكمل الشخص المُحال تسجيله وتوثيقه بنفسه.
 * العلاقة تُسجل INVITED وتربط آلياً عند أول تسجيل بنفس رقم الهاتف.
 * مكافحة التلاعب: حد معدل 10/ساعة + حد عدد الدعوات من الإعدادات + منع الدعوة
 * المكررة بنفس الهاتف لنفس المُحيل + رفض أرقام مسجلة مسبقاً.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession()
    const primaryRole = session.user.role as string

    if (!isReferralEligibleRole(primaryRole)) {
      return jsonError('دورك الحالي غير مشمول ببرنامج الإحالة', 403)
    }
    if (session.user.status !== 'APPROVED') {
      return jsonError('يصبح برنامج الإحالة متاحاً لك بعد اعتماد حسابك من الإدارة', 403)
    }

    const settings = await getReferralSettings()
    if (!settings.enabled) return jsonError('برنامج الإحالة معطل حالياً من إدارة المنصة', 409)

    // حد المعدل — 10 دعوات/ساعة لكل مُحيل
    if (!rateLimit(`referral-invite:${session.user.id}`, 10, 60 * 60 * 1000)) {
      return jsonError('طلبات كثيرة — انتظر قليلاً قبل إرسال دعوة جديدة', 429)
    }

    const body = await req.json().catch(() => null)
    const parsed = referralInviteSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات المدخلة غير صحيحة', 422)
    }
    const { name, phone, note } = parsed.data

    // مكافحة التلاعب: الرقم مسجل مسبقاً في المنصة؟
    const existingUser = await db.user.findUnique({ where: { phone }, select: { id: true } })
    if (existingUser) {
      return jsonError('هذا الرقم مسجل مسبقاً في المنصة — لا يمكن دعوة حساب قائم', 409)
    }

    // حد عدد الدعوات لكل مُحيل (0 = بلا حد)
    if (settings.maxInvitesPerReferrer > 0) {
      const myInvites = await db.referral.count({ where: { referrerId: session.user.id } })
      if (myInvites >= settings.maxInvitesPerReferrer) {
        return jsonError(
          `بلغت الحد الأقصى لعدد الدعوات (${settings.maxInvitesPerReferrer}) المحدد من الإدارة`,
          409
        )
      }
    }

    // منع الدعوة المكررة بنفس الهاتف من نفس المُحيل (قيد فريد + رسالة ودية)
    const duplicate = await db.referral.findUnique({
      where: { referrerId_invitedPhone: { referrerId: session.user.id, invitedPhone: phone } },
    })
    if (duplicate && duplicate.status === 'INVITED') {
      return jsonError('لديك دعوة معلقة بنفس الرقم بالفعل — بانتظار تسجيل المدعو', 409)
    }
    if (duplicate) {
      return jsonError('سبق أن دعوت هذا الرقم وسجّل منه حساب — لا يمكن تكرار الدعوة', 409)
    }

    const referral = await db.referral.create({
      data: {
        referrerId: session.user.id,
        source: 'DIRECT',
        invitedName: name,
        invitedPhone: phone,
        status: 'INVITED',
        note: note || null,
      },
    })

    await logReferralAudit({
      actorId: session.user.id,
      actorRole: primaryRole,
      action: 'REFERRAL_DIRECT_INVITE',
      entityType: 'Referral',
      entityId: referral.id,
      meta: { invitedName: name, invitedPhone: phone },
    })

    return NextResponse.json(
      {
        message: `سُجلت دعوة ${name} — شارك معه رابط دعوتك الشخصي أو أرسل له الدعوة مباشرة، وسيرتبط حسابه بإحالتك تلقائياً عند تسجيله بنفس الرقم`,
        referral: {
          id: referral.id,
          invitedName: referral.invitedName,
          invitedPhone: referral.invitedPhone,
          status: referral.status,
          createdAt: referral.createdAt,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
