'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useNotifications } from '@/hooks/use-notifications'
import { notificationVisuals } from '@/components/shared/notification-visuals'
import { isAlertSoundEnabled, playAlertChime, unlockAudio } from '@/lib/alert-sound'
import { getPushState } from '@/lib/push-client'
import { cn } from '@/lib/utils'

/**
 * الطبقة الفورية داخل التطبيق — الجولة السادسة عشرة
 * أثناء استخدام المنصة مباشرة: كل إشعار جديد يصدر نغمة تنبيه + بطاقة منبثقة
 * قابلة للنقر تفتح وجهة الإشعار، بالتوازي مع Web Push عند إغلاق الصفحة.
 *
 * آلية العمل:
 * - يعيد استخدام نفس استعلام الإشعارات (polling كل 15 ثانية) — بلا أي حمل إضافي
 * - أول تحميل يسجّل الموجود دون تنبيهات بأثر رجعي، وما بعده يُرصد حصراً
 * - الصفحة مخفية + الجهاز مشترك → العرض لنظام التشغيل عبر Web Push (بلا ازدواجية)
 * - الصفحة مخفية + الجهاز غير مشترك → النغمة تُسمع فوراً من الخلفية، والبطاقات
 *   تُعرض فور عودة المستخدم (لا يُفقد أي إشعار — الجولة السابعة عشرة)
 * - النغمة مرة واحدة كحد أدنى كل 3 ثوانٍ مهما تلاحق الإشعارات، والبطاقات 3 كحد أقصى لكل دفعة
 * - عودة المستخدم إلى التبويب = جلب فوري بدل انتظار الدورة التالية
 */

const MAX_TOASTS_PER_BATCH = 3
const CHIME_MIN_GAP_MS = 3000

export function NotificationRealtime() {
  const { notifications, markRead } = useNotifications()
  const router = useRouter()
  const queryClient = useQueryClient()
  const knownIds = useRef<Set<string> | null>(null)
  const lastChimeAt = useRef(0)
  // حالة اشتراك هذا الجهاز — null قبل أول فحص (يُعامَل حينها كسلوك الجولة 16)
  const subscribedRef = useRef<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    void getPushState().then((s) => {
      if (!cancelled) subscribedRef.current = s === 'on'
    })
    return () => {
      cancelled = true
    }
  }, [])

  // فتح سياق الصوت بأول تفاعل — مرة واحدة على مستوى التطبيق
  useEffect(() => {
    unlockAudio()
  }, [])

  // عودة إلى التبويب = تحديث فوري للإشعارات + إعادة فحص حالة الاشتراك
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void queryClient.invalidateQueries({ queryKey: ['notifications'] })
        void getPushState().then((s) => {
          subscribedRef.current = s === 'on'
        })
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [queryClient])

  useEffect(() => {
    if (knownIds.current === null) {
      // أول تحميل — نُسجّل الموجود بلا تنبيهات بأثر رجعي
      knownIds.current = new Set(notifications.map((n) => n.id))
      return
    }

    const fresh = notifications.filter((n) => !knownIds.current!.has(n.id))
    if (fresh.length === 0) return

    const pageHidden = document.visibilityState !== 'visible'

    if (pageHidden) {
      if (subscribedRef.current === false) {
        // الجهاز غير مشترك بـ Web Push — لا شيء سيظهر من النظام:
        // النغمة تُسمع فوراً حتى والتبويب بالخلفية (السياق مفتوح سابقاً)،
        // والإشعارات لا تُسجّل كمعروفة فتُعرض بطاقاتها فور عودة المستخدم
        const nowHidden = Date.now()
        if (isAlertSoundEnabled() && nowHidden - lastChimeAt.current >= CHIME_MIN_GAP_MS) {
          lastChimeAt.current = nowHidden
          playAlertChime()
        }
        return
      }
      // الجهاز مشترك (أو الحالة غير معروفة بعد) — نظام التشغيل يتولى العرض
      for (const n of fresh) knownIds.current!.add(n.id)
      return
    }

    for (const n of fresh) knownIds.current!.add(n.id)

    const now = Date.now()
    if (isAlertSoundEnabled() && now - lastChimeAt.current >= CHIME_MIN_GAP_MS) {
      lastChimeAt.current = now
      playAlertChime()
    }

    const batch = [...fresh].reverse().slice(0, MAX_TOASTS_PER_BATCH)
    for (const n of batch) {
      const { icon: Icon, tint } = notificationVisuals(n.type)
      toast.custom(
        (id) => (
          <button
            type="button"
            onClick={() => {
              toast.dismiss(id)
              if (!n.isRead) markRead({ id: n.id })
              if (n.link) router.push(n.link)
            }}
            className="flex w-full items-start gap-3 rounded-2xl border bg-popover p-4 text-start shadow-lg outline-none transition-transform hover:scale-[1.015] focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-xl',
                tint
              )}
            >
              <Icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-extrabold leading-snug text-foreground">
                {n.title}
              </span>
              {n.body && (
                <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
                  {n.body}
                </span>
              )}
              <span className="mt-1.5 block text-[10.5px] font-bold text-primary">
                اضغط للعرض ←
              </span>
            </span>
          </button>
        ),
        { duration: 8000 }
      )
    }
  }, [notifications, markRead, router])

  return null
}
