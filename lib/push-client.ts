'use client'

/**
 * أدوات الإشعارات الفورية من جهة العميل — الجولة الخامسة عشرة
 * - مصدر وحيد للحقيقة: مكوّن التبديل واللافتة والطلب التلقائي بعد الدخول كلها تستخدم هذه الدوال
 * - التدهور الرشيق: أي عدم دعم/عدم ضبط يعيد حالة واضحة بلا أخطاء ظاهرة للمستخدم
 * - maybeAutoPromptAfterLogin: طلب صلاحية الإشعارات مرة واحدة بعد أول دخول ناجح
 *   (نقرة زر الدخول = إيماءة مستخدم تسمح بـ requestPermission حسب سياسات المتصفحات)
 */

/** مفتاح localStorage لضمان طلب الصلاحية مرة واحدة فقط لكل جهاز */
const AUTO_PROMPT_FLAG = 'takleefat-push-autoprompt-v1'
/** مفتاح localStorage للاختفاء الاختياري للافتة التفعيل */
export const PUSH_BANNER_DISMISS_KEY = 'takleefat-push-banner-dismissed-v1'

export type PushSupportState =
  | 'unconfigured' // الخادم بلا مفاتيح VAPID
  | 'unsupported' // المتصفح لا يدعم SW/Push/Notification
  | 'ios-hint' // iOS/iPadOS غير مثبَت كتطبيق
  | 'blocked' // الصلاحية محجوبة من إعدادات المتصفح
  | 'on' // مشترك وفعّال
  | 'off' // مدعوم لكن غير مفعّل

/** هل الجهاز iOS/iPadOS؟ (iPadOS يظهر Macintosh مع لمس) */
export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) return true
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
}

/** هل يعمل التطبيق مثبتاً (standalone)؟ */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i)
  return output
}

interface SubscribeBody {
  endpoint: string
  keys: { p256dh: string; auth: string }
  userAgent?: string
}

async function postSubscription(body: SubscribeBody): Promise<boolean> {
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.ok
}

/** المفتاح العام من الخادم — null إن لم تُضبط المفاتيح */
export async function fetchPushPublicKey(): Promise<string | null> {
  try {
    const res = await fetch('/api/push/public-key')
    if (!res.ok) return null
    return (await res.json()).publicKey ?? null
  } catch {
    return null
  }
}

/** حالة الدعم الحالية — يُستخدمها التبديل واللافتة معاً */
export async function getPushState(): Promise<PushSupportState> {
  if (!isPushSupported()) return 'unsupported'
  const publicKey = await fetchPushPublicKey()
  if (!publicKey) return 'unconfigured'
  if (isIOSDevice() && !isStandalone()) return 'ios-hint'
  if (Notification.permission === 'denied') return 'blocked'
  try {
    const registration = await navigator.serviceWorker.ready
    const existing = await registration.pushManager.getSubscription()
    if (existing) {
      // مزامنة صامتة — يضمن أن الخادم يعرف هذا الجهاز حتى لو فات POST سابقاً
      const json = existing.toJSON() as { endpoint?: string; keys?: SubscribeBody['keys'] }
      if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
        void postSubscription({
          endpoint: json.endpoint,
          keys: json.keys,
          userAgent: navigator.userAgent.slice(0, 300),
        })
      }
      return 'on'
    }
    return 'off'
  } catch {
    return 'off'
  }
}

export type EnablePushResult =
  | 'on' // تم التفعيل بنجاح
  | 'denied' // المستخدم رفض / الصلاحية محجوبة
  | 'error' // خطأ غير متوقع
  | 'unconfigured'
  | 'unsupported'
  | 'ios-hint'

/**
 * تدوير الاشتراك الكامل: طلب الصلاحية → الاشتراك في المتصفح → رفعه للخادم
 * يعيد نتيجة واضحة ليقرر كل مكوّن رسالته.
 */
export async function enablePushInteractive(): Promise<EnablePushResult> {
  const state = await getPushState()
  if (state === 'unconfigured' || state === 'unsupported' || state === 'ios-hint') return state
  if (state === 'on') return 'on'

  try {
    const permission = await Notification.requestPermission()
    if (permission === 'denied') return 'denied'

    const publicKey = await fetchPushPublicKey()
    if (!publicKey) return 'unconfigured'

    const registration = await navigator.serviceWorker.ready
    const sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
    })
    const json = sub.toJSON() as { endpoint?: string; keys?: SubscribeBody['keys'] }
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return 'error'

    const ok = await postSubscription({
      endpoint: json.endpoint,
      keys: json.keys,
      userAgent: navigator.userAgent.slice(0, 300),
    })
    return ok ? 'on' : 'error'
  } catch {
    return 'error'
  }
}

/**
 * الطلب التلقائي بعد أول دخول ناجح — مرة واحدة لكل جهاز:
 * - الصلاحية ممنوحة سابقاً بدون اشتراك → اشتراك صامت بلا أي نافذة
 * - الصلاحية بلا قرار → نافذة طلب الصلاحية ثم الاشتراك عند الموافقة
 * - أي فشل/عدم دعم → صمت تام ولا يمس تجربة الدخول إطلاقاً
 */
export async function maybeAutoPromptAfterLogin(): Promise<void> {
  try {
    if (typeof window === 'undefined' || !isPushSupported()) return
    if (isIOSDevice() && !isStandalone()) return
    if (window.localStorage.getItem(AUTO_PROMPT_FLAG)) return
    // علامة فورية حتى لو تداخل طلبان — لا نُلحّ أبداً
    window.localStorage.setItem(AUTO_PROMPT_FLAG, '1')
    if (Notification.permission === 'denied') return

    const publicKey = await fetchPushPublicKey()
    if (!publicKey) return // الخادم بلا مفاتيح — لا شيء نفعل

    const registration = await navigator.serviceWorker.ready
    const existing = await registration.pushManager.getSubscription()
    if (existing) {
      const json = existing.toJSON() as { endpoint?: string; keys?: SubscribeBody['keys'] }
      if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
        void postSubscription({
          endpoint: json.endpoint,
          keys: json.keys,
          userAgent: navigator.userAgent.slice(0, 300),
        })
      }
      return
    }

    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return
    }
    // الصلاحية ممنوحة الآن (أو كانت ممنوحة) — اشتراك مباشر
    const sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
    })
    const json = sub.toJSON() as { endpoint?: string; keys?: SubscribeBody['keys'] }
    if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
      void postSubscription({
        endpoint: json.endpoint,
        keys: json.keys,
        userAgent: navigator.userAgent.slice(0, 300),
      })
    }
  } catch {
    // صمت تام — التوجيه التلقائي لا يجب أن يظهر بأي خطأ
  }
}
