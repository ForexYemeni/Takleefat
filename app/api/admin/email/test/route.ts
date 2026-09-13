import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { EMAIL_REGEX } from '@/lib/validations/user'
import { queueEmail } from '@/lib/email/send'
import { isEmailServiceConfigured } from '@/lib/email/gas-client'

/**
 * بريد تجريبي — للإدارة حصراً — الجولة 51
 * POST /api/admin/email/test { email? }
 * الافتراضي: بريد المدير المؤكد. فشل الإرسال يُسجل ولا يرمي خطأ استثناءً.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole('ADMIN')

    // فحص تهيئة الخدمة أولاً — رسالة البنية أوضح من رسالة حالة المستخدم
    if (!isEmailServiceConfigured()) {
      return jsonError('خدمة البريد غير مهيأة — أضف GOOGLE_APPS_SCRIPT_URL و GOOGLE_APPS_SCRIPT_SECRET في متغيرات البيئة', 503)
    }

    const body = (await req.json().catch(() => ({}))) as { email?: string }

    let to: string | null = null
    let recipientUserId: string | null = session.user.id

    if (body.email) {
      const raw = body.email.trim().toLowerCase()
      if (!EMAIL_REGEX.test(raw)) return jsonError('صيغة البريد الإلكتروني غير صحيحة', 422)
      to = raw
      recipientUserId = null // عنوان خارجي مباشر — بلا حساب مرتبط
    } else {
      const admin = await db.user.findUnique({
        where: { id: session.user.id },
        select: { email: true, emailVerified: true },
      })
      if (!admin?.email || !admin.emailVerified) {
        return jsonError('أضف وأكّد بريدك الإلكتروني في ملفك أولاً أو أدخل بريداً للتجربة', 400)
      }
      to = admin.email
    }

    if (!isEmailServiceConfigured()) {
      return jsonError('خدمة البريد غير مهيأة — أضف GOOGLE_APPS_SCRIPT_URL و GOOGLE_APPS_SCRIPT_SECRET في متغيرات البيئة', 503)
    }

    const result = await queueEmail({
      type: 'TEST',
      to,
      recipientUserId,
      relatedEntityId: null,
      idempotencyKey: `test:${randomUUID()}`,
      subject: 'رسالة تجريبية من لوحة الإدارة',
      title: '✅ خدمة البريد تعمل',
      greeting: 'مرحباً',
      lines: [
        'هذه رسالة تجريبية تأكد أن الربط بين منصة تكليفات وخدمة البريد (Google Apps Script + Gmail) يعمل بنجاح.',
      ],
      rows: [{ label: 'وقت الاختبار', value: new Date().toLocaleString('ar', { dateStyle: 'short', timeStyle: 'short' }) }],
      note: 'لم تطلب هذه الرسالة؟ يمكن للإدارة تجاهلها بأمان.',
    })

    if (!result.queued) {
      return jsonError('تعذر تسجيل رسالة الاختبار — حاول مجدداً', 500)
    }

    return NextResponse.json({
      message: 'تم إرسال البريد التجريبي — تابع النتيجة في سجل الإرسال',
      logId: result.logId,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
