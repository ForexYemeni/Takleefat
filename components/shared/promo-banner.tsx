'use client'

import { useQuery } from '@tanstack/react-query'
import { Gift } from 'lucide-react'
import { apiFetcher } from '@/lib/api-client'
import { isPromoActive } from '@/lib/utils'

/**
 * بانر العرض بدون رسوم إدارة — الجولة 44
 * =====================================================
 * يظهر في لوحات الجهات والكوادر أثناء العرض النشط فقط:
 * «عرض بدون رسوم إدارة — حتى {التاريخ} — {الملاحظة}»
 * يعتمد على إعدادات المنصة (promoActive/promoUntil/promoNote) التي
 * تضبطها الإدارة من صفحة الرسوم وطرق الدفع.
 */

interface SettingsPayload {
  settings: {
    promoActive?: boolean
    promoUntil?: string | null
    promoNote?: string
  }
}

export function PromoBanner() {
  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiFetcher<SettingsPayload>('/api/settings'),
    staleTime: 60 * 1000,
  })

  const s = data?.settings
  if (!s || !isPromoActive(s)) return null

  const until = s.promoUntil
    ? new Intl.DateTimeFormat('ar', {
        day: 'numeric',
        month: 'long',
        timeZone: 'Asia/Riyadh',
      }).format(new Date(s.promoUntil))
    : null

  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-l from-emerald-500 via-teal-500 to-emerald-600 p-4 text-white shadow-sm dark:border-emerald-800">
      <div className="absolute -left-6 -top-6 size-24 rounded-full bg-white/15 blur-xl" />
      <div className="relative flex flex-wrap items-center gap-3">
        <span className="shrink-0 rounded-xl bg-white/20 p-2.5 backdrop-blur">
          <Gift className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold">
            عرض بدون رسوم إدارة{until ? ` — حتى ${until}` : ''}
          </p>
          <p className="text-xs leading-relaxed text-emerald-50">
            {s.promoNote?.trim()
              ? s.promoNote.trim()
              : 'جميع التكليفات الجديدة تُنشأ الآن بدون حصة إدارة — عرض لفترة محدودة من إدارة المنصة'}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-white/20 px-3 py-1 text-[11px] font-extrabold backdrop-blur">
          0 ريال رسوم
        </span>
      </div>
    </div>
  )
}
