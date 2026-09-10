'use client'

import { useEffect, useState } from 'react'
import { Bell, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  enablePushInteractive,
  getPushState,
  PUSH_BANNER_DISMISS_KEY,
  type PushSupportState,
} from '@/lib/push-client'

/**
 * لافتة تفعيل الإشعارات الفورية — الجولة الخامسة عشرة، محدّثة في السابعة عشرة
 *
 * الهدف: ألا يضيع على أي مستخدم أن الإشعارات الفورية متاحة — فالإشعارات
 * الداخلية تظهر في القائمة دائماً، لكن البث المنبثق خارج التطبيق يتطلب
 * تفعيلاً واعياً لكل جهاز.
 *
 * تغيير الجولة السابعة عشرة: الإخفاء صار للجلسة الحالية فقط (sessionStorage)
 * — كان الإخفاء دائماً في localStorage فتوقفت اللافتة عن الأجهزة غير المفعّلة،
 * وهو من أسباب بقاء أجهزة كثيرة بلا اشتراك. مع المؤشر الدائم في الرأس أصبح
 * للتفعيل وجهان لا يختفيان.
 */
export function PushBanner() {
  const [state, setState] = useState<PushSupportState | 'checking' | 'dismissed'>('checking')
  const [working, setWorking] = useState(false)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (
        typeof window !== 'undefined' &&
        window.sessionStorage.getItem(PUSH_BANNER_DISMISS_KEY)
      ) {
        if (!cancelled) setState('dismissed')
        return
      }
      const s = await getPushState()
      if (!cancelled) setState(s === 'on' ? 'dismissed' : s)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(PUSH_BANNER_DISMISS_KEY, '1')
    } catch {
      // تجاهل — الوضع الخاص في بعض المتصفحات
    }
    setState('dismissed')
  }

  const enable = async () => {
    setWorking(true)
    try {
      const result = await enablePushInteractive()
      if (result === 'on') {
        setState('dismissed')
        toast.success('تم التفعيل — ستصلك الإشعارات الفورية فوراً حتى والتطبيق مغلق')
        return
      }
      if (result === 'denied') {
        setState('dismissed')
        toast.error('الإشعارات محجوبة — يمكنك تفعيلها لاحقاً من إعدادات الموقع في المتصفح')
        return
      }
      toast.error('تعذر التفعيل الآن — حاول من زر «تفعيل الإشعارات الفورية» في القائمة')
    } finally {
      setWorking(false)
    }
  }

  if (state === 'checking' || state === 'dismissed') return null

  // iOS غير مثبت: إرشاد بلا زر تفعيل — الإشعارات تتاح بعد تثبيت الـ PWA فقط
  if (state === 'ios-hint') {
    return (
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
        <Bell className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="flex-1 leading-relaxed">
          ثبّت التطبيق من زر «تثبيت التطبيق» في القائمة ثم افتحه من شاشة جهازك — لتصلك
          الإشعارات الفورية فوراً عند كل تكليف أو تحديث يهمك
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="mt-0.5 text-muted-foreground transition hover:text-foreground"
          aria-label="إخفاء"
        >
          <X className="size-4" />
        </button>
      </div>
    )
  }

  if (state !== 'off') return null

  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
      <Bell className="size-4 shrink-0 text-primary" />
      <div className="flex-1 text-sm leading-relaxed">
        <span className="font-semibold">فعّل الإشعارات الفورية</span>
        <span className="text-muted-foreground">
          {' '}— تصلك التنبيهات فوراً بصوت وتنبيه منبثق حتى والتطبيق مغلق
        </span>
      </div>
      <Button size="sm" onClick={enable} disabled={working} className="gap-2">
        {working ? 'جارٍ التفعيل...' : 'تفعيل الآن'}
      </Button>
      <button
        type="button"
        onClick={dismiss}
        className="text-muted-foreground transition hover:text-foreground"
        aria-label="إخفاء"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
