'use client'

import { useQuery } from '@tanstack/react-query'
import { Eye, Loader2, Users } from 'lucide-react'
import { apiFetcher } from '@/lib/api-client'
import type { AudiencePreviewResult } from '@/lib/network'
import { Badge } from '@/components/ui/badge'

/**
 * معاينة حية لجمهور التكليف أثناء إنشائه (الجولة العاشرة) — تظهر مباشرة
 * عدد الكوادر الذين سيصلهم التكليف وتوزيعهم الهرمي قبل النشر، بنفس منطق
 * الرؤية الفعلي (فلتر الجنس + خصوصية التوزيع + مطابقة القسم).
 */

interface AudiencePreviewCardProps {
  hospitalId: string
  gender: string
  department: string
  distribution: string
  enabled: boolean
}

const BREAKDOWN_CHIPS: Array<{ key: keyof AudiencePreviewResult['breakdown']; label: string; cls: string }> = [
  { key: 'favorites', label: 'مفضلون', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
  { key: 'working', label: 'يعملون بالجهة', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
  { key: 'endorsed', label: 'معتمدون', cls: 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300' },
  { key: 'interviewed', label: 'متقابلون', cls: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300' },
  { key: 'external', label: 'خارجيون مؤهلون', cls: 'bg-secondary text-secondary-foreground' },
]

const PROGRESSIVE_STAGES: Array<{ key: 'stage0' | 'stage1' | 'stage2' | 'stage3'; label: string }> = [
  { key: 'stage0', label: 'المرحلة 1 — المفضلون والعاملون/المعتمدون بالجهة' },
  { key: 'stage1', label: 'المرحلة 2 — العاملون والمعتمدون بالجهة' },
  { key: 'stage2', label: 'المرحلة 3 — المتقابلون والخارجيون أيضاً' },
  { key: 'stage3', label: 'المرحلة 4 — كل الكوادر المؤهلين المطابقين' },
]

export function AudiencePreviewCard({ hospitalId, gender, department, distribution, enabled }: AudiencePreviewCardProps) {
  const { data, isFetching, isError } = useQuery({
    queryKey: ['post-audience-preview', hospitalId, gender, department, distribution],
    queryFn: () =>
      apiFetcher<AudiencePreviewResult>(
        `/api/posts/audience-preview?hospitalId=${encodeURIComponent(hospitalId)}&gender=${gender}&department=${encodeURIComponent(department)}&distribution=${distribution}`
      ),
    enabled: enabled && !!hospitalId,
    staleTime: 10_000,
    placeholderData: (prev) => prev,
  })

  if (!hospitalId) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed bg-background px-3 py-2.5 text-xs text-muted-foreground">
        <Eye className="size-3.5" />
        اختر الجهة الصحية لتظهر لك معاينة حية لعدد الكوادر الذين سيصلهم التكليف
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed bg-background px-3 py-2.5 text-xs text-muted-foreground">
        <Eye className="size-3.5" />
        تعذر تحميل معاينة الجمهور — يمكنك المتابعة والنشر بشكل طبيعي
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-background p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-primary/10 p-1.5">
          {isFetching && !data ? (
            <Loader2 className="size-4 animate-spin text-primary" />
          ) : (
            <Users className="size-4 text-primary" />
          )}
        </span>
        <p className="text-xs font-bold">معاينة الجمهور المستهدف قبل النشر</p>
        {isFetching && data && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-2xl font-extrabold text-primary">{data?.total ?? '—'}</span>
        <span className="text-xs font-semibold text-muted-foreground">
          كادراً سيصلهم هذا التكليف فور نشره
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {BREAKDOWN_CHIPS.map((chip) => (
          <Badge key={chip.key} variant="outline" className={`gap-1 border-transparent text-[11px] font-bold ${chip.cls}`}>
            {chip.label}: {data?.breakdown?.[chip.key] ?? 0}
          </Badge>
        ))}
      </div>

      {data?.progressive && (
        <ol className="mt-2.5 space-y-1 border-t pt-2.5 text-[11px] text-muted-foreground">
          {PROGRESSIVE_STAGES.map((s) => (
            <li key={s.key} className="flex items-center justify-between gap-2">
              <span>{s.label}</span>
              <span className="font-extrabold text-foreground">{data.progressive?.[s.key]}</span>
            </li>
          ))}
        </ol>
      )}

      {data && data.total === 0 && (
        <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          لا يوجد كوادر مطابقون بهذه الشروط حالياً — جرّب تغيير الجهة أو الجنس أو طريقة التوزيع
        </p>
      )}
    </div>
  )
}
