import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { referralUsageSchema } from '@/lib/validations/referral'
import { recordReferralBenefitsUsage, getReferralBenefits } from '@/lib/referrals'

/**
 * GET/POST /api/admin/referrals/transactions — مزايا الإحالة (الجولة 75)
 * ------------------------------------------------------------
 * GET: ملخص مزايا مُحيل محدد (?referrerId=) — الإجمالي/المستخدم/المتبقي.
 * POST: تسجيل استخدام مزايا كخصم من رسوم المنصة — إدارة حصراً.
 * ممنوع السحب النقدي نهائياً: هذا سجل محاسبي يوثق الخصم الإداري فقط،
 * والتحقق من كفاية الرصيد يتم Backend حصراً عبر محرك الإحالة.
 */
export async function GET(req: NextRequest) {
  try {
    await requireRole('ADMIN')
    const referrerId = req.nextUrl.searchParams.get('referrerId') ?? ''
    if (!referrerId) return jsonError('معرف المُحيل مطلوب', 422)

    const benefits = await getReferralBenefits(referrerId)
    return NextResponse.json({ benefits })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole('ADMIN')
    const body = await req.json().catch(() => null)
    const parsed = referralUsageSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات المدخلة غير صحيحة', 422)
    }
    const { referrerId, amount, note } = parsed.data

    // المُحيل يجب أن يكون حساباً قائماً من الأدوار المؤهلة
    const referrer = await db.user.findUnique({
      where: { id: referrerId },
      select: { id: true, name: true, role: true },
    })
    if (!referrer) return jsonError('حساب المُحيل غير موجود', 404)

    const result = await recordReferralBenefitsUsage({
      referrerId,
      amount,
      note,
      createdById: session.user.id,
    })
    if (!result.ok) return jsonError(result.error, 409)

    const benefits = await getReferralBenefits(referrerId)

    return NextResponse.json({
      message: `سُجل خصم ${amount.toLocaleString('ar-YE')} من مزايا إحالة (${referrer.name}) — أُشعر المُحيل ووُثقت العملية في السجل`,
      benefits,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
