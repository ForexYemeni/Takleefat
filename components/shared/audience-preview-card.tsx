'use client'

import { useQuery } from '@tanstack/react-query'
import { BellRing, Eye, Loader2, Sparkles, Users } from 'lucide-react'
import { apiFetcher } from '@/lib/api-client'
import type { AudiencePreviewResult } from '@/lib/network'
import { Badge } from '@/components/ui/badge'

/**
 * معاينة حية فاخرة لجمهور التكليف أثناء إنشائه — تظهر مباشرة
 * عدد الكوادر الذين سيصلهم التكليف وتوزيعهم الهرمي قبل النشر، بنفس منطق
 * الرؤية الفعلي (فلتر الجنس + خصوصية التوزيع + مطابقة القسم).
 * مع قسم محدد: تُبرز التوجيه المباشر لكوادر القسم المصرّحين به ضمن أقسام عملهم.
 */

interface AudiencePreviewCardProps {
  hospitalId: string
  gender: string
  department: string
  distribution: string
  enabled: boolean
  /** جمهور التكليف — DOCTOR لجمهور الأطباء (منظومة الأطباء) */
  audience?: 'NURSE' | 'DOCTOR' | null
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

export function AudiencePreviewCard({ hospitalId, gender, department, distribution, enabled, audience }: AudiencePreviewCardProps) {
  const { data, isFetching, isError } = useQuery({
    queryKey: ['post-audience-preview', hospitalId, gender, department, distribution, audience ?? ''],
    queryFn: () =>
      apiFetcher<AudiencePreviewResult>(
        `/api/posts/audience-preview?hospitalId=${encodeURIComponent(hospitalId)}&gender=${gender}&department=${encodeURIComponent(department)}&distribution=${distribution}${audience === 'DOCTOR' ? '&audience=DOCTOR' : ''}`
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

  const dept = data?.departmentName ?? ''

  return (
    <div className="overflow-hidden rounded-2xl border bg-background">
      {/* اللوحة الرئيسية — العدد الكلي + جمهور الإشعارات */}
      <div className="relative bg-gradient-to-bl from-primary/10 via-primary/5 to-transparent p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-extrabold">
            <span className="rounded-lg bg-primary/10 p-1.5">
              {isFetching && !data ? (
                <Loader2 className="size-4 animate-spin text-primary" />
              ) : (
                <Users className="size-4 text-primary" />
              )}
            </span>
            معاينة الجمهور المستهدف قبل النشر
            {isFetching && data && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
          </p>
          {dept && (
            <Badge variant="secondary" className="gap-1 bg-primary/10 text-primary">
              <Sparkles className="size-3" />
              قسم {dept}
            </Badge>
          )}
        </div>

        <div className="mt-2.5 flex flex-wrap items-end gap-x-6 gap-y-2">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black leading-none text-primary">{data?.total ?? '—'}</span>
              <span className="text-xs font-bold text-muted-foreground">كادر سيصلهم التكليف</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">الجمهور الذي يستطيع رؤية التكليف والتقديم عليه فور نشره</p>
          </div>
          <div className="min-w-40 flex-1 rounded-xl border border-primary/15 bg-background/70 px-3 py-2">
            <p className="flex items-center gap-1.5 text-[11px] font-extrabold text-primary">
              <BellRing className="size-3.5" />
              الإشعارات الفورية
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              {dept
                ? `توجيه مباشر: ستصل الإشعارات لـ ${data?.directNotify ?? 0} كادر مطابق للقسم${dept ? ` (${dept})` : ''}`
                : `ستصل الإشعارات لـ ${data?.directNotify ?? 0} كادر فور النشر`}
            </p>
          </div>
        </div>

        {dept && (
          <p className="mt-2 flex flex-wrap items-center gap-1.5 rounded-xl bg-primary/5 px-3 py-2 text-[11px] font-bold">
            <Sparkles className="size-3.5 text-primary" />
            كوادر مصرّحون بقسم {dept} ضمن أقسام عملهم:
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
              {data?.departmentMatch ?? 0}
            </span>
            <span className="font-normal text-muted-foreground">
              — سيصلهم إشعار مخصص «أنت من كادر هذا القسم»
            </span>
          </p>
        )}
      </div>

      <div className="border-t p-3">
        <div className="flex flex-wrap gap-1.5">
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
    </div>
  )
}
