'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  Cross,
  Hospital,
  Hourglass,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  ShieldAlert,
  Stethoscope,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { apiDelete, apiFetcher, apiPatch, apiPost } from '@/lib/api-client'
import { cn, formatDate, USER_STATUS_LABELS, GENDER_LABELS } from '@/lib/utils'
import { AFFILIATION_STATUS_LABELS, ORG_STATUS_LABELS, ORG_TYPE_LABELS } from '@/lib/network'
import { StatusBadge } from '@/components/shared/status-badge'
import {
  EntityCadreCommunity,
  type OrgCadreRow,
} from '@/components/shared/entity-cadre-community'
import { EmptyState, DashboardSkeleton } from '@/components/shared/empty-state'
import { MapPicker } from '@/components/shared/map-picker'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

/**
 * الجهات الصحية | Healthcare Organizations — شبكة الكوادر الصحية المعتمدة
 * إدارة كاملة: نوع الجهة + المدينة + العنوان + التواصل + الحالة + الخريطة
 * + لوحة كل جهة: الكوادر المرتبطون بحالاتهم + التكليفات النشطة والسابقة.
 */

interface Org {
  id: string
  name: string
  location: string | null
  lat: number | null
  lng: number | null
  type: string
  city: string | null
  address: string | null
  phone: string | null
  email: string | null
  status: string
  isActive: boolean
  createdAt: string
  _count?: { affiliations: number; posts: number }
  /** الجولة 38: مجتمع كوادر الجهة — المعتمدون/المتاحون الآن */
  community?: { accreditedNurses: number; accreditedDoctors: number; availableNow: number }
}

interface OrgDashboard {
  hospital: Org
  /** الجولة 38: مجتمع كوادر الجهة الصحية */
  community: { accreditedNurses: number; accreditedDoctors: number; availableNow: number }
  stats: {
    total: number
    working: number
    endorsed: number
    interviewed: number
    external: number
    pending: number
    former: number
    suspended: number
    posts: number
    activePosts: number
    completedPosts: number
  }
  nurses: Array<{
    affiliationId: string
    status: string
    statusLabel: string
    requestedStatus?: string | null
    note: string | null
    workYears?: number | null
    createdAt: string
    /** الجولة 38: متاح الآن = بلا تكليف سارٍ */
    available?: boolean
    nurse: {
      id: string; name: string; phone: string; gender: string | null
      role?: string
      specialty: string | null; qualification: string | null
      yearsOfExperience: number | null; status: string
    }
  }>
  activePosts: Array<{ id: string; number: number; title: string; status: string; value: number; department: string | null }>
  completedPosts: Array<{ id: string; number: number; title: string; value: number; department: string | null }>
}

type OrgFormValues = {
  name: string
  type: string
  city: string
  address: string
  phone: string
  email: string
  location: string
  lat: string
  lng: string
  status: string
}

const TYPE_OPTIONS = ['HOSPITAL', 'MEDICAL_CENTER', 'SPECIALIZED_CENTER', 'CLINIC', 'MEDICAL_COMPLEX', 'OTHER'] as const
const STATUS_OPTIONS = ['ACTIVE', 'INACTIVE', 'SUSPENDED'] as const

/** تبويبات تصفية الجهات — تُبرز طلبات الجهات الجديدة أولاً */
const ORG_FILTER_TABS = [
  { value: 'ALL', label: 'الكل' },
  { value: 'PENDING', label: 'بانتظار الاعتماد' },
  { value: 'ACTIVE', label: 'نشطة' },
  { value: 'INACTIVE', label: 'غير نشطة' },
  { value: 'SUSPENDED', label: 'معلقة' },
  { value: 'REJECTED', label: 'مرفوضة' },
] as const

function TypeIcon({ type }: { type: string }) {
  if (type === 'CLINIC') return <Stethoscope className="size-5" />
  if (type === 'MEDICAL_CENTER' || type === 'MEDICAL_COMPLEX') return <Cross className="size-5" />
  return <Hospital className="size-5" />
}

