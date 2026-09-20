'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BadgeCheck,
  Ban,
  Building2,
  ChevronLeft,
  Clock3,
  Eye,
  EyeOff,
  Filter,
  HeartPulse,
  Lock,
  MessageCircle,
  PhoneIcon,
  RotateCcw,
  Search,
  Stethoscope,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { apiFetcher, apiPost } from '@/lib/api-client'
import { cn, formatDate, USER_STATUS_LABELS, QUALIFICATION_OPTIONS } from '@/lib/utils'
import {
  createNurseSchema,
  createDoctorSchema,
  type CreateNurseInput,
  type CreateNurseFormValues,
} from '@/lib/validations/user'

/** خيارات مؤهل الأطباء (منظومة الأطباء) — نفس قيم DOCTOR_QUALIFICATION_VALUES */
const DOCTOR_QUALIFICATION_OPTIONS = [
  { value: 'بكالوريوس طب وجراحة', label: 'بكالوريوس طب وجراحة' },
  { value: 'ماجستير', label: 'ماجستير' },
  { value: 'دكتوراه', label: 'دكتوراه' },
  { value: 'شهادة زمالة', label: 'شهادة زمالة' },
]
import { UserActionsMenu } from '@/components/admin/user-actions'
import { EmptyState } from '@/components/shared/empty-state'
import { StatusBadge } from '@/components/shared/status-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { DocStatusChips, StaffAvatar } from '@/components/admin/nurse-docs'
import { NurseDetails } from '@/components/admin/nurse-details'
import { WhatsAppNotificationModal, type WhatsAppTarget } from '@/components/admin/whatsapp-notification'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface AdminUser {
  id: string
  name: string
  phone: string
  role: string
  status: string
  specialty: string | null
  qualification: string | null
  yearsOfExperience: number | null
  hospitalName?: string | null
  rejectNote: string | null
  createdAt: string
  /** الجولة 63 — إضافي بحت للعرض: الجنس وصورة البروفايل وآخر تحديث */
  gender?: string | null
  profilePhotoBlobId?: string | null
  updatedAt?: string
  /** الجولة 63 — ملخص حالات المستندات (النوع + الحالة) لعرض النواقص في القائمة مباشرة */
  documents?: Array<{ type: string; status: string }>
  /** جهة الكادر (إن أضافه مستلم إداري لجهته) — تُعرض تحت الاسم */
  affiliations?: Array<{ hospital: { name: string; status: string } }>
  _count: { documents: number; assignments: number }
}

export interface AdminDocument {
  id: string
  userId: string
  type: string
  title: string
  fileUrl: string
  fileName: string
  fileSize: number | null
  mimeType: string | null
  status: string
  reviewNote: string | null
  createdAt: string
  user?: { id: string; name: string; phone: string; specialty: string | null; status: string }
}

/** بطاقات الإحصائيات — نفس بيانات التبويبات السابقة بعرض Dashboard احترافي (الجولة 63) */
const STATUS_CARDS = [
  {
    value: 'ALL',
    label: 'إجمالي الكوادر',
    short: 'الكل',
    icon: Users,
    selected: 'border-cyan-500/50 bg-cyan-500/[0.06] ring-2 ring-cyan-500/30',
    iconChip: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-300',
    thread: 'from-cyan-500/70 via-cyan-400/25',
  },
  {
    value: 'APPROVED',
    label: 'معتمد',
    short: 'معتمد',
    icon: BadgeCheck,
    selected: 'border-emerald-500/50 bg-emerald-500/[0.06] ring-2 ring-emerald-500/30',
    iconChip: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
    thread: 'from-emerald-500/70 via-emerald-400/25',
  },
  {
    value: 'PENDING',
    label: 'قيد المراجعة',
    short: 'قيد المراجعة',
    icon: Clock3,
    selected: 'border-amber-500/50 bg-amber-500/[0.06] ring-2 ring-amber-500/30',
    iconChip: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
    thread: 'from-amber-500/70 via-amber-400/25',
  },
  {
    value: 'REJECTED',
    label: 'مرفوض',
    short: 'مرفوض',
    icon: XCircle,
    selected: 'border-red-500/50 bg-red-500/[0.06] ring-2 ring-red-500/30',
    iconChip: 'bg-red-500/10 text-red-600 dark:text-red-300',
    thread: 'from-red-500/70 via-red-400/25',
  },
  {
    value: 'SUSPENDED',
    label: 'موقوف',
    short: 'موقوف',
    icon: Ban,
    selected: 'border-zinc-400/60 bg-zinc-500/[0.06] ring-2 ring-zinc-400/30',
    iconChip: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300',
    thread: 'from-zinc-500/70 via-zinc-400/25',
  },
] as const

