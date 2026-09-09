'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  Cross,
  Hospital,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  Stethoscope,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { apiDelete, apiFetcher, apiPatch, apiPost } from '@/lib/api-client'
import { formatDate, USER_STATUS_LABELS } from '@/lib/utils'
import { ORG_STATUS_LABELS, ORG_TYPE_LABELS } from '@/lib/network'
import { StatusBadge } from '@/components/shared/status-badge'
import { EmptyState, DashboardSkeleton } from '@/components/shared/empty-state'
import { MapPicker } from '@/components/shared/map-picker'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
}

interface OrgDashboard {
  hospital: Org
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
    note: string | null
    createdAt: string
    nurse: {
      id: string; name: string; phone: string; gender: string | null
      specialty: string | null; yearsOfExperience: number | null; status: string
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

function TypeIcon({ type }: { type: string }) {
  if (type === 'CLINIC') return <Stethoscope className="size-4" />
  if (type === 'MEDICAL_CENTER' || type === 'MEDICAL_COMPLEX') return <Cross className="size-4" />
  return <Hospital className="size-4" />
}

export function OrganizationsManager() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Org | null>(null)
  const [dashboardId, setDashboardId] = useState<string | null>(null)
  const [dashboardOpen, setDashboardOpen] = useState(false)

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
        return apiPatch<{ message: string }>(`/api/admin/hospitals?id=${editing.id}`, payload)
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
    mutationFn: (id: string) => apiDelete<{ message: string }>(`/api/admin/hospitals?id=${id}`),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['admin-orgs'] })
      queryClient.invalidateQueries({ queryKey: ['hospitals'] })
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
    (o) => !search || o.name.includes(search) || (o.city ?? '').includes(search)
  )

  if (isLoading) return <DashboardSkeleton />

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-extrabold">الجهات الصحية</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Healthcare Organizations — كيانات مستقلة في شبكة الكوادر الصحية المعتمدة، تُربط بها الكوادر وتُبنى عليها التكليفات
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative w-full sm:w-56">
            <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="بحث بالاسم أو المدينة..." className="ps-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button onClick={openCreate} className="shrink-0 gap-2">
            <Plus className="size-4" />
            إضافة جهة
          </Button>
        </div>
      </div>

      {orgs.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="لا توجد جهات صحية"
          description="أضف أول جهة صحية معتمدة لتبدأ شبكة الكوادر الصحية."
          action={
            <Button onClick={openCreate} className="gap-2">
              <Plus className="size-4" />
              إضافة جهة
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/60 hover:bg-secondary/60">
                  <TableHead>الجهة</TableHead>
                  <TableHead className="hidden md:table-cell">النوع</TableHead>
                  <TableHead className="hidden lg:table-cell">المدينة / الموقع</TableHead>
                  <TableHead className="hidden md:table-cell">التواصل</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="hidden sm:table-cell">الكوادر</TableHead>
                  <TableHead className="hidden lg:table-cell">الإنشاء</TableHead>
                  <TableHead className="text-start">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orgs.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell>
                      <p className="flex items-center gap-1.5 font-bold">
                        <TypeIcon type={org.type} />
                        {org.name}
                      </p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="outline">{ORG_TYPE_LABELS[org.type] ?? org.type}</Badge>
                    </TableCell>
                    <TableCell className="hidden max-w-40 truncate lg:table-cell">
                      {[org.city, org.location].filter(Boolean).join(' — ') || '—'}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="block text-xs" dir="ltr">{org.phone || '—'}</span>
                      <span className="block text-xs text-muted-foreground" dir="ltr">{org.email || ''}</span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={org.status} labels={ORG_STATUS_LABELS} />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="secondary">{org._count?.affiliations ?? 0} كادر</Badge>
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                      {formatDate(org.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 text-xs"
                          onClick={() => {
                            setDashboardId(org.id)
                            setDashboardOpen(true)
                          }}
                        >
                          <Users className="size-3.5" />
                          الكوادر والتكليفات
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="تعديل" onClick={() => openEdit(org)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="حذف"
                          className="text-red-600 hover:text-red-600"
                          disabled={deleteMutation.isPending}
                          onClick={() => {
                            if (confirm(`حذف جهة (${org.name}) نهائياً؟ يُمنع الحذف إذا كانت مرتبطة بتكليفات.`)) {
                              deleteMutation.mutate(org.id)
                            }
                          }}
                        >
                          <span className="text-lg leading-none">×</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
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
                      <div key={n.affiliationId} className="flex flex-wrap items-center gap-2 rounded-xl border p-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold">{n.nurse.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {n.nurse.specialty ?? 'بلا تخصص'} — {n.nurse.yearsOfExperience != null ? `${n.nurse.yearsOfExperience} سنة خبرة` : 'خبرة غير محددة'} — <span dir="ltr">{n.nurse.phone}</span>
                          </p>
                        </div>
                        <StatusBadge status={n.nurse.status} labels={USER_STATUS_LABELS} />
                        <Badge variant="outline">{n.statusLabel}</Badge>
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
