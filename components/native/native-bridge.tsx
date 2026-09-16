'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * جسر تطبيق أندرويد الأصلي — الجولة 55
 *
 * يعمل فقط داخل تطبيق APK (حيث يحقن التطبيق كائن TakleefatBridge في الصفحة):
 * 1) عند دخول المستخدم: يربط الجهاز بحسابه عبر /api/native/link ثم يطلق
 *    خدمة التنبيهات الأمامية — إشعارات أصلية من التطبيق نفسه حتى لو مغلق.
 * 2) عند الخروج: يوقف الخدمة.
 * 3) يعرض لافتة لطيفة تطلب استثناء التطبيق من تحسينات البطارية على الأجهزة
 *    القاسية (شاومي/هواوي/أوبو...) لضمان وصول التنبيهات دائماً.
 *
 * على الموقع العادي (متصفح/PWA) يعيد null فوراً — صفر تأثير إطلاقاً.
 */

/** واجهة الجسر المحقونة من تطبيق أندرويد (MainActivity) */
export interface TakleefatAndroidBridge {
  getCredentials(): string
  startPush(): void
  stopPush(): void
  isBatteryOptimized(): boolean
  requestBatteryOptimization(): void
  openNotificationSettings(): void
  getAppVersion(): string
  reload(): void
}

export function getAndroidBridge(): TakleefatAndroidBridge | null {
  if (typeof window === 'undefined') return null
  return (
    (window as unknown as { TakleefatBridge?: TakleefatAndroidBridge }).TakleefatBridge ?? null
  )
}

const BATTERY_DISMISS_KEY = 'takleefat-battery-banner-dismissed-v1'

export function NativeBridge() {
  const { status, data: session } = useSession()
  const [showBattery, setShowBattery] = useState(false)

  useEffect(() => {
    const bridge = getAndroidBridge()
    if (!bridge) return

    let cancelled = false

    if (status === 'authenticated' && session?.user?.id) {
      try {
        const creds = JSON.parse(bridge.getCredentials()) as {
          deviceId?: string
          secret?: string
          model?: string
          appVersion?: string
        }
        if (!creds.deviceId || !creds.secret) return
        void fetch('/api/native/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(creds),
        })
          .then(async (res) => {
            if (!res.ok) throw new Error(`link_failed_${res.status}`)
            return res.json()
          })
          .then(() => {
            if (cancelled) return
            // الربط نجح — شغّل خدمة التنبيهات الأمامية
            try {
              bridge.startPush()
            } catch {
              /* الخدمة قد تكون شغالة أصلاً */
            }
            // لافتة البطارية: مرة واحدة فقط ما لم يُخفَ يدوياً من الإعدادات
            try {
              const dismissed = window.localStorage.getItem(BATTERY_DISMISS_KEY) === '1'
              setShowBattery(!bridge.isBatteryOptimized() && !dismissed)
            } catch {
              setShowBattery(false)
            }
          })
          .catch(() => null)
      } catch {
        /* جسر غير متوقع — تجاهل بصمت */
      }
    } else if (status === 'unauthenticated') {
      try {
        bridge.stopPush()
      } catch {
        /* قد تكون متوقفة أصلاً */
      }
      setShowBattery(false)
    }

    return () => {
      cancelled = true
    }
  }, [status, session?.user?.id])

  if (!showBattery) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] p-3" dir="rtl">
      <div className="mx-auto flex max-w-xl items-start gap-3 rounded-2xl border bg-card/95 p-4 shadow-xl backdrop-blur">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
        <div className="flex-1">
          <p className="text-sm font-bold">لاستقبال التنبيهات حتى مع إغلاق التطبيق</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            اسمح لتطبيق تكليفات بالعمل دون قيود البطارية — بعض الأجهزة توقف خدمة
            التنبيهات في الخلفية وتفوتك التكليفات الجديدة بدونها.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-1.5">
          <Button
            size="sm"
            className="h-8"
            onClick={() => {
              try {
                getAndroidBridge()?.requestBatteryOptimization()
              } catch {
                /* لا شيء */
              }
              setShowBattery(false)
            }}
          >
            السماح
          </Button>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:underline"
            onClick={() => {
              try {
                window.localStorage.setItem(BATTERY_DISMISS_KEY, '1')
              } catch {
                /* لا شيء */
              }
              setShowBattery(false)
            }}
          >
            لاحقاً
          </button>
        </div>
      </div>
    </div>
  )
}
