'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Briefcase,
  FileText,
  Globe2,
  GraduationCap,
  IdCard,
  Search,
  Star,
  Stethoscope,
  Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiFetcher } from '@/lib/api-client'
import { formatDate, GENDER_LABELS, USER_STATUS_LABELS } from '@/lib/utils'
import { StatusBadge } from '@/components/shared/status-badge'
import { Stars } from '@/components/shared/star-rating'
import { EmptyState, DashboardSkeleton } from '@/components/shared/empty-state'
import { FullProfileDialog } from '@/components/shared/full-profile-dialog'

/**
 * دليل الكوادر/الأطباء في كامل المنصة — الجولة 33
 * ------------------------------------------------
 * يظهر حصراً لمن مُنحه حساب الإدارة إذن «رؤية البيانات الكاملة»:
 *  - audience="NURSE" (المستلم الإداري) → كل الكادر التمريضي في المنصة
 *  - audience="DOCTOR" (مشرف الأطباء) → كل الأطباء في المنصة
 * بحث + تصفية بالتخصص/الحالة + بطاقات غنية + زر السيرة الذاتية الكاملة لكل شخص.
 * الجولة 34: البحث بالاسم حصراً — البحث بالهاتف أُغلق لحماية الخصوصية،
 * وأرقام التواصل تُدار من الخادم وفق قاعدة سداد نسبة الإدارة (StaffPhone).
 */

interface WorkforceRow {
  id: string
  name: string
  /** الجولة 34: الرقم الكامل يصل فقط لمن تحقق شرط السداد — وإلا null */
  phone: string | null
  phoneMasked: string
  phoneLocked: boolean
  gender: string | null
  role: string
  status: string
  specialty: string | null
  qualification: string | null
  yearsOfExperience: number | null
  createdAt: string
  orgName: string | null
  orgCity: string | null
  ratingAverage: number | null
  ratingCount: number
  documentsCount: number
  assignmentsCount: number
  isMyOrg: boolean
}

const COPY = {
  NURSE: {
    title: 'دليل الكادر التمريضي في المنصة',
    subtitle: 'جميع الكوادر المعتمدين في المنصة — بياناتهم المهنية كاملة بإذن من حساب الإدارة',
    searchPlaceholder: 'ابحث بالاسم...',
    specialtyLabel: 'كل التخصصات',
    personLabel: 'بلا تخصص',
    emptyTitle: 'لا يوجد كادر مطابق',
    emptyDesc: 'لم يُعثر على كوادر ضمن هذه التصفية — جرّب توسيع البحث أو تغيير التخصص.',
  },
  DOCTOR: {
    title: 'دليل الأطباء في المنصة',
    subtitle: 'جميع الأطباء المعتمدين في المنصة — بياناتهم المهنية كاملة بإذن من حساب الإدارة',
    searchPlaceholder: 'ابحث بالاسم...',
    specialtyLabel: 'كل التخصصات الطبية',
    personLabel: 'بلا تخصص طبي',
    emptyTitle: 'لا يوجد أطباء مطابقون',
    emptyDesc: 'لم يُعثر على أطباء ضمن هذه التصفية — جرّب توسيع البحث أو تغيير التخصص الطبي.',
  },
} as const

