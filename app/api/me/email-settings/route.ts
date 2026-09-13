import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSession, handleApiError, jsonError } from '@/lib/api-helpers'
import { emailSettingsSchema } from '@/lib/validations/user'
import { parseEmailPreferences, LOCKED_CATEGORIES } from '@/lib/email/config'

/**
 * إعدادات إشعارات البريد للمستخدم — الجولة 51
 * PATCH /api/me/email-settings { enabled?, preferences? }
 *
 * - المفتاح الرئيس: إيقاف/تشغيل جميع إشعارات البريد
 * - الأقسام القابلة للتحكم: التكليفات/الطلبات/تحديثات التكليف/المستندات/الإدارية/الحساب/المهمة
 * - أقسام الأمان مقفلة (لا تُقبل من الواجهة ولا تُحفظ) — دائماً مفعّلة بحكم السياسة
 * - كل شيء يعمل فقط بعد تأكيد البريد — قبل ذلك لا بريد يُرسل أصلاً
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession()
    const parsed = emailSettingsSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, emailVerified: true, emailNotificationEnabled: true, emailPreferences: true },
    })
    if (!user) return jsonError('الحساب غير موجود', 404)
    if (!user.email || !user.emailVerified) {
      return jsonError('أضف وأكّد بريدك الإلكتروني أولاً لإدارة إشعاراته', 400)
    }

    // دمج التفضيلات مع استبعاد الأقسام المقفلة نهائياً
    const current = parseEmailPreferences(user.emailPreferences)
    const incoming = parsed.data.preferences ?? {}
    const merged = { ...current }
    for (const [key, value] of Object.entries(incoming)) {
      if (LOCKED_CATEGORIES.includes(key)) continue // سياسة النظام: الأمان دائماً
      if (typeof value === 'boolean') {
        ;(merged as Record<string, boolean>)[key] = value
      }
    }

    const updated = await db.user.update({
      where: { id: session.user.id },
      data: {
        emailNotificationEnabled: parsed.data.enabled ?? user.emailNotificationEnabled,
        emailPreferences: JSON.stringify(merged),
      },
      select: { emailNotificationEnabled: true, emailPreferences: true },
    })

    return NextResponse.json({
      message: 'تم تحديث إعدادات إشعارات البريد',
      enabled: updated.emailNotificationEnabled,
      preferences: parseEmailPreferences(updated.emailPreferences),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
