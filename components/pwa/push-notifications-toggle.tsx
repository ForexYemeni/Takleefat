'use client'

import { useEffect, useState } from 'react'
import { BellOff, BellRing, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

/**
 * مفتاح تفعيل الإشعارات الفورية (Web Push) — الجولة الرابعة عشرة
 * - يظهر فقط عند دعم المتصفح وضبط مفاتيح VAPID (تدهور رشيق: يختفي في الحالات الأخرى)
 * - مزامنة تلقائية صامتة عند كل تحميل: اشتراك المتصفح يُرفع للخادم idempotent
 * - iOS: الإشعارات تعمل بعد تثبيت التطبيق (PWA 16.4+) — تظهر إرشادية إن لم يكن مثبتاً
 */

/** هل الجهاز iOS/iPadOS؟ (iPadOS يظهر Macintosh مع لمس) */
function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) return true
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
}

/** هل يعمل التطبيق مثبتاً (standalone)؟ */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
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

export function PushNotificationsToggle() {
  const [phase, setPhase] = useState<'checking' | 'hidden' | 'ios-hint' | 'blocked' | 'off' | 'on'>('checking')
  const [working, setWorking] = useState(false)

  useEffect(() => {
    let cancelled = false

    const sync = async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        if (!cancelled) setPhase('hidden')
        return
      }

      let publicKey: string | null = null
      try {
        const res = await fetch('/api/push/public-key')
        if (res.ok) publicKey = (await res.json()).publicKey ?? null
      } catch {
        publicKey = null
      }
      if (!publicKey) {
        if (!cancelled) setPhase('hidden')
        return
      }

      // iOS غير مثبت: الإشعارات لا تتاح إلا داخل التطبيق المثبت
      if (isIOSDevice() && !isStandalone()) {
        if (!cancelled) setPhase('ios-hint')
        return
      }

      if (Notification.permission === 'denied') {
        if (!cancelled) setPhase('blocked')
        return
      }

      try {
        const registration = await navigator.serviceWorker.ready
        const existing = await registration.pushManager.getSubscription()
        if (existing) {
          // مزامنة صامتة — يضمن أن الخادم يعرف هذا الجهاز حتى لو فات POST سابقاً
          const json = existing.toJSON() as { endpoint?: string; keys?: SubscribeBody['keys'] }
          if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
            void postSubscription({ endpoint: json.endpoint, keys: json.keys, userAgent: navigator.userAgent.slice(0, 300) })
          }
          if (!cancelled) setPhase('on')
          return
        }
        if (!cancelled) setPhase('off')
      } catch {
        if (!cancelled) setPhase('off')
      }
    }

    void sync()
    return () => {
      cancelled = true
    }
  }, [])

  const subscribe = async () => {
    setWorking(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission === 'denied') {
        setPhase('blocked')
        toast.error('الإشعارات محجوبة من إعدادات المتصفح — فعّلها من إعدادات الموقع')
        return
      }
      const res = await fetch('/api/push/public-key')
      const { publicKey } = (await res.json()) as { publicKey: string | null }
      if (!publicKey) {
        toast.error('الإشعارات الفورية غير مفعّلة على الخادم حالياً')
        return
      }
      const registration = await navigator.serviceWorker.ready
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
      })
      const json = sub.toJSON() as { endpoint?: string; keys?: SubscribeBody['keys'] }
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        toast.error('تعذر تجهيز الاشتراك — حاول مجدداً')
        return
      }
      const ok = await postSubscription({ endpoint: json.endpoint, keys: json.keys, userAgent: navigator.userAgent.slice(0, 300) })
      if (!ok) {
        toast.error('تعذر حفظ الاشتراك على الخادم — حاول مجدداً')
        return
      }
      setPhase('on')
      toast.success('تم تفعيل الإشعارات الفورية — ستصلك التنبيهات حتى والتطبيق مغلق')
    } catch {
      toast.error('تعذر تفعيل الإشعارات — تأكد من الاتصال وحاول مجدداً')
    } finally {
      setWorking(false)
    }
  }

  const unsubscribe = async () => {
    setWorking(true)
    try {
      const registration = await navigator.serviceWorker.ready
      const existing = await registration.pushManager.getSubscription()
      if (existing) {
        const endpoint = existing.endpoint
        await existing.unsubscribe()
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        }).catch(() => null)
      }
      setPhase('off')
      toast.success('تم إيقاف الإشعارات الفورية لهذا الجهاز')
    } catch {
      toast.error('تعذر إيقاف الإشعارات — حاول مجدداً')
    } finally {
      setWorking(false)
    }
  }

  if (phase === 'checking' || phase === 'hidden') return null

  if (phase === 'ios-hint') {
    return (
      <p className="rounded-xl border bg-secondary/50 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
        لتفعيل الإشعارات الفورية على هذا الجهاز: ثبّت التطبيق أولاً من زر «تثبيت التطبيق» ثم افتحه من شاشة الجوال
      </p>
    )
  }

  if (phase === 'blocked') {
    return (
      <Button
        variant="outline"
        className="w-full justify-start gap-2 text-muted-foreground"
        disabled
      >
        <BellOff className="size-4" />
        الإشعارات محجوبة من المتصفح
      </Button>
    )
  }

  return (
    <Button
      variant="outline"
      className="w-full justify-start gap-2"
      onClick={phase === 'on' ? unsubscribe : subscribe}
      disabled={working}
    >
      {working ? (
        <Loader2 className="size-4 animate-spin" />
      ) : phase === 'on' ? (
        <BellRing className="size-4 text-primary" />
      ) : (
        <BellOff className="size-4" />
      )}
      {phase === 'on' ? 'الإشعارات الفورية مفعّلة — إيقاف' : 'تفعيل الإشعارات الفورية'}
    </Button>
  )
}