export function OrganizationsManager() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Org | null>(null)
  const [dashboardId, setDashboardId] = useState<string | null>(null)
  const [dashboardOpen, setDashboardOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Org | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-orgs'],
    queryFn: () => apiFetcher<{ hospitals: Org[] }>('/api/admin/hospitals'),
  })

  const { data: dashboard, isLoading: dashboardLoading } = useQuery({
    queryKey: ['admin-org-dashboard', dashboardId],
    queryFn: () => apiFetcher<OrgDashboard>(`/api/admin/hospitals/${dashboardId}`),
    enabled: !!dashboardId && dashboardOpen,
  })

  const form = useForm<OrgFormValues>({
    defaultValues: { name: '', type: 'HOSPITAL', city: '', address: '', phone: '', email: '', location: '', lat: '', lng: '', status: 'ACTIVE' },
  })

  const saveMutation = useMutation({
    mutationFn: async (values: OrgFormValues) => {
      const payload: Record<string, unknown> = {
        name: values.name,
        type: values.type,
        city: values.city,
        address: values.address,
        phone: values.phone,
        email: values.email,
        location: values.location,
        status: values.status,
        lat: values.lat ? Number(values.lat) : null,
        lng: values.lng ? Number(values.lng) : null,
      }
      if (editing) {
        return apiPatch<{ message: string }>(`/api/admin/hospitals/${editing.id}`, payload)
      }
      return apiPost<{ message: string }>('/api/admin/hospitals', payload)
    },
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['admin-orgs'] })
      queryClient.invalidateQueries({ queryKey: ['hospitals'] })
      setFormOpen(false)
      setEditing(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete<{ message: string }>(`/api/admin/hospitals/${id}`),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['admin-orgs'] })
      queryClient.invalidateQueries({ queryKey: ['hospitals'] })
      setDeleteTarget(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // اعتماد جهة جديدة مقترحة (PENDING → ACTIVE) أو رفضها (PENDING → REJECTED)
  const reviewMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'ACTIVE' | 'REJECTED' }) =>
      apiPatch<{ message: string }>(`/api/admin/hospitals/${id}`, { status, isActive: status === 'ACTIVE' }),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['admin-orgs'] })
      queryClient.invalidateQueries({ queryKey: ['hospitals'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // اعتماد/رفض طلب ارتباط معلق من لوحة الجهة — الإصلاح: طلبات الكادر التي كانت تبقى «قيد المراجعة» بلا إجراء
  const reviewAffMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiPatch<{ message: string }>(`/api/affiliations/${id}`, { status }),
    onSuccess: (res) => {
      toast.success(res.message ?? 'تم تحديث حالة الارتباط')
      queryClient.invalidateQueries({ queryKey: ['admin-org-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['admin-orgs'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const [removeAffTarget, setRemoveAffTarget] = useState<{ affiliationId: string; nurseName: string } | null>(null)
  const removeAffMutation = useMutation({
    mutationFn: (id: string) => apiDelete<{ message: string }>(`/api/affiliations/${id}`),
    onSuccess: (res) => {
      toast.success(res.message ?? 'تم رفض طلب الارتباط')
      setRemoveAffTarget(null)
      queryClient.invalidateQueries({ queryKey: ['admin-org-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['admin-orgs'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const openCreate = () => {
    setEditing(null)
    form.reset({ name: '', type: 'HOSPITAL', city: '', address: '', phone: '', email: '', location: '', lat: '', lng: '', status: 'ACTIVE' })
    setFormOpen(true)
  }

  const openEdit = (org: Org) => {
    setEditing(org)
    form.reset({
      name: org.name,
      type: org.type,
      city: org.city ?? '',
      address: org.address ?? '',
      phone: org.phone ?? '',
      email: org.email ?? '',
      location: org.location ?? '',
      lat: org.lat != null ? String(org.lat) : '',
      lng: org.lng != null ? String(org.lng) : '',
      status: org.status,
    })
    setFormOpen(true)
  }

  const orgs = (data?.hospitals ?? []).filter(
    (o) =>
      (statusFilter === 'ALL' || o.status === statusFilter) &&
      (!search || o.name.includes(search) || (o.city ?? '').includes(search))
  )
  const pendingCount = (data?.hospitals ?? []).filter((o) => o.status === 'PENDING').length

  if (isLoading) return <DashboardSkeleton />

  return (
    <div className="space-y-4">
      {/* الترويسة الطبية الفاخرة — نفس العناصر بهوية تكليفات */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-4 shadow-[0_1px_3px_rgba(15,27,78,0.05)] sm:p-5">
        <div aria-hidden className="pointer-events-none absolute -top-20 start-4 h-40 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 end-4 h-44 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-cyan-600 text-white shadow-lg shadow-primary/25">
              <Building2 className="size-6" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-black tracking-tight sm:text-2xl">الجهات الصحية</h1>
              <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
                Healthcare Organizations — كيانات مستقلة في شبكة الكوادر الصحية المعتمدة، تُربط بها الكوادر وتُبنى عليها التكليفات
              </p>
            </div>
          </div>
          <div className="flex w-full items-center gap-2.5 lg:w-auto">
            <div className="relative flex-1 sm:w-64 sm:flex-none">
              <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم أو المدينة..."
                className="h-11 rounded-xl border-border/70 bg-background ps-9 shadow-sm transition-shadow focus-visible:ring-primary/25"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button
              onClick={openCreate}
              className="h-11 shrink-0 gap-2 rounded-xl bg-gradient-to-l from-primary to-cyan-600 px-5 text-sm font-bold text-white shadow-lg shadow-primary/30 transition-transform hover:scale-[1.02]"
            >
              <Plus className="size-4" />
              إضافة جهة
            </Button>
          </div>
        </div>
      </div>

      {/* تبويبات تصفية الحالة — تُبرز الجهات الجديدة بانتظار الاعتماد */}
      <div className="flex flex-wrap items-center gap-2">
        {ORG_FILTER_TABS.map((tab) => {
          const count =
            tab.value === 'ALL'
              ? (data?.hospitals ?? []).length
              : (data?.hospitals ?? []).filter((o) => o.status === tab.value).length
          const active = statusFilter === tab.value
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStatusFilter(tab.value)}
              aria-pressed={active}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-bold transition-all duration-200',
                active
                  ? 'border-transparent bg-gradient-to-l from-primary to-cyan-600 text-white shadow-md shadow-primary/25'
                  : 'border-border/70 bg-card text-muted-foreground shadow-sm hover:border-primary/40 hover:text-foreground'
              )}
            >
              {tab.label}
              {tab.value !== 'ALL' && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-black leading-none',
                    active ? 'bg-white/25 text-white' : 'bg-secondary text-muted-foreground'
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {pendingCount > 0 && statusFilter !== 'PENDING' && (
        <div className="relative overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-l from-amber-50 via-amber-50/50 to-transparent p-4 dark:border-amber-900 dark:from-amber-950/40 dark:via-amber-950/20 dark:to-transparent">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
              <Hourglass className="size-5" />
            </span>
            <p className="flex-1 min-w-52 text-sm leading-relaxed text-amber-900 dark:text-amber-200">
              يوجد <span className="font-extrabold">{pendingCount}</span> جهة صحية جديدة اقترحها
              الكوادر أو المستلمون الإداريون — راجع بياناتها واعتمدها أو ارفضها.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="w-full shrink-0 justify-center rounded-lg border-amber-400/70 font-bold text-amber-800 hover:bg-amber-100 sm:w-auto dark:text-amber-200 dark:hover:bg-amber-950"
              onClick={() => setStatusFilter('PENDING')}
            >
              مراجعة الطلبات
            </Button>
          </div>
        </div>
      )}

      {orgs.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="لا توجد جهات صحية"
          description="أضف أول جهة صحية معتمدة لتبدأ شبكة الكوادر الصحية."
          action={
            <Button onClick={openCreate} className="gap-2 rounded-xl bg-gradient-to-l from-primary to-cyan-600 text-white shadow-lg shadow-primary/25">
              <Plus className="size-4" />
              إضافة جهة
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {orgs.map((org) => (
            <article
              key={org.id}
              className="group flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_1px_3px_rgba(15,27,78,0.05)] transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_16px_36px_-20px_rgba(15,27,78,0.28)]"
            >
              {/* شريط هوية علوي رقيق يتلوّن بحسب الحالة */}
              <div
                aria-hidden
                className={cn(
                  'h-1 w-full',
                  org.status === 'ACTIVE'
                    ? 'bg-gradient-to-l from-primary via-sky-500 to-cyan-400'
                    : org.status === 'PENDING'
                      ? 'bg-gradient-to-l from-amber-500 to-amber-300'
                      : 'bg-gradient-to-l from-muted-foreground/40 to-muted-foreground/10'
                )}
              />

              {/* رأس البطاقة — الهوية + الحالة */}
              <div className="flex flex-wrap items-start gap-x-3 gap-y-2 p-4 pb-2.5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-cyan-500/15 text-primary ring-1 ring-primary/10">
                  <TypeIcon type={org.type} />
                </span>
                <div className="min-w-[180px] flex-1">
                  <h3 className="truncate text-[15px] font-extrabold leading-6" title={org.name}>
                    {org.name}
                  </h3>
                  <p className="mt-0.5 truncate text-xs font-semibold text-muted-foreground">
                    {ORG_TYPE_LABELS[org.type] ?? org.type}
                  </p>
                  {org.status === 'PENDING' && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-300">
                      <ShieldAlert className="size-3 shrink-0" />
                      جهة مقترحة — بانتظار مراجعتها واعتمادها
                    </p>
                  )}
                </div>
                <StatusBadge status={org.status} labels={ORG_STATUS_LABELS} className="ms-auto shrink-0" />
              </div>

              {/* بيانات الجهة — نفس بيانات الجدول السابق بلا إضافات */}
              <div className="space-y-1.5 px-4 text-xs text-muted-foreground">
                <p className="flex items-center gap-1.5">
                  <MapPin className="size-3.5 shrink-0 text-primary/60" />
                  <span className="min-w-0 truncate">{[org.city, org.location].filter(Boolean).join(' — ') || '—'}</span>
                </p>
                <p className="flex flex-wrap items-center gap-x-3.5 gap-y-0.5">
                  <span className="flex items-center gap-1.5" dir="ltr">
                    <Phone className="size-3.5 shrink-0 text-primary/60" />
                    {org.phone || '—'}
                  </span>
                  {org.email && (
                    <span className="flex min-w-0 items-center gap-1.5" dir="ltr">
                      <Mail className="size-3.5 shrink-0 text-primary/60" />
                      <span className="truncate">{org.email}</span>
                    </span>
                  )}
                </p>
                <p className="flex items-center gap-1.5">
                  <CalendarDays className="size-3.5 shrink-0 text-primary/60" />
                  <span>الإنشاء: {formatDate(org.createdAt)}</span>
                </p>
              </div>

              {/* مجتمع الكوادر — نفس العدادات */}
              <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3 pt-2.5">
                <Badge variant="secondary" className="rounded-full px-2.5 font-bold">
                  {org._count?.affiliations ?? 0} ارتباط
                </Badge>
                <Badge variant="outline" className="rounded-full bg-emerald-500/5 px-2.5 font-bold text-emerald-700 dark:text-emerald-400">
                  {(org.community?.accreditedNurses ?? 0) + (org.community?.accreditedDoctors ?? 0)} معتمد ·{' '}
                  {org.community?.availableNow ?? 0} متاح الآن
                </Badge>
              </div>

              {/* الإجراءات — نفس الأزرار الحالية بلا إضافات */}
              <div className="mt-auto flex flex-wrap items-center gap-1 border-t border-border/60 bg-secondary/40 px-2.5 py-2">
                {org.status === 'PENDING' && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 rounded-lg text-xs font-bold text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-700"
                      disabled={reviewMutation.isPending}
                      onClick={() => reviewMutation.mutate({ id: org.id, status: 'ACTIVE' })}
                    >
                      <CheckCircle2 className="size-3.5" />
                      اعتماد
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 rounded-lg text-xs font-bold text-red-600 hover:bg-red-500/10 hover:text-red-600"
                      disabled={reviewMutation.isPending}
                      onClick={() => reviewMutation.mutate({ id: org.id, status: 'REJECTED' })}
                    >
                      <XCircle className="size-3.5" />
                      رفض
                    </Button>
                  </>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 rounded-lg text-xs font-bold text-primary hover:bg-primary/10 hover:text-primary"
                  onClick={() => {
                    setDashboardId(org.id)
                    setDashboardOpen(true)
                  }}
                >
                  <Users className="size-3.5" />
                  الكوادر والتكليفات
                </Button>
                <div className="ms-auto flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="تعديل"
                    className="size-8 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary"
                    onClick={() => openEdit(org)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="حذف"
                    className="size-8 rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                    disabled={deleteMutation.isPending}
                    onClick={() => setDeleteTarget(org)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* ---------- حوار إضافة/تعديل جهة ---------- */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="size-4 text-primary" />
              {editing ? `تعديل جهة: ${editing.name}` : 'إضافة جهة صحية جديدة'}
            </DialogTitle>
            <DialogDescription>
              بيانات الجهة الكاملة — النوع والمدينة والعنوان وبيانات التواصل والحالة والموقع الجغرافي
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="org-name">اسم الجهة الصحية *</Label>
                <Input id="org-name" placeholder="مثال: مستشفى الهلال التخصصي" {...form.register('name')} />
              </div>
              <div className="space-y-2">
                <Label>نوع الجهة</Label>
                <Select value={form.watch('type')} onValueChange={(v) => form.setValue('type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t}>{ORG_TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>حالة الجهة</Label>
                <Select value={form.watch('status')} onValueChange={(v) => form.setValue('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>{ORG_STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">غير النشطة/المعلقة لا تظهر لإنشاء تكليفات جديدة</p>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5"><MapPin className="size-3.5" />المدينة</Label>
                <Input placeholder="مثال: صنعاء" {...form.register('city')} />
              </div>
              <div className="space-y-2">
                <Label>المنطقة / العنوان</Label>
                <Input placeholder="مثال: شارع حدة — جوار المستوصف" {...form.register('address')} />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5"><Phone className="size-3.5" />رقم التواصل</Label>
                <Input dir="ltr" placeholder="7xxxxxxxx" {...form.register('phone')} />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5"><Mail className="size-3.5" />البريد الإلكتروني</Label>
                <Input dir="ltr" placeholder="info@hospital.com" {...form.register('email')} />
              </div>
            </div>

            {/* الموقع الجغرافي الحقيقي بالخريطة */}
            <div className="space-y-2">
              <Label>الموقع الجغرافي (يُعبأ تلقائياً في التكليفات)</Label>
              <MapPicker
                value={form.watch('lat') && form.watch('lng') ? { lat: Number(form.watch('lat')), lng: Number(form.watch('lng')) } : null}
                onSelect={(point) => {
                  form.setValue('lat', String(point.lat))
                  form.setValue('lng', String(point.lng))
                }}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>إلغاء</Button>
              <Button type="submit" disabled={saveMutation.isPending} className="gap-2">
                <Plus className="size-4" />
                {saveMutation.isPending ? 'جارٍ الحفظ...' : editing ? 'حفظ التعديلات' : 'إضافة الجهة'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ---------- لوحة الجهة الصحية ---------- */}
      <Dialog open={dashboardOpen} onOpenChange={setDashboardOpen}>
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="size-4 text-primary" />
              {dashboard?.hospital.name ?? 'لوحة الجهة الصحية'}
            </DialogTitle>
            <DialogDescription>الكوادر المرتبطة بالجهة وحالاتهم + التكليفات النشطة والسابقة</DialogDescription>
          </DialogHeader>

          {dashboardLoading && <p className="py-8 text-center text-sm text-muted-foreground">جارٍ التحميل...</p>}

          {dashboard && (
            <div className="space-y-4">
              {/* الجولة 38: مجتمع كوادر الجهة الصحية — بطاقات المعتمدين والمتاحين + الاستعراض */}
              <EntityCadreCommunity
                org={{
                  name: dashboard.hospital.name,
                  type: dashboard.hospital.type,
                  city: dashboard.hospital.city,
                  status: dashboard.hospital.status,
                }}
                stats={dashboard.community}
                cadres={dashboard.nurses
                  .filter((n) => ['WORKING', 'ENDORSED'].includes(n.status) && n.nurse.status === 'APPROVED')
                  .map(
                    (n): OrgCadreRow => ({
                      id: n.nurse.id,
                      name: n.nurse.name,
                      role: n.nurse.role ?? 'NURSE',
                      gender: n.nurse.gender,
                      specialty: n.nurse.specialty,
                      qualification: n.nurse.qualification,
                      yearsOfExperience: n.nurse.yearsOfExperience,
                      affiliationStatus: n.status,
                      affiliationStatusLabel: n.statusLabel,
                      workYears: n.workYears ?? null,
                      available: n.available ?? false,
                      ratingAverage: null,
                      ratingCount: null,
                      // الإدارة ترى الأرقام كاملة دائماً
                      phone: n.nurse.phone,
                      phoneMasked: n.nurse.phone,
                      phoneLocked: false,
                    })
                  )}
              />

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatBox label="إجمالي الكوادر" value={dashboard.stats.total} tone="primary" />
                <StatBox label="يعمل حالياً" value={dashboard.stats.working} tone="success" />
                <StatBox label="معتمد" value={dashboard.stats.endorsed} tone="success" />
                <StatBox label="تمت مقابلته" value={dashboard.stats.interviewed} tone="warning" />
                <StatBox label="خارجي مؤهل" value={dashboard.stats.external} />
                <StatBox label="قيد المراجعة" value={dashboard.stats.pending} tone="warning" />
                <StatBox label="تكليفات نشطة" value={dashboard.stats.activePosts} tone="primary" />
                <StatBox label="تكليفات سابقة" value={dashboard.stats.completedPosts} tone="muted" />
              </div>

              <Tabs defaultValue="nurses" dir="rtl">
                <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
                  <TabsTrigger value="nurses">الكوادر المرتبطون ({dashboard.stats.total})</TabsTrigger>
                  <TabsTrigger value="active">تكليفات نشطة ({dashboard.stats.activePosts})</TabsTrigger>
                  <TabsTrigger value="past">تكليفات سابقة ({dashboard.stats.completedPosts})</TabsTrigger>
                </TabsList>

                <TabsContent value="nurses" className="mt-2 space-y-2">
                  {dashboard.nurses.length === 0 ? (
                    <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                      لا يوجد كوادر مرتبطون بهذه الجهة بعد — تُسجل الارتباطات من ملف الكادر أو من حساب المستلم الإداري لجهتها
                    </p>
                  ) : (
                    dashboard.nurses.map((n) => (
                      <div key={n.affiliationId} className="rounded-xl border p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold">{n.nurse.name}</p>
                            <p className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted-foreground">
                              {n.nurse.gender && <span>{GENDER_LABELS[n.nurse.gender] ?? n.nurse.gender}</span>}
                              <span>{n.nurse.specialty ?? 'بلا تخصص'}</span>
                              <span>{n.nurse.qualification ?? '—'}</span>
                              <span>{n.nurse.yearsOfExperience != null ? `${n.nurse.yearsOfExperience} سنة خبرة` : 'خبرة غير محددة'}</span>
                              <span dir="ltr">{n.nurse.phone}</span>
                            </p>
                          </div>
                          <span className="text-[10px] text-muted-foreground">الحساب:</span>
                          <StatusBadge status={n.nurse.status} labels={USER_STATUS_LABELS} />
                          <span className="text-[10px] text-muted-foreground">الارتباط:</span>
                          <Badge variant="outline">{n.statusLabel}</Badge>
                        </div>
                        {n.status === 'PENDING' && (
                          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 p-2 dark:border-sky-900 dark:bg-sky-950/40">
                            <Hourglass className="size-3.5 shrink-0 text-sky-700 dark:text-sky-300" />
                            <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-sky-900 dark:text-sky-200">
                              طلب ارتباط بانتظار مراجعة الإدارة
                              {n.requestedStatus && n.requestedStatus !== 'PENDING'
                                ? ` — الحالة المطلوبة: ${AFFILIATION_STATUS_LABELS[n.requestedStatus] ?? n.requestedStatus}`
                                : ''}
                              {' — «الحساب: معتمد» تعني اعتماد حساب الكادر نفسه، أما الارتباط فيُعتمد من هنا'}
                            </p>
                            <Button
                              size="sm"
                              className="h-7 gap-1.5 text-xs"
                              disabled={reviewAffMutation.isPending}
                              onClick={() =>
                                reviewAffMutation.mutate({ id: n.affiliationId, status: n.requestedStatus ?? 'WORKING' })
                              }
                            >
                              <CheckCircle2 className="size-3.5" />
                              اعتماد
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1.5 text-xs text-destructive"
                              disabled={removeAffMutation.isPending}
                              onClick={() => setRemoveAffTarget({ affiliationId: n.affiliationId, nurseName: n.nurse.name })}
                            >
                              <XCircle className="size-3.5" />
                              رفض الطلب
                            </Button>
                          </div>
                        )}
                        {(n.workYears != null || n.note) && (
                          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 text-[11px] text-muted-foreground">
                            {n.workYears != null && <span>سنوات العمل بالجهة: {n.workYears}</span>}
                            {n.note && <span>ملاحظة: {n.note}</span>}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </TabsContent>

                <TabsContent value="active" className="mt-2 space-y-2">
                  {dashboard.activePosts.length === 0 ? (
                    <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">لا توجد تكليفات نشطة</p>
                  ) : (
                    dashboard.activePosts.map((p) => (
                      <div key={p.id} className="flex items-center justify-between rounded-xl border p-3">
                        <span className="text-sm font-bold">{p.title}{p.department ? ` — ${p.department}` : ''}</span>
                        <span className="text-sm font-extrabold text-primary">{p.value} ريال</span>
                      </div>
                    ))
                  )}
                </TabsContent>

                <TabsContent value="past" className="mt-2 space-y-2">
                  {dashboard.completedPosts.length === 0 ? (
                    <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">لا توجد تكليفات سابقة</p>
                  ) : (
                    dashboard.completedPosts.map((p) => (
                      <div key={p.id} className="flex items-center justify-between rounded-xl border p-3">
                        <span className="text-sm font-bold">{p.title}{p.department ? ` — ${p.department}` : ''}</span>
                        <span className="text-sm font-extrabold text-muted-foreground">{p.value} ريال</span>
                      </div>
                    ))
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ---------- بطاقة تأكيد الحذف الاحترافية — مع إحصاءات التأثير ---------- */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        tone="danger"
        icon={Trash2}
        title={`حذف جهة «${deleteTarget?.name ?? ''}» نهائياً`}
        description={
          deleteTarget
            ? `سيتم حذف «${deleteTarget.name}» حذفاً كاملاً من المنصة نهائياً: تُحذف الجهة مع ${
                deleteTarget._count?.affiliations ?? 0
              } ارتباط كوادر بسجلهم المهني،${
                (deleteTarget._count?.posts ?? 0) > 0
                  ? ` وتُفكَّك ارتباط ${
                      deleteTarget._count?.posts ?? 0
                    } تكليف سابق مع بقاء سجلها التاريخي النصي (قيمة التكليفات والأرباح لن تُفقد)`
                  : ' ولا توجد تكليفات مرتبطة بها'
              }. لا يمكن التراجع عن هذا الإجراء!`
            : ''
        }
        confirmLabel="نعم، احذف الجهة نهائياً"
        processing={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />

      {/* ---------- تأكيد رفض طلب الارتباط المعلق ---------- */}
      <ConfirmDialog
        open={!!removeAffTarget}
        onOpenChange={(v) => !v && setRemoveAffTarget(null)}
        tone="danger"
        icon={XCircle}
        title={`رفض طلب ارتباط «${removeAffTarget?.nurseName ?? ''}»`}
        description="سيُحذف طلب الارتباط المعلق من سجل الكادر نهائياً ويصله إشعار بالرفض. يمكنه التقديم مرة أخرى لاحقاً."
        confirmLabel="نعم، ارفض الطلب"
        processing={removeAffMutation.isPending}
        onConfirm={() => removeAffTarget && removeAffMutation.mutate(removeAffTarget.affiliationId)}
      />
    </div>
  )
}

function StatBox({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'primary' | 'success' | 'warning' | 'muted' }) {
  const toneClass =
    tone === 'success' ? 'text-emerald-700 dark:text-emerald-300'
    : tone === 'warning' ? 'text-amber-700 dark:text-amber-300'
    : tone === 'primary' ? 'text-primary'
    : tone === 'muted' ? 'text-muted-foreground'
    : ''
  return (
    <div className="rounded-xl border bg-background p-3 text-center">
      <p className={`text-xl font-extrabold ${toneClass}`}>{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}