const EXPERIENCE_OPTIONS = [
  { value: '0-2', label: 'حديث (0 – 2 سنة)' },
  { value: '3-5', label: '3 – 5 سنوات' },
  { value: '6-10', label: '6 – 10 سنوات' },
  { value: '10+', label: 'أكثر من 10 سنوات' },
]

const PERIOD_OPTIONS = [
  { value: '7d', label: 'آخر 7 أيام' },
  { value: '30d', label: 'آخر 30 يوماً' },
  { value: '90d', label: 'آخر 90 يوماً' },
  { value: 'older', label: 'أقدم من 90 يوماً' },
]

const EMPTY_FILTERS = {
  specialty: 'ALL',
  gender: 'ALL',
  experience: 'ALL',
  qualification: 'ALL',
  period: 'ALL',
}

type FiltersState = typeof EMPTY_FILTERS

/** خط نبض قلب زخرفي خافت جداً — لمسة هوية طبية (زخرفة بلا أي محتوى) */
function EcgLine() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 600 40"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-x-0 top-0 h-8 w-full opacity-[0.16]"
    >
      <defs>
        <linearGradient id="ecg-takleefat" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#06B6D4" stopOpacity="0" />
          <stop offset="0.25" stopColor="#06B6D4" />
          <stop offset="0.6" stopColor="#0891B2" />
          <stop offset="1" stopColor="#0891B2" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points="0,20 120,20 138,20 148,7 160,33 172,12 182,20 300,20 318,20 328,6 340,34 352,13 362,20 600,20"
        fill="none"
        stroke="url(#ecg-takleefat)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function NurseReview({ role = 'NURSE' }: { role?: 'NURSE' | 'DOCTOR' }) {
  const isDoctor = role === 'DOCTOR'
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<string>('ALL')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<FiltersState>(EMPTY_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [detailsUser, setDetailsUser] = useState<AdminUser | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [waTarget, setWaTarget] = useState<WhatsAppTarget | null>(null)
  const [waOpen, setWaOpen] = useState(false)

  // كتالوج المؤهلات العلمية من حساب الإدارة (الجولة 32) — القوائم التاريخية احتياط
  const [qualOptions, setQualOptions] = useState<readonly { value: string; label: string }[]>(
    isDoctor ? DOCTOR_QUALIFICATION_OPTIONS : QUALIFICATION_OPTIONS
  )

  useEffect(() => {
    fetch(`/api/qualifications/public?audience=${isDoctor ? 'DOCTOR' : 'NURSE'}`)
      .then((r) => r.json())
      .then((d) => {
        const list = (d.qualifications ?? []).map((q: { name: string }) => ({
          value: q.name,
          label: q.name,
        }))
        if (list.length > 0) setQualOptions(list)
      })
      .catch(() => null)
  }, [isDoctor])

  const createForm = useForm<CreateNurseFormValues, unknown, CreateNurseInput>({
    resolver: zodResolver(isDoctor ? (createDoctorSchema as never) : createNurseSchema),
    defaultValues: {
      name: '',
      phone: '',
      password: '',
      specialty: '',
      qualification: undefined,
      gender: undefined,
      yearsOfExperience: undefined,
    } as unknown as CreateNurseFormValues,
  })

  const createMutation = useMutation({
    mutationFn: (values: CreateNurseInput) =>
      apiPost<{ message: string }>('/api/admin/users', { ...values, role }),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      setCreateOpen(false)
      createForm.reset()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', role],
    queryFn: () => apiFetcher<{ users: AdminUser[] }>(`/api/admin/users?role=${role}`),
  })

  // الجولة 31: التخصص الطبي للطبيب يُختار حصراً من كتالوج التخصصات المُدار من الإدارة
  const { data: specialtiesData } = useQuery({
    queryKey: ['admin-specialties', 'options'],
    queryFn: () =>
      apiFetcher<{ specialties: Array<{ id: string; name: string; isActive: boolean }> }>(
        '/api/admin/specialties'
      ),
    enabled: isDoctor,
  })
  const activeSpecialties = (specialtiesData?.specialties ?? []).filter((s) => s.isActive)

  const allUsers = useMemo(() => data?.users ?? [], [data])

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: allUsers.length, PENDING: 0, APPROVED: 0, REJECTED: 0, SUSPENDED: 0 }
    for (const u of allUsers) if (c[u.status] !== undefined) c[u.status] += 1
    return c
  }, [allUsers])

  // خيارات الفلاتر تُشتق من البيانات الفعلية المحمّلة — لا قوائم مختلقة
  const uniqueSpecialties = useMemo(
    () => Array.from(new Set(allUsers.map((u) => u.specialty).filter(Boolean) as string[])).sort(),
    [allUsers]
  )
  const uniqueQualifications = useMemo(
    () => Array.from(new Set(allUsers.map((u) => u.qualification).filter(Boolean) as string[])).sort(),
    [allUsers]
  )

  const users = useMemo(() => {
    const now = Date.now()
    const DAY = 86_400_000
    return allUsers.filter((u) => {
      if (status !== 'ALL' && u.status !== status) return false
      if (search) {
        const matches =
          u.name.includes(search) || u.phone.includes(search) || (u.specialty ?? '').includes(search)
        if (!matches) return false
      }
      if (filters.specialty !== 'ALL' && u.specialty !== filters.specialty) return false
      if (filters.gender !== 'ALL' && u.gender !== filters.gender) return false
      if (filters.qualification !== 'ALL' && u.qualification !== filters.qualification) return false
      if (filters.experience !== 'ALL') {
        const y = u.yearsOfExperience
        if (y == null) return false
        const [min, max] =
          filters.experience === '10+'
            ? [11, Infinity]
            : filters.experience.split('-').map(Number)
        if (y < min || y > max) return false
      }
      if (filters.period !== 'ALL') {
        const age = now - new Date(u.createdAt).getTime()
        if (filters.period === '7d' && age > 7 * DAY) return false
        if (filters.period === '30d' && age > 30 * DAY) return false
        if (filters.period === '90d' && age > 90 * DAY) return false
        if (filters.period === 'older' && age <= 90 * DAY) return false
      }
      return true
    })
  }, [allUsers, status, search, filters])

  const activeFilterCount =
    (search ? 1 : 0) + Object.values(filters).filter((v) => v !== 'ALL').length

  function resetFilters() {
    setSearch('')
    setFilters(EMPTY_FILTERS)
    setStatus('ALL')
  }

  const roleLabel = isDoctor ? 'الأطباء' : 'الكادر الصحي'
  const RoleIcon = isDoctor ? Stethoscope : HeartPulse

  /* أداة فلاتر مشتركة — تُعرض داخل لوحة سطح المكتب وداخل Drawer الجوال */
  const filterControls = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="space-y-1.5">
        <Label className="text-xs font-bold text-muted-foreground">التخصص</Label>
        <Select value={filters.specialty} onValueChange={(v) => setFilters((f) => ({ ...f, specialty: v }))}>
          <SelectTrigger className="h-9"><SelectValue placeholder="كل التخصصات" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">كل التخصصات</SelectItem>
            {uniqueSpecialties.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-bold text-muted-foreground">الجنس</Label>
        <Select value={filters.gender} onValueChange={(v) => setFilters((f) => ({ ...f, gender: v }))}>
          <SelectTrigger className="h-9"><SelectValue placeholder="الكل" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">الكل</SelectItem>
            <SelectItem value="MALE">ذكر</SelectItem>
            <SelectItem value="FEMALE">أنثى</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-bold text-muted-foreground">سنوات الخبرة</Label>
        <Select value={filters.experience} onValueChange={(v) => setFilters((f) => ({ ...f, experience: v }))}>
          <SelectTrigger className="h-9"><SelectValue placeholder="الكل" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">الكل</SelectItem>
            {EXPERIENCE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-bold text-muted-foreground">المؤهل</Label>
        <Select value={filters.qualification} onValueChange={(v) => setFilters((f) => ({ ...f, qualification: v }))}>
          <SelectTrigger className="h-9"><SelectValue placeholder="كل المؤهلات" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">كل المؤهلات</SelectItem>
            {uniqueQualifications.map((q) => (
              <SelectItem key={q} value={q}>{q}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-bold text-muted-foreground">تاريخ التسجيل</Label>
        <Select value={filters.period} onValueChange={(v) => setFilters((f) => ({ ...f, period: v }))}>
          <SelectTrigger className="h-9"><SelectValue placeholder="كل الفترات" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">كل الفترات</SelectItem>
            {PERIOD_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-end">
        <Button variant="outline" size="sm" className="h-9 w-full gap-2" onClick={resetFilters}>
          <RotateCcw className="size-3.5" />
          إعادة ضبط
        </Button>
      </div>
    </div>
  )

  if (isLoading) return <NurseSkeleton />

  return (
    <div className="space-y-5">
      {/* ═══════════ الهيدر ═══════════ */}
      <div className="relative overflow-hidden rounded-3xl border bg-gradient-to-bl from-cyan-500/[0.06] via-card to-card p-5 shadow-sm sm:p-6">
        <EcgLine />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            {/* مؤشر الموقع: الإدارة ← الكادر الصحي */}
            <nav
              aria-label="مسار التنقل"
              className="mb-2.5 inline-flex items-center gap-1 rounded-full border bg-background/70 px-3 py-1 text-[11px] font-semibold text-muted-foreground backdrop-blur"
            >
              <span>الإدارة</span>
              <ChevronLeft className="size-3" aria-hidden />
              <span className="font-bold text-cyan-700 dark:text-cyan-300">{roleLabel}</span>
            </nav>
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'flex size-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg shadow-cyan-500/20 sm:size-14',
                  'bg-gradient-to-br from-cyan-500 to-cyan-700'
                )}
              >
                <RoleIcon className="size-6 sm:size-7" />
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-black tracking-tight sm:text-3xl">{roleLabel}</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {isDoctor
                    ? 'مراجعة واعتماد حسابات الأطباء في منصة تكليفات — منظومة الأطباء'
                    : 'مراجعة واعتماد حسابات الكوادر التمريضية في منصة تكليفات'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 lg:w-auto lg:flex-row lg:items-center">
            <div className="relative w-full lg:w-72">
              <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="ابحث بالاسم أو رقم الهاتف أو التخصص..."
                className="h-10 rounded-xl bg-background ps-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              {/* فلاتر: لوحة على سطح المكتب / Drawer على الجوال */}
              <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" className="relative h-10 flex-1 gap-2 rounded-xl lg:hidden">
                    <Filter className="size-4" />
                    الفلاتر
                    {activeFilterCount > 0 && (
                      <span className="absolute -top-1.5 -start-1.5 flex size-5 items-center justify-center rounded-full bg-cyan-600 text-[10px] font-bold text-white">
                        {activeFilterCount}
                      </span>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-3xl px-5 pb-8">
                  <SheetHeader className="pb-2 text-start">
                    <SheetTitle className="text-base font-extrabold">تصفية الكادر</SheetTitle>
                  </SheetHeader>
                  {filterControls}
                </SheetContent>
              </Sheet>
              <Button
                variant="outline"
                onClick={() => setFiltersOpen((v) => !v)}
                className={cn(
                  'relative hidden h-10 gap-2 rounded-xl lg:inline-flex',
                  filtersOpen && 'border-cyan-500/50 bg-cyan-500/[0.06]'
                )}
                aria-expanded={filtersOpen}
              >
                <Filter className="size-4" />
                الفلاتر
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1.5 -start-1.5 flex size-5 items-center justify-center rounded-full bg-cyan-600 text-[10px] font-bold text-white">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
              <Button onClick={() => setCreateOpen(true)} className="h-10 shrink-0 gap-2 rounded-xl shadow-md shadow-cyan-600/20">
                <UserPlus className="size-4" />
                إضافة {isDoctor ? 'طبيب' : 'كادر'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* لوحة الفلاتر — سطح المكتب */}
      {filtersOpen && (
        <div className="hidden rounded-2xl border bg-card p-4 shadow-sm lg:block">{filterControls}</div>
      )}

      {/* ═══════════ بطاقات الإحصائيات ═══════════ */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {STATUS_CARDS.map((card) => {
          const selected = status === card.value
          return (
            <button
              key={card.value}
              type="button"
              onClick={() => setStatus(card.value)}
              aria-pressed={selected}
              className={cn(
                'group relative overflow-hidden rounded-2xl border bg-card p-4 text-start transition-all duration-300',
                'hover:-translate-y-0.5 hover:shadow-md',
                selected ? card.selected : 'border-border/70 hover:border-border'
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'absolute inset-x-5 top-0 h-0.5 rounded-full bg-gradient-to-l to-transparent',
                  card.thread,
                  selected ? 'opacity-100' : 'opacity-40'
                )}
              />
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-muted-foreground">
                    <span className="hidden sm:inline">{card.label}</span>
                    <span className="sm:hidden">{card.short}</span>
                  </p>
                  <p className="mt-1.5 text-3xl font-black tabular-nums tracking-tight sm:text-4xl">
                    {counts[card.value]}
                  </p>
                </div>
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-105',
                    card.iconChip
                  )}
                >
                  <card.icon className="size-4.5" />
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {/* ═══════════ قائمة الكادر ═══════════ */}
      {users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="لا توجد حسابات مطابقة"
          description={
            isDoctor
              ? 'لم يتم العثور على حسابات أطباء ضمن هذا التصنيف.'
              : 'لم يتم العثور على حسابات كادر صحي ضمن هذا التصنيف.'
          }
        />
      ) : (
        <>
          {/* ---------- الجوال: بطاقات ---------- */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {users.map((user) => (
              <article
                key={user.id}
                className="rounded-2xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-start gap-3">
                  <StaffAvatar name={user.name} photoBlobId={user.profilePhotoBlobId} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-extrabold">{user.name}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground" dir="ltr">
                      <PhoneIcon className="size-3" />
                      {user.phone}
                    </p>
                    {user.affiliations?.[0]?.hospital && (
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-cyan-700 dark:text-cyan-300">
                        <Building2 className="size-3" />
                        {user.affiliations[0].hospital.name}
                      </p>
                    )}
                  </div>
                  <StatusBadgeCell user={user} />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                  {user.specialty && (
                    <span className="rounded-lg bg-secondary px-2 py-1">{user.specialty}</span>
                  )}
                  {user.yearsOfExperience != null && (
                    <span className="rounded-lg bg-secondary px-2 py-1">{user.yearsOfExperience} سنة خبرة</span>
                  )}
                  {user.qualification && (
                    <span className="max-w-44 truncate rounded-lg bg-secondary px-2 py-1">{user.qualification}</span>
                  )}
                </div>

                <div className="mt-2.5">{<DocStatusChips documents={user.documents} />}</div>

                <div className="mt-3 flex items-center gap-2 border-t pt-3">
                  <Button size="sm" className="h-8 flex-1 gap-1.5 rounded-lg" onClick={() => setDetailsUser(user)}>
                    <Eye className="size-3.5" />
                    مراجعة الملف
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 rounded-lg border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-950"
                    onClick={() => {
                      setWaTarget({ id: user.id, name: user.name, phone: user.phone, status: user.status, documents: user.documents })
                      setWaOpen(true)
                    }}
                  >
                    <MessageCircle className="size-3.5" />
                    واتساب
                  </Button>
                  <ActionsCell user={user} onOpenDetails={() => setDetailsUser(user)} />
                </div>
              </article>
            ))}
          </div>

          {/* ---------- سطح المكتب: جدول ذكي ---------- */}
          <div className="hidden overflow-hidden rounded-2xl border bg-card shadow-sm md:block">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/60 hover:bg-secondary/60">
                    <TableHead>الكادر</TableHead>
                    <TableHead>الهاتف</TableHead>
                    <TableHead className="hidden xl:table-cell">التخصص</TableHead>
                    <TableHead className="hidden xl:table-cell">المؤهل والخبرة</TableHead>
                    <TableHead>المستندات</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead className="hidden xl:table-cell">التسجيل</TableHead>
                    <TableHead className="text-start">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id} className="transition-colors hover:bg-accent/40">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <StaffAvatar name={user.name} photoBlobId={user.profilePhotoBlobId} />
                          <div className="min-w-0">
                            <p className="truncate font-bold">{user.name}</p>
                            {user.affiliations?.[0]?.hospital && (
                              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-cyan-700 dark:text-cyan-300">
                                <Building2 className="size-3" />
                                {user.affiliations[0].hospital.name}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell dir="ltr">
                        <span className="text-start">{user.phone}</span>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">{user.specialty ?? '—'}</TableCell>
                      <TableCell className="hidden xl:table-cell">
                        <p className="text-xs leading-relaxed">
                          {user.qualification ?? '—'}
                          <span className="mx-1 text-muted-foreground">•</span>
                          {user.yearsOfExperience != null ? `${user.yearsOfExperience} سنة` : '—'}
                        </p>
                      </TableCell>
                      <TableCell>
                        <DocStatusChips documents={user.documents} className="max-w-44" />
                      </TableCell>
                      <TableCell>
                        <StatusBadgeCell user={user} />
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        <p className="whitespace-nowrap text-xs">{formatDate(user.createdAt)}</p>
                        {user.updatedAt && (
                          <p className="whitespace-nowrap text-[10px] text-muted-foreground">
                            آخر تحديث: {formatDate(user.updatedAt)}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-lg" onClick={() => setDetailsUser(user)}>
                            <Eye className="size-3.5" />
                            مراجعة
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            aria-label={`إرسال واتساب إلى ${user.name}`}
                            className="h-8 rounded-lg border-emerald-300 px-2 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-950"
                            onClick={() => {
                              setWaTarget({ id: user.id, name: user.name, phone: user.phone, status: user.status, documents: user.documents })
                              setWaOpen(true)
                            }}
                          >
                            <MessageCircle className="size-3.5" />
                          </Button>
                          <ActionsCell user={user} onOpenDetails={() => setDetailsUser(user)} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}

      {/* ═══════════ حوار مراجعة الملف ═══════════ */}
      <Dialog open={!!detailsUser} onOpenChange={(open) => !open && setDetailsUser(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto grid-cols-1">
          <DialogHeader>
            <DialogTitle>{isDoctor ? 'مراجعة ملف الطبيب' : 'مراجعة ملف الكادر الصحي'}</DialogTitle>
            <DialogDescription>
              بيانات الحساب والمستندات وحالة التوثيق في منصة تكليفات
            </DialogDescription>
          </DialogHeader>
          {detailsUser && <NurseDetails userId={detailsUser.id} isDoctor={isDoctor} />}
        </DialogContent>
      </Dialog>

      {/* ═══════════ واتساب — من القائمة مباشرة ═══════════ */}
      <WhatsAppNotificationModal
        open={waOpen}
        onOpenChange={setWaOpen}
        target={waTarget}
        onSent={() => queryClient.invalidateQueries({ queryKey: ['admin-users'] })}
      />

      {/* ═══════════ حوار إضافة عضو جديد (كادر/طبيب) — كما هو دون تغيير وظيفي ═══════════ */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isDoctor ? 'إضافة طبيب جديد' : 'إضافة كادر صحي جديد'}</DialogTitle>
            <DialogDescription>
              {isDoctor
                ? 'يُنشأ الحساب معتمداً تلقائياً — المؤهل من خيارات الأطباء والتخصص الطبي من كتالوج التخصصات المُدار من الإدارة.'
                : 'يُنشأ الحساب معتمداً تلقائياً ويمكن للكادر تسجيل الدخول فوراً في منصة تكليفات.'}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={createForm.handleSubmit((v) => createMutation.mutate(v))}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="nurse-name">الاسم مع اللقب</Label>
              <Input id="nurse-name" placeholder="مثال: سارة أحمد" {...createForm.register('name')} />
              {createForm.formState.errors.name && (
                <p className="text-xs text-destructive">
                  {createForm.formState.errors.name.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="nurse-phone">رقم الهاتف</Label>
              <div className="relative">
                <PhoneIcon className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="nurse-phone"
                  type="tel"
                  inputMode="numeric"
                  dir="ltr"
                  maxLength={9}
                  placeholder="7xxxxxxxx"
                  className="ps-10 text-start"
                  {...createForm.register('phone')}
                />
              </div>
              {createForm.formState.errors.phone && (
                <p className="text-xs text-destructive">
                  {createForm.formState.errors.phone.message}
                </p>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="nurse-specialty">{isDoctor ? 'التخصص الطبي — من كتالوج الإدارة *' : 'التخصص *'}</Label>
                {isDoctor ? (
                  // الجولة 31: منتقي التخصص الطبي من كتالوج الإدارة — لا تخصصات حرة
                  <Select
                    value={createForm.watch('specialty') || ''}
                    onValueChange={(v) => createForm.setValue('specialty', v, { shouldValidate: true })}
                  >
                    <SelectTrigger id="nurse-specialty">
                      <SelectValue placeholder="اختر التخصص الطبي من القائمة" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeSpecialties.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">
                          لا توجد تخصصات — أضف التخصص أولاً من قسم «التخصصات الطبية»
                        </div>
                      ) : (
                        activeSpecialties.map((s) => (
                          <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="nurse-specialty"
                    placeholder="مثال: تمريض طوارئ"
                    {...createForm.register('specialty')}
                  />
                )}
                {createForm.formState.errors.specialty && (
                  <p className="text-xs text-destructive">
                    {createForm.formState.errors.specialty.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="nurse-experience">سنوات الخبرة *</Label>
                <Input
                  id="nurse-experience"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={50}
                  placeholder="أدخل عدد السنوات"
                  {...createForm.register('yearsOfExperience')}
                />
                {createForm.formState.errors.yearsOfExperience && (
                  <p className="text-xs text-destructive">
                    {createForm.formState.errors.yearsOfExperience.message}
                  </p>
                )}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>المؤهل العلمي *</Label>
                <Select
                  value={createForm.watch('qualification') ?? ''}
                  onValueChange={(v) => createForm.setValue('qualification', v as never)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر المؤهل" />
                  </SelectTrigger>
                  <SelectContent>
                    {qualOptions.map((q) => (
                      <SelectItem key={q.value} value={q.value}>{q.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {createForm.formState.errors.qualification && (
                  <p className="text-xs text-destructive">
                    {createForm.formState.errors.qualification.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>الجنس *</Label>
                <Select
                  value={createForm.watch('gender') ?? ''}
                  onValueChange={(v) => createForm.setValue('gender', v as 'MALE' | 'FEMALE')}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الجنس" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MALE">ذكر</SelectItem>
                    <SelectItem value="FEMALE">أنثى</SelectItem>
                  </SelectContent>
                </Select>
                {createForm.formState.errors.gender && (
                  <p className="text-xs text-destructive">
                    {createForm.formState.errors.gender.message}
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="nurse-password">كلمة المرور</Label>
              <div className="relative">
                <Lock className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="nurse-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="ps-10 pe-10"
                  {...createForm.register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {createForm.formState.errors.password && (
                <p className="text-xs text-destructive">
                  {createForm.formState.errors.password.message}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                إلغاء
              </Button>
              <Button type="submit" disabled={createMutation.isPending} className="gap-2">
                <UserPlus className="size-4" />
                {createMutation.isPending ? 'جارٍ الإنشاء...' : 'إنشاء الحساب'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* شارة الحالة + سبب الرفض السياقي */
function StatusBadgeCell({ user }: { user: AdminUser }) {
  return (
    <div className="shrink-0 text-end">
      <StatusBadge status={user.status} labels={USER_STATUS_LABELS} />
      {user.status === 'REJECTED' && user.rejectNote && (
        <p className="mt-1 max-w-36 truncate text-[11px] text-muted-foreground">{user.rejectNote}</p>
      )}
    </div>
  )
}

/* قائمة إجراءات الحساب — نفس وظائف الإدارة القائمة كاملة */
function ActionsCell({ user, onOpenDetails }: { user: AdminUser; onOpenDetails: () => void }) {
  return (
    <UserActionsMenu
      user={{ ...user, documentsCount: user._count.documents }}
      onChanged={() => {}}
    >
      <DropdownMenuItem onClick={onOpenDetails} className="gap-2">
        <Eye className="size-4" />
        عرض التفاصيل
      </DropdownMenuItem>
    </UserActionsMenu>
  )
}

/* هيكل تحميل مطابق للتخطيط الجديد */
function NurseSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-36 rounded-3xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  )
}
