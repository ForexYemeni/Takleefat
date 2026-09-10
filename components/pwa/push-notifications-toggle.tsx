'use client'

import { useEffect, useState } from 'react'
import { BellOff, BellRing, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { enablePushInteractive, getPushState, type PushSupportState } from '@/lib/push-client'

/**
 * مفتاح تفعيل الإشعارات الفورية (Web Push) — الجولة الرابعة عشرة
 * - يظهر فقط عند دعم المتصفح وضبط مفاتيح VAPID (تدهور رشيق: يختفي في الحالات الأخرى)
 * - مزامنة تلقائية صامتة عند كل تحميل: اشتراك المتصفح يُرفع للخادم idempotent
 * - iOS: الإشعارات تعمل بعد تثبيت التطبيق (PWA 16.4+) — تظهر إرشادية إن لم يكن مثبتاً
 * - الجولة الخامسة عشرة: منطق الاشتراك نُقل إلى lib/push-client.ts ليُشارك مع
 *   اللافتة والطلب التلقائي بعد الدخول — مصدر وحيد للحقيقة.
 */
export function PushNotificationsToggle() {
  const [phase, setPhase] = useState<PushSupportState | 'checking'>('checking')
  const [working, setWorking] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getPushState().then((state) => {
      if (!cancelled) setPhase(state)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const subscribe = async () => {
    setWorking(true)
    try {
      const result = await enablePushInteractive()
      if (result === 'on') {
        setPhase('on')
        toast.success('تم تفعيل الإشعارات الفورية — ستصلك التنبيهات حتى والتطبيق مغلق')
        return
      }
      if (result === 'denied') {
        setPhase('blocked')
        toast.error('الإشعارات محجوبة من إعدادات المتصفح — فعّلها من إعدادات الموقع')
        return
      }
      if (result === 'unconfigured') {
        toast.error('الإشعارات الفورية غير مفعّلة على الخادم حالياً')
        return
      }
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

  if (phase === 'checking' || phase === 'unsupported' || phase === 'unconfigured') return null

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
