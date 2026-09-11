'use client'

import { useCallback, useEffect, useState } from 'react'
import { BellOff, BellPlus, BellRing, Loader2, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  enablePushInteractive,
  getPushState,
  sendTestPush,
  type PushSupportState,
} from '@/lib/push-client'

/**
 * مؤشر حالة الإشعارات الفورية في رأس اللوحات — الجولة السابعة عشرة
 *
 * لماذا؟ الإشعارات المنبثقة خارج التطبيق (مع الصوت) تتطلب اشتراكاً فعّالاً
 * لكل جهاز، واللافتة القابلة للإخفاء وحدها لم تكفِ — كثير من الأجهزة بقيت
 * غير مشتركة فظهرت الإشعارات داخل التطبيق فقط. هذا المؤشر:
 * - ظاهر دائماً في رأس كل اللوحات (غير قابل للإخفاء) — الحالة بلا غموض
 * - غير مفعّل → زر تفعيل بنقرة واحدة، وبعد النجاح يُرسل إشعاراً تجريبياً
 *   فوراً ليرى المستخدم النتيجة خارج التطبيق بعينه
 * - مفعّل → نقرة تُرسل إشعاراً تجريبياً حقيقياً للتحقق من الوصول الخارجي
 * - محجوب / يتطلب تثبيت PWA → إرشاد فوري عند النقر
 * - عند كل تحميل وعند العودة للتبويب يزامن الاشتراك المحلي مع الخادم بصمت
 *   (تداوي ذاتي للأجهزة التي فاتها الرفع) عبر getPushState
 */
export function PushStatusChip() {
  const [state, setState] = useState<PushSupportState | 'checking'>('checking')
  const [working, setWorking] = useState(false)

  const refresh = useCallback(() => {
    void getPushState().then((s) => {
      setState(s)
    })
  }, [])

  useEffect(() => {
    refresh()
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh])

  const enable = async () => {
    setWorking(true)
    try {
      const result = await enablePushInteractive()
      if (result === 'on') {
        setState('on')
        toast.success('تم التفعيل — ستصلك الإشعارات بصوت وتنبيه منبثق حتى والتطبيق مغلق')
        // إشعار تجريبي فوري — دليل ملموس أن الوصول الخارجي يعمل
        const test = await sendTestPush()
        if (test && test.delivered > 0) {
          toast.success('أرسلنا إشعاراً تجريبياً — يجب أن تراه الآن خارج التطبيق')
        }
        return
      }
      if (result === 'denied') {
        setState('blocked')
        toast.error('الإشعارات محجوبة — اسمح بها من إعدادات الموقع في المتصفح ثم أعد تحميل الصفحة')
        return
      }
      if (result === 'ios-hint') {
        setState('ios-hint')
        toast.info('على الآيفون: ثبّت التطبيق أولاً من زر «تثبيت التطبيق» ثم افتحه من شاشة الجهاز')
        return
      }
      if (result === 'unconfigured' || result === 'unsupported') {
        toast.error('الإشعارات الفورية غير متاحة على هذا الجهاز حالياً')
        return
      }
      toast.error('تعذر التفعيل — تأكد من الاتصال وحاول مجدداً')
    } finally {
      setWorking(false)
    }
  }

  const testNow = async () => {
    setWorking(true)
    try {
      const test = await sendTestPush()
      if (!test) {
        toast.error('تعذر إرسال الإشعار التجريبي — حاول مجدداً')
        return
      }
      if (test.delivered > 0) {
        toast.success(
          test.delivered === 1
            ? 'أُرسل إشعار تجريبي إلى جهازك بنجاح — إن لم يظهر خلال دقيقة: فعّل إشعارات المتصفح/التطبيق من إعدادات النظام وعطّل مُحسِّن البطارية ووضع عدم الإزعاج'
            : `أُرسل إشعار تجريبي إلى ${test.delivered} أجهزة — إن لم يظهر على جهاز معين ففعّل إشعارات المتصفح من إعدادات النظام`
        )
      } else {
        setState('off')
        toast.error('لا يوجد اشتراك فعّال لهذا الحساب — أعد التفعيل من هذا الزر')
      }
    } finally {
      setWorking(false)
    }
  }

  const blockedHint = () => {
    toast.info(
      'الإشعارات محجوبة من إعدادات المتصفح — افتح إعدادات الموقع (أيقونة القفل أو ⓘ بجوار العنوان) واسمح بالإشعارات ثم أعد تحميل الصفحة'
    )
  }

  const iosHint = () => {
    toast.info(
      'على أجهزة آيفون/آيباد: ثبّت التطبيق من زر «تثبيت التطبيق» في القائمة ثم افتحه من شاشة الجهاز وفعّل الإشعارات'
    )
  }

  if (state === 'checking') {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        className="gap-1.5 text-muted-foreground"
        aria-label="جارٍ فحص حالة الإشعارات"
      >
        <Loader2 className="size-4 animate-spin" />
        <span className="hidden md:inline">الإشعارات</span>
      </Button>
    )
  }

  if (state === 'unconfigured' || state === 'unsupported') return null

  if (state === 'on') {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={testNow}
        disabled={working}
        className="gap-1.5 border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary"
        aria-label="الإشعارات الفورية مفعّلة — إرسال إشعار تجريبي"
      >
        {working ? <Loader2 className="size-4 animate-spin" /> : <BellRing className="size-4" />}
        <span className="hidden md:inline">الإشعارات مفعّلة</span>
      </Button>
    )
  }

  if (state === 'off') {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={enable}
        disabled={working}
        className="gap-1.5 border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-400"
        aria-label="تفعيل الإشعارات الفورية الخارجية"
      >
        {working ? <Loader2 className="size-4 animate-spin" /> : <BellPlus className="size-4" />}
        <span className="hidden sm:inline">تفعيل الإشعارات الخارجية</span>
        <span className="sm:hidden">الإشعارات</span>
      </Button>
    )
  }

  if (state === 'blocked') {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={blockedHint}
        className="gap-1.5 text-muted-foreground"
        aria-label="الإشعارات محجوبة — عرض طريقة السماح بها"
      >
        <BellOff className="size-4" />
        <span className="hidden md:inline">الإشعارات محجوبة</span>
      </Button>
    )
  }

  // ios-hint — يتطلب تثبيت الـ PWA قبل تفعيل الإشعارات
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={iosHint}
      className="gap-1.5 border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary"
      aria-label="ثبّت التطبيق لتفعيل الإشعارات"
    >
      <Smartphone className="size-4" />
      <span className="hidden sm:inline">ثبّت التطبيق للإشعارات</span>
    </Button>
  )
}
