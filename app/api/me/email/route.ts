import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSession, handleApiError, jsonError } from '@/lib/api-helpers'
import { setEmailSchema } from '@/lib/validations/user'
import { maskEmail, parseEmailPreferences } from '@/lib/email/config'
import { sendEmailVerificationCode, safePreferences } from '@/lib/email/send'

/**
 * البريد الإلكتروني للمستخدم الحالي — الجولة 51
 * GET    /api/me/email — حالة البريد للبطاقة (البريد مقنّع للعرض + التفضيلات)
 * POST   /api/me/email — إضافة/تعديل البريد → إنشاء رمز 6 أرقام وإرساله (لا يُعاد في الاستجابة أبداً)
 * DELETE /api/me/email — إزالة البريد وحالة التحقق بالكامل
 *
 * قواعد الأمان:
 * - منع تكرار نفس البريد المؤكد لأكثر من حساب
 * - الرمز يُخزن في القاعدة فقط ولا يظهر في أي استجابة برمجية (صلاحيته 15 دقيقة داخل sendEmailVerificationCode)
 * - تعديل البريد بعد التأكيد يُعيد البريد إلى حالة «غير مؤكد» ويتطلب رمزاً جديداً
 */

/** الحد الأدنى بين طلبَي رمز متتاليين (ثوانٍ) — حماية من الإزعاج وسوء الاستخدام */
const RESEND_COOLDOWN_SECONDS = 60

export async function GET() {
  try {
    const session = await requireSession()
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: {
        email: true,
        emailVerified: true,
        emailNotificationEnabled: true,
        emailPreferences: true,
        emailVerificationExpires: true,
      },
    })
    if (!user) return jsonError('الحساب غير موجود', 404)

    return NextResponse.json({
      email: user.email,
      maskedEmail: user.email ? maskEmail(user.email) : null,
      emailVerified: user.emailVerified,
      enabled: user.emailNotificationEnabled,
      preferences: safePreferences(user.emailPreferences),
      /** وقت انتهاء صلاحية الرمز الحالي إن وُجد — لعرض العد التنازلي دون كشف الرمز */
      verificationExpiresAt: user.emailVerified ? null : user.emailVerificationExpires,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession()
    const parsed = setEmailSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }
    const email = parsed.data.email

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, name: true, email: true, emailVerified: true, emailNotificationEnabled: true, emailVerificationSentAt: true },
    })
    if (!user) return jsonError('الحساب غير موجود', 404)

    // منع التكرار: نفس البريد المؤكد مملوك لحساب آخر
    const owner = await db.user.findFirst({
      where: { email, emailVerified: true, id: { not: user.id } },
      select: { id: true },
    })
    if (owner) {
      return jsonError('هذا البريد الإلكتروني مرتبط بحساب آخر بالفعل', 409)
    }

    // حماية من طلب الرموز المتكرر — 60 ثانية بين الطلبات (بما فيها أول إضافة بعد تعديل سابق)
    if (user.emailVerificationSentAt) {
      const elapsed = (Date.now() - user.emailVerificationSentAt.getTime()) / 1000
      if (elapsed < RESEND_COOLDOWN_SECONDS) {
        return jsonError(
          `يرجى الانتظار ${Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed)} ثانية قبل طلب رمز جديد`,
          429
        )
      }
    }

    // حفظ البريد الجديد → يعود إلى «غير مؤكد» حتى إدخال الرمز
    await db.user.update({
      where: { id: user.id },
      data: {
        email,
        emailVerified: false,
        emailNotificationEnabled: user.emailVerified ? false : user.emailNotificationEnabled,
      },
    })

    // إنشاء الرمز وإرساله بالبريد — فشل الإرسال مسجل ولا يعطل العملية
    await sendEmailVerificationCode(user.id, email, user.name)

    return NextResponse.json({
      message: 'تم إرسال رمز التحقق إلى بريدك الإلكتروني',
      maskedEmail: maskEmail(email),
      emailVerified: false,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE() {
  try {
    const session = await requireSession()
    await db.user.update({
      where: { id: session.user.id },
      data: {
        email: null,
        emailVerified: false,
        emailVerificationCode: null,
        emailVerificationExpires: null,
        emailVerificationSentAt: null,
        emailNotificationEnabled: true,
        emailPreferences: JSON.stringify(parseEmailPreferences(null)),
      },
    })
    return NextResponse.json({ message: 'تمت إزالة البريد الإلكتروني من حسابك' })
  } catch (error) {
    return handleApiError(error)
  }
}
