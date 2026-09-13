import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSession, handleApiError, jsonError } from '@/lib/api-helpers'
import { maskEmail } from '@/lib/email/config'
import { sendEmailVerificationCode } from '@/lib/email/send'

/**
 * إعادة إرسال رمز التحقق — الجولة 51
 * POST /api/me/email/resend — بريد غير مؤكد حصراً + حد أدنى 60 ثانية بين الرموز
 * (الرمز الجديد يُلغي القديم — لا تعرض الرمز في أي استجابة)
 */

const RESEND_COOLDOWN_SECONDS = 60

export async function POST() {
  try {
    const session = await requireSession()
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        emailVerificationSentAt: true,
      },
    })
    if (!user) return jsonError('الحساب غير موجود', 404)
    if (!user.email) return jsonError('أضف بريدك الإلكتروني أولاً', 400)
    if (user.emailVerified) return jsonError('بريدك الإلكتروني مؤكد بالفعل', 400)

    // حماية من طلب الرموز المتكرر
    if (user.emailVerificationSentAt) {
      const elapsed = (Date.now() - user.emailVerificationSentAt.getTime()) / 1000
      if (elapsed < RESEND_COOLDOWN_SECONDS) {
        return jsonError(
          `يرجى الانتظار ${Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed)} ثانية قبل طلب رمز جديد`,
          429
        )
      }
    }

    await sendEmailVerificationCode(user.id, user.email, user.name)

    return NextResponse.json({
      message: 'تم إرسال رمز تحقق جديد إلى بريدك الإلكتروني',
      maskedEmail: maskEmail(user.email),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
