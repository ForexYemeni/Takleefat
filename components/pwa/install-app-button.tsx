'use client'

import { useCallback, useEffect, useState } from 'react'
import { Download, MonitorSmartphone, Share, SquarePlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * زر «تثبيت التطبيق» — PWA
 * يحوّل المنصة إلى تطبيق مستقل على شاشة الجوال الرئيسية بأيقونة المنصة،
 * دون متجر تطبيقات ودون تنزيل أي ملفات.
 *
 * - أندرويد / كروم / إيدج: يستخدم حدث beforeinstallprompt الرسمي (تثبيت مباشر)
 * - iOS / Safari: لا يدعم التثبيت البرمجي — يعرض دليلاً بخطوات
 *   «مشاركة ← إضافة إلى الشاشة الرئيسية»
 * - داخل التطبيق المثبّت مسبقاً: يختفي الزر تلقائياً
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallAppButton({
  className,
  variant = 'outline',
  size = 'default',
}: {
  className?: string
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'link' | 'destructive'
  size?: 'default' | 'sm' | 'lg' | 'icon'
}) {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)

  useEffect(() => {
    const standaloneQuery = window.matchMedia('(display-mode: standalone)')
    const standaloneIOS =
      'standalone' in window.navigator &&
      Boolean((window.navigator as { standalone?: boolean }).standalone)
    setInstalled(standaloneQuery.matches || standaloneIOS)

    const userAgent = window.navigator.userAgent
    setIsIOS(
      /iPad|iPhone|iPod/.test(userAgent) ||
        (/Macintosh/.test(userAgent) && window.navigator.maxTouchPoints > 1)
    )

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setPromptEvent(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setPromptEvent(null)
      toast.success('تم تثبيت تطبيق تكليفات على جهازك بنجاح')
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    const onChange = (e: MediaQueryListEvent) => setInstalled(e.matches)
    standaloneQuery.addEventListener('change', onChange)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
      standaloneQuery.removeEventListener('change', onChange)
    }
  }, [])

  const handleInstall = useCallback(async () => {
    if (!promptEvent) return
    try {
      await promptEvent.prompt()
      const { outcome } = await promptEvent.userChoice
      if (outcome === 'accepted') {
        toast.success('جارٍ تثبيت التطبيق… ستجده على شاشتك الرئيسية')
      }
    } catch {
      toast.error('تعذّر بدء التثبيت، حاول مرة أخرى')
    } finally {
      setPromptEvent(null)
    }
  }, [promptEvent])

  // مخفي تماماً داخل التطبيق المثبّت أو على المتصفحات غير المدعومة
  if (installed) return null

  const showDirectInstall = Boolean(promptEvent)
  const showIOSGuide = !showDirectInstall && isIOS
  if (!showDirectInstall && !showIOSGuide) return null

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={() => (showDirectInstall ? handleInstall() : setGuideOpen(true))}
        aria-label="تثبيت تطبيق تكليفات على جهازك"
      >
        <Download className="size-4" />
        تثبيت التطبيق
      </Button>

      {/* دليل التثبيت لأجهزة iOS — سفاري لا يدعم التثبيت البرمجي */}
      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader className="text-start">
            <DialogTitle className="flex items-center gap-2 text-lg font-extrabold">
              <MonitorSmartphone className="size-5 text-primary" />
              تثبيت التطبيق على آيفون أو آيباد
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              أضف منصة تكليفات كتطبيق مستقل على شاشتك الرئيسية بأيقونتها الخاصة —
              دون متجر تطبيقات، باتباع الخطوات التالية:
            </DialogDescription>
          </DialogHeader>
          <ol className="flex flex-col gap-3 text-sm">
            <li className="flex items-start gap-3 rounded-xl border bg-muted/40 p-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                1
              </span>
              <span>
                افتح الموقع عبر متصفح <strong>Safari</strong> إن كنت تستخدم متصفحاً آخر.
              </span>
            </li>
            <li className="flex items-start gap-3 rounded-xl border bg-muted/40 p-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                2
              </span>
              <span className="flex items-center gap-1.5 flex-wrap">
                اضغط على أيقونة المشاركة
                <Share className="size-4 inline text-primary" aria-hidden="true" />
                في أسفل شاشة سفاري.
              </span>
            </li>
            <li className="flex items-start gap-3 rounded-xl border bg-muted/40 p-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                3
              </span>
              <span className="flex items-center gap-1.5 flex-wrap">
                اختر «إضافة إلى الشاشة الرئيسية»
                <SquarePlus className="size-4 inline text-primary" aria-hidden="true" />
                من القائمة.
              </span>
            </li>
            <li className="flex items-start gap-3 rounded-xl border bg-muted/40 p-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                4
              </span>
              <span>
                اضغط «إضافة» — سيظهر تطبيق <strong>تكليفات</strong> مع بقية تطبيقاتك.
              </span>
            </li>
          </ol>
        </DialogContent>
      </Dialog>
    </>
  )
}
