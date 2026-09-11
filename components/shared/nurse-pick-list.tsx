'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckSquare, Search, Square, Users } from 'lucide-react'
import { apiFetcher } from '@/lib/api-client'
import { AFFILIATION_STATUS_LABELS, MATCH_PRIORITY_LABELS } from '@/lib/network'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { FavoriteStar } from '@/components/shared/favorite-star'

/**
 * قائمة اختيار الكوادر — المطابقة الذكية بالأولويات:
 * 5 المفضلون ← 4 العاملون بالجهة ← 3 المعتمدون ← 2 المتقابَل معهم ← 1 الخارجيون
 * مع بحث سريع + نجمة المفضلة + حالة الاعتماد + حالة التوفر.
 * تُستخدم في: إنشاء تكليف (استدعاء محدد) + استدعاء كوادر لتكليف قائم.
 */

export interface SuggestedNurse {
  id: string
  name: string
  phone: string
  gender: string | null
  specialty: string | null
  yearsOfExperience: number | null
  /** أقسام العمل المصرّح بها من الكادر (كتالوج الإدارة) */
  workDepartments?: string[]
  /** يطابق قسم التكليف المطلوب ضمن أقسام عمله؟ */
  departmentMatch?: boolean
  ratingAverage: number | null
  ratingCount: number
  isFavorite: boolean
  affiliationStatus: string | null
  priority: number
  priorityLabel?: string
  isAvailable: boolean
  invitationStatus?: string | null
  applicationStatus?: string | null
}

export function useSuggestedNurses(
  hospitalId: string | null | undefined,
  gender: string | null | undefined,
  department?: string | null,
  enabled = true,
  audience?: 'NURSE' | 'DOCTOR' | null
) {
  return useQuery({
    queryKey: ['receiver-nurses', hospitalId, gender, department ?? '', audience ?? ''],
    queryFn: () =>
      apiFetcher<{ nurses: SuggestedNurse[]; summary: { total: number; available: number } }>(
        `/api/receiver/nurses?hospitalId=${hospitalId ?? ''}&gender=${gender || 'ANY'}&department=${encodeURIComponent(department ?? '')}${audience === 'DOCTOR' ? '&audience=DOCTOR' : ''}`
      ),
    // hospitalId اختياري — عند فراغه تُرجع الـ API الكوادر المرتبطين بجهة المستلم تلقائياً
    enabled,
  })
}

export function NursePickList({
  hospitalId,
  gender,
  department,
  selected,
  onToggle,
  emptyText = 'لا يوجد كوادر مطابقون — اختر جهة أخرى أو عدّل الجنس المطلوب',
  heightClass = 'max-h-64',
  audience,
}: {
  hospitalId: string | null | undefined
  gender: string | null | undefined
  department?: string | null
  selected: string[]
  onToggle: (id: string) => void
  emptyText?: string
  heightClass?: string
  audience?: 'NURSE' | 'DOCTOR' | null
}) {
  const [search, setSearch] = useState('')
  const { data, isLoading } = useSuggestedNurses(hospitalId, gender, department, true, audience)

  const nurses = useMemo(() => {
    const all = data?.nurses ?? []
    if (!search.trim()) return all
    return all.filter(
      (n) => n.name.includes(search) || n.phone.includes(search) || (n.specialty ?? '').includes(search)
    )
  }, [data, search])

  if (isLoading) {
    return <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">جارٍ جلب الكوادر المطابقين...</p>
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="بحث: اسم / هاتف / تخصص" className="h-9 ps-9 text-xs" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Badge variant="secondary" className="gap-1 shrink-0">
          <Users className="size-3" />
          {data?.summary?.total ?? 0} مطابق
        </Badge>
      </div>

      <div className={`${heightClass} space-y-1 overflow-y-auto rounded-xl border bg-background p-2`}>
        {nurses.length === 0 && (
          <p className="p-4 text-center text-xs text-muted-foreground">{emptyText}</p>
        )}
        {nurses.map((n) => {
          const isSelected = selected.includes(n.id)
          const alreadyApplied = !!n.applicationStatus
          const deptMatch = !!n.departmentMatch
          return (
            <button
              key={n.id}
              type="button"
              disabled={alreadyApplied}
              onClick={() => onToggle(n.id)}
              className={`flex w-full flex-wrap items-center gap-2 rounded-lg px-2 py-2 text-start text-xs transition-colors ${
                deptMatch ? 'bg-primary/5' : ''
              } ${isSelected ? 'bg-primary/10' : 'hover:bg-accent'} ${
                alreadyApplied ? 'opacity-50' : ''
              }`}
            >
              {isSelected ? (
                <CheckSquare className="size-4 shrink-0 text-primary" />
              ) : (
                <Square className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="text-amber-500" title={n.priorityLabel ?? MATCH_PRIORITY_LABELS[n.priority]}>
                {'★'.repeat(Math.max(1, n.priority))}
              </span>
              <span className="font-bold">{n.name}</span>
              <span className="truncate text-muted-foreground">{n.specialty ?? ''}</span>
              {deptMatch && (
                <Badge className="bg-primary/10 text-primary text-[10px] shrink-0" variant="secondary">
                  يطابق القسم
                </Badge>
              )}
              {(n.workDepartments ?? []).slice(0, 3).map((d) => (
                <Badge key={d} variant="outline" className="text-[10px] shrink-0">
                  {d}
                </Badge>
              ))}
              {n.affiliationStatus && (
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {AFFILIATION_STATUS_LABELS[n.affiliationStatus]}
                </Badge>
              )}
              {!n.isAvailable && <Badge variant="secondary" className="text-[10px] shrink-0">مشغول</Badge>}
              {alreadyApplied && <Badge variant="secondary" className="text-[10px] shrink-0">قدّم مسبقاً</Badge>}
              {n.ratingAverage != null && <span className="shrink-0 text-amber-600">★{n.ratingAverage}</span>}
              <span className="ms-auto shrink-0">
                <FavoriteStar nurseId={n.id} isFavorite={n.isFavorite} size="sm" />
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
