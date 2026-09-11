import webpush from 'web-push'
import { db } from '@/lib/db'

/**
 * Web Push (VAPID) — الجولة الرابعة عشرة:
 * - المفاتيح من متغيرات البيئة: NEXT_PUBLIC_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY
 * - تدهور رشيق: إن لم تُضبط المفاتيح تعمل المنصة كالمعتاد (إشعارات داخلية فقط)
 * - الإرسال fire-and-forget: لا يوقف ولا يبطئ العملية الأساسية أبداً،
 *   والاشتراكات المنتهية (404/410) تُحذف تلقائياً من قاعدة البيانات.
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@taklefat.vercel.app'

/** هل الإشعارات الفورية مضبوطة على هذا النشر؟ */
export function isPushConfigured(): boolean {
  return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY)
}

/** المفتاح العام المُمرر للمتصفح للاشتراك (null إن لم تُضبط المفاتيح) */
export function getPushPublicKey(): string | null {
  return isPushConfigured() ? (VAPID_PUBLIC_KEY as string) : null
}

export interface PushPayload {
  title: string
  body?: string
  link?: string
  /** معرّف فريد للإشعار — يمنع دمج التنبيهات المتتالية ويضمن صوت/تنبيه لكل إشعار */
  tag?: string
}

/** حد أقصى للاشتراكات لكل مستخدم — تُحذف الأقدم عند التجاوز (أجهزة قديمة/ضائعة) */
export const MAX_SUBSCRIPTIONS_PER_USER = 6

async function sendToSubscription(
  sub: { id: string; endpoint: string; p256dh: string; auth: string },
  payload: PushPayload
): Promise<boolean> {
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 24 * 7 } // أسبوع — بعدها تفقد الرسالة قيمتها التشغيلية
    )
    return true
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    // 404/410: الاشتراك انتهى أو أُلغي من المتصفح — يُحذف نهائياً
    if (status === 404 || status === 410) {
      try {
        await db.pushSubscription.delete({ where: { id: sub.id } })
      } catch {
        // تجاهل — قد يكون حُذف من مسار آخر
      }
      return false
    }
    // بقية الأخطاء (شبكة/خدمة خارجية) — تُسجَّل ولا تُوقف شيئاً
    console.warn(`[push] delivery failed (${status ?? 'unknown'}): ${sub.endpoint.slice(0, 60)}`)
    return false
  }
}

/** إرسال Push لكل أجهزة مستخدم — يُجدول عبر after() فلا يُؤخر الاستجابة ويُكمل حتماً */
export async function deliverPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!isPushConfigured()) return
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY as string, VAPID_PRIVATE_KEY as string)
    const subs = await db.pushSubscription.findMany({
      where: { userId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    })
    if (subs.length === 0) return
    const results = await Promise.allSettled(subs.map((sub) => sendToSubscription(sub, payload)))
    const delivered = results.filter((r) => r.status === 'fulfilled' && r.value === true).length
    // الجولة العشرون: سطر تشخيصي في سجلات المنصة — يثبت أن الإرسال استُكمل فعلاً
    // بعد الاستجابة (after) ويعرض عدد الأجهزة التي وصلها الإشعار
    console.info(
      `[push] delivered ${delivered}/${subs.length} → user ${userId} | «${(payload.title || '').slice(0, 40)}»`
    )
  } catch (error) {
    console.warn('[push] deliverPushToUser failed:', error)
  }
}

/**
 * إشعار تجريبي مُعُدّ النتيجة — الجولة السابعة عشرة:
 * يُرسل إشعاراً حقيقياً إلى كل أجهزة المستخدم ويعيد عدد الأجهزة التي
 * وصلها الفعلياً — أداة تحقق فوري للمستخدم من أن التفعيل يعمل حقاً.
 */
export async function deliverTestToUser(
  userId: string,
  payload: PushPayload
): Promise<{ total: number; delivered: number }> {
  if (!isPushConfigured()) return { total: 0, delivered: 0 }
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY as string, VAPID_PRIVATE_KEY as string)
    const subs = await db.pushSubscription.findMany({
      where: { userId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    })
    const results = await Promise.allSettled(subs.map((sub) => sendToSubscription(sub, payload)))
    const delivered = results.filter((r) => r.status === 'fulfilled' && r.value === true).length
    return { total: subs.length, delivered }
  } catch (error) {
    console.warn('[push] deliverTestToUser failed:', error)
    return { total: 0, delivered: 0 }
  }
}
