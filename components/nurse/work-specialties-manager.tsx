'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BellRing, Check, HeartPulse, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetcher, apiPut } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

/**
 * تخصصات عمل الطبيب — اختيار فاخر متعدد التخصصات من كتالوج التخصصات الطبية:
 * باطنية، جراحة عامة، أطفال، نساء وولادة... (عدة تخصصات معاً — منظومة الأطباء)
 * عند إنشاء تكليف أطباء في أحد التخصصات المختارة يصل إشعار فوري مباشر للطبيب.
 */

interface SpecialtyOption {
  id: string
  name: string
}

interface WorkSpecialtiesData {
  specialties: SpecialtyOption[]
  allSpecialties: SpecialtyOption[]
}

export function WorkDepartmentsManager() {
  const qc = useQueryClient()
  // مسودة محلية — null يعني لا تعديلات بعد (العرض من بيانات الخادم مباشرة)
  const [draft, setDraft] = useState<string[] | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['my-work-specialties'],
    queryFn: () =>
      apiFetcher<WorkSpecialtiesData>('/api/me/work-specialties'),
  })

  const all = data?.allSpecialties ?? []
  const serverIds = useMemo(() => (data?.specialties ?? []).map((d) => d.id), [data])
  // المختار فعلياً: المسودة إن وُجدت وإلا قائمة الخادم
  const selected = draft ?? serverIds

  const dirty = draft != null && [...serverIds].sort().join(',') !== [...selected].sort().join(',')

  const mineNames = useMemo(
    () =>
      (data?.specialties ?? [])
        .filter((d) => selected.includes(d.id))
        .map((d) => d.name),
    [data, selected]
  )

  const saveMutation = useMutation({
    mutationFn: () =>
      apiPut<{ message: string; specialties: SpecialtyOption[] }>(
        '/api/me/work-specialties',
        { specialtyIds: selected }
      ),
    onSuccess: (res) => {
      toast.success(res.message)
      setDraft(null)
      qc.setQueryData<WorkSpecialtiesData>(['my-work-specialties'], (prev) =>
        prev ? { ...prev, specialties: res.specialties } : prev
      )
      qc.invalidateQueries({ queryKey: ['professional-profile'] })
    },
    onError: (e) => toast.error((e as Error).message),
  })

  const toggle = (id: string) => {
    setDraft((prev) => {
      const base = prev ?? serverIds
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id]
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-lg font-extrabold">
            <span className="rounded-xl bg-primary/10 p-1.5">
              <HeartPulse className="size-4 text-primary" />
            </span>
            تخصصات العمل
            {data && data.specialties.length > 0 && (
              <Badge className="bg-primary/10 text-primary" variant="secondary">
                {data.specialties.length} تخصص
              </Badge>
            )}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            اختر كل التخصصات الطبية التي تعمل بها — باطنية، جراحة، أطفال، نساء وغيرها. عند إنشاء
            تكليف في أحد تخصصاتك يصلك إشعار فوري مباشر قبل غيرك من الأطباء.
          </p>
        </div>
        {dirty && (
          <Button
            size="sm"
            className="gap-1.5"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            حفظ تخصصاتي ({selected.length})
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="flex items-center gap-2 rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          جارٍ تحميل تخصصات الإدارة...
        </p>
      ) : all.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
          لم تُضف الإدارة تخصصات بعد — ستظهر هنا فور توفرها في كتالوج التخصصات الطبية
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {all.map((d) => {
              const isOn = selected.includes(d.id)
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => toggle(d.id)}
                  aria-pressed={isOn}
                  className={cn(
                    'group flex items-center gap-2 rounded-2xl border-2 px-3 py-2.5 text-start text-sm font-bold transition-all',
                    isOn
                      ? 'border-primary bg-primary/10 text-primary shadow-sm'
                      : 'border-transparent bg-secondary/50 text-foreground/80 hover:border-primary/30 hover:bg-secondary'
                  )}
                >
                  <span
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                      isOn ? 'border-primary bg-primary text-white' : 'border-muted-foreground/40'
                    )}
                  >
                    {isOn && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <span className="truncate">{d.name}</span>
                </button>
              )
            })}
          </div>

          {/* شريط المعاينة — ما سيصل للطبيب فور اختياره */}
          {selected.length > 0 && (
            <p className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs font-semibold">
              <BellRing className="size-3.5 text-primary" />
              ستصلك تكليفات التخصصات:
              <span className="flex flex-wrap gap-1">
                {mineNames.map((n) => (
                  <span
                    key={n}
                    className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-extrabold text-primary"
                  >
                    {n}
                  </span>
                ))}
              </span>
            </p>
          )}

          {dirty && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={saveMutation.isPending}
              onClick={() => setDraft(null)}
            >
              <RefreshCw className="size-3.5" />
              تراجع عن التعديلات
            </Button>
          )}
        </>
      )}
    </div>
  )
}
