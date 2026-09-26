import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  getReferralSettings,
  isReferralEligibleRole,
  logReferralAudit,
  REFERRAL_COOKIE,
  REFERRAL_COOKIE_MAX_AGE,
} from '@/lib/referrals'
import { rateLimit } from '@/lib/rate-limit'

/**
 * GET /api/referrals/track?code=XXX — تتبع رابط الدعوة (الجولة 75 — إضافي بحت)
 * ------------------------------------------------------------
 * ينقر المدعو الرابط الشخصي ← صفحة الهبوط /r/[code] ← زر «أنشئ حسابك الآن»
 * يمر من هنا: يُحفظ كود المُحيل في كوكي httpOnly (30 يوماً) ثم يُوجَّه لصفحة
 * التسجيل القائمة دون أي تعديل عليها. عند إتمام التسجيل يقرأ مسار التسجيل
 * الكوكي ويربط الإحالة — لا استحقاق ولا احتساب على مجرد الضغط أو الزيارة.
 * كود غير صالح → توجيه للتسجيل كالمعتاد (لا يمنع التسجيل أبداً).
 */
export async function GET(req: NextRequest) {
  const code = (req.nextUrl.searchParams.get('code') ?? '').trim().toUpperCase().slice(0, 40)
  const registerUrl = new URL('/register', req.url)

  // حد معدل بسيط ضد الضغط — 30 زيارة/دقيقة لكل IP
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  if (!rateLimit(`referral-track:${ip}`, 30, 60_000)) {
    return NextResponse.redirect(registerUrl)
  }

  if (code) {
    try {
      const codeRow = await db.referralCode.findUnique({
        where: { code },
        include: { user: { select: { id: true, role: true, status: true } } },
      })
      const settings = await getReferralSettings()
      const valid =
        settings.enabled &&
        codeRow &&
        codeRow.isActive &&
        codeRow.user.status === 'APPROVED' &&
        isReferralEligibleRole(codeRow.user.role)

      if (valid && codeRow) {
        const response = NextResponse.redirect(registerUrl)
        response.cookies.set(REFERRAL_COOKIE, codeRow.code, {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          maxAge: REFERRAL_COOKIE_MAX_AGE,
        })
        // عداد الزيارات — مؤشر استخلاص فقط (لا استحقاق على الزيارة)
        await db.referralCode
          .update({ where: { id: codeRow.id }, data: { visits: { increment: 1 } } })
          .catch(() => null)
        await logReferralAudit({
          actorId: null,
          actorRole: 'SYSTEM',
          action: 'REFERRAL_TRACK_VISIT',
          entityType: 'ReferralCode',
          entityId: codeRow.id,
          meta: { code },
        })
        return response
      }
    } catch (error) {
      console.error('referral track failed:', error)
    }
  }

  return NextResponse.redirect(registerUrl)
}