export function WorkforceDirectory({ audience }: { audience: 'NURSE' | 'DOCTOR' }) {
  const copy = COPY[audience]
  const [search, setSearch] = useState('')
  const [specialty, setSpecialty] = useState('ALL')
  const [status, setStatus] = useState('ALL')
  const [profileUserId, setProfileUserId] = useState<string | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['workforce-directory'],
    queryFn: () => apiFetcher<{ audience: string; total: number; workforce: WorkforceRow[] }>('/api/workforce'),
  })

  const rows = data?.workforce ?? []

  const specialties = useMemo(
    () => Array.from(new Set(rows.map((r) => r.specialty).filter(Boolean) as string[])).sort(),
    [rows]
  )

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        const term = search.trim()
        // الجولة 34: البحث بالاسم حصراً — لا بحث بالهاتف (حماية الخصوصية)
        const matchesSearch = !term || r.name.includes(term)
        const matchesSpecialty = specialty === 'ALL' || r.specialty === specialty
        const matchesStatus = status === 'ALL' || r.status === status
        return matchesSearch && matchesSpecialty && matchesStatus
      }),
    [rows, search, specialty, status]
  )

  const stats = useMemo(
    () => ({
      total: rows.length,
      approved: rows.filter((r) => r.status === 'APPROVED').length,
      withDocs: rows.filter((r) => r.documentsCount > 0).length,
      rated: rows.filter((r) => r.ratingCount > 0).length,
    }),
    [rows]
  )

  if (isLoading) return <DashboardSkeleton />

  return (
    <div className="space-y-4">
      {/* ---------- بطاقات الإحصاء ---------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border bg-card p-3.5">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {audience === 'DOCTOR' ? <Stethoscope className="size-3.5" /> : <Users className="size-3.5" />}
            إجمالي {audience === 'DOCTOR' ? 'الأطباء' : 'الكوادر'}
          </p>
          <p className="mt-1 text-2xl font-extrabold text-primary">{stats.total}</p>
        </div>
        <div className="rounded-2xl border bg-card p-3.5">
          <p className="text-xs text-muted-foreground">معتمدون لاستقبال التكليفات</p>
          <p className="mt-1 text-2xl font-extrabold">{stats.approved}</p>
        </div>
        <div className="rounded-2xl border bg-card p-3.5">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileText className="size-3.5" /> لديهم مستندات مرفوعة
          </p>
          <p className="mt-1 text-2xl font-extrabold">{stats.withDocs}</p>
        </div>
        <div className="rounded-2xl border bg-card p-3.5">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Star className="size-3.5" /> حاصلون على تقييمات
          </p>
          <p className="mt-1 text-2xl font-extrabold">{stats.rated}</p>
        </div>
      </div>

      {/* ---------- أدوات التصفية ---------- */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={copy.searchPlaceholder}
            className="ps-9"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm shadow-xs outline-none"
            aria-label="تصفية بالتخصص"
          >
            <option value="ALL">{copy.specialtyLabel}</option>
            {specialties.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm shadow-xs outline-none"
            aria-label="تصفية بالحالة"
          >
            <option value="ALL">كل الحالات</option>
            <option value="APPROVED">معتمد</option>
            <option value="PENDING">قيد المراجعة</option>
          </select>
        </div>
      </div>

      {/* ---------- البطاقات ---------- */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={audience === 'DOCTOR' ? Stethoscope : Users}
          title={search || specialty !== 'ALL' || status !== 'ALL' ? copy.emptyTitle : copy.emptyTitle}
          description={copy.emptyDesc}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r) => (
            <div
              key={r.id}
              className="group flex flex-col rounded-2xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
            >
              {/* الترويسة */}
              <div className="flex items-start gap-3">
                <span
                  className={`flex size-12 shrink-0 items-center justify-center rounded-2xl text-lg font-extrabold ${
                    audience === 'DOCTOR'
                      ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                      : 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
                  }`}
                >
                  {r.name.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate font-extrabold group-hover:text-primary">
                    {r.name}
                    {r.status === 'APPROVED' && (
                      <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" title="معتمد" />
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {r.specialty ?? copy.personLabel}
                    {r.gender ? ` — ${GENDER_LABELS[r.gender] ?? r.gender}` : ''}
                  </p>
                  {r.orgName && (
                    <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                      <Globe2 className="size-3 shrink-0" />
                      {r.orgName}
                      {r.isMyOrg && (
                        <Badge className="ms-1 border-transparent bg-emerald-100 px-1.5 py-0 text-[9px] text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          من جهتي
                        </Badge>
                      )}
                    </p>
                  )}
                </div>
                <StatusBadge status={r.status} labels={USER_STATUS_LABELS} />
              </div>

              {/* الشارات المهنية */}
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {r.qualification && (
                  <Badge variant="outline" className="gap-1 text-[11px] font-normal">
                    <GraduationCap className="size-3" />
                    {r.qualification}
                  </Badge>
                )}
                {r.yearsOfExperience != null && r.yearsOfExperience > 0 && (
                  <Badge variant="secondary" className="gap-1 text-[11px] font-normal">
                    <Briefcase className="size-3" />
                    {r.yearsOfExperience} سنة خبرة
                  </Badge>
                )}
                {r.ratingAverage != null && (
                  <Badge variant="secondary" className="gap-1 text-[11px] font-normal text-amber-600">
                    <Star className="size-3 fill-amber-400 text-amber-400" />
                    {r.ratingAverage} ({r.ratingCount})
                  </Badge>
                )}
                <Badge variant="outline" className="gap-1 text-[11px] font-normal">
                  <FileText className="size-3" />
                  {r.documentsCount} مستند
                </Badge>
              </div>

              {/* التذييل */}
              <div className="mt-3 flex items-center justify-between gap-2 border-t pt-2.5">
                <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  مُسجل {formatDate(r.createdAt)}
                  {r.assignmentsCount > 0 && ` — ${r.assignmentsCount} تكليف`}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 text-xs text-emerald-700 dark:text-emerald-400"
                  onClick={() => {
                    setProfileUserId(r.id)
                    setProfileOpen(true)
                  }}
                >
                  <IdCard className="size-3.5" />
                  السيرة الذاتية
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------- السيرة الذاتية الكاملة ---------- */}
      <FullProfileDialog
        userId={profileUserId}
        open={profileOpen}
        onOpenChange={setProfileOpen}
      />
    </div>
  )
}
