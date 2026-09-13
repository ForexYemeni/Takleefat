import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { db } from '@/lib/db'
import { requireSession, handleApiError, jsonError } from '@/lib/api-helpers'
import { verifyEmailSchema } from '@/lib/validations/user'
import { maskEmail } from '@/lib/email/config'

/**
 * تأكيد البريد الإلكتروني — الجولة 51
 * POST /api/me/email/verify { code } — رمز 6 أرقام صالح 15 دقيقة
 *
 * عند النجاح: emailVerified = true + تفعيل إشعارات البريد تلقائياً
 * الرسائل للمستخدم ودودة — بلا أي تفاصيل تقنية.
 */

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession()
    const parsed = verifyEmailSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'رمز التحقق غير صحيح', 422)
    }
    const code = parsed.data.code

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        emailVerificationCode: true,
        emailVerificationExpires: true,
      },
    })
    if (!user) return jsonError('الحساب غير موجود', 404)
    if (!user.email) return jsonError('أضف بريدك الإلكتروني أولاً', 400)
    if (user.emailVerified) {
      return NextResponse.json({
        message: 'بريدك الإلكتروني مؤكد بالفعل',
        maskedEmail: maskEmail(user.email),
        emailVerified: true,
      })
    }

    // مقارنة آمنة زمنياً + فحص الصلاحية — رسالة واحدة موحدة للأخطاء (لا كشف أسباب)
    const stored = user.emailVerificationCode
    const expired =
      !user.emailVerificationExpires || user.emailVerificationExpires.getTime() < Date.now()
    const matches =
      !!stored &&
      stored.length === code.length &&
      timingSafeEqual(Buffer.from(stored), Buffer.from(code))

    if (!matches || expired) {
      return jsonError('رمز التحقق غير صحيح أو منتهي الصلاحية', 422)
    }

    await db.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailNotificationEnabled: true, // التأكيد يفعّل إشعارات البريد تلقائياً
        emailVerificationCode: null,
        emailVerificationExpires: null,
        emailVerificationSentAt: null,
      },
    })

    return NextResponse.json({
      message: 'تم تأكيد بريدك الإلكتروني بنجاح',
      maskedEmail: maskEmail(user.email),
      emailVerified: true,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
