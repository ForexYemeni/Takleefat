'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Lock, MapPin, PhoneIcon, Search, UserPlus, UserCog, UserSquare2 } from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { apiFetcher, apiPost } from '@/lib/api-client'
import { cn, formatDate, USER_STATUS_LABELS } from '@/lib/utils'
import { createSupervisorSchema, type CreateSupervisorInput } from '@/lib/validations/user'
import { StatusBadge } from '@/components/shared/status-badge'
import { UserActionsMenu } from '@/components/admin/user-actions'
import { ReceiverProfileDialog } from '@/components/admin/receiver-profile'
import { EmptyState, DashboardSkeleton } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
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
import { ClipboardList, Eye, EyeOff, Hospital, Percent, PhoneCall, ShieldCheck } from 'lucide-react'

interface ReceiverUser {
  id: string
  name: string
  phone: string
  role: string
  status: string
  hospitalName: string | null
  commissionPercent: number | null
  fullProfileAccess: boolean
  trustedContactViewer: boolean
  createdAt: string
  _count: { documents: number; assignments: number }
}

export default function AdminReceiversPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [detailsUserId, setDetailsUserId] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', 'DOCTOR_SUPERVISOR'],
    queryFn: () =>
      apiFetcher<{ users: ReceiverUser[]; autoSharePercent: number }>(
        '/api/admin/users?role=DOCTOR_SUPERVISOR'
      ),
  })

  /** النسبة التلقائية (نصف نسبة الإدارة) — تأتي من الخادم */
  const autoSharePercent = data?.autoSharePercent ?? 5

  // الجولة 31: الجهة الصحية للمشرف تُختار حصراً من كتالوج جهات الإدارة النشطة
  const { data: hospitalsData } = useQuery({
    queryKey: ['admin-hospitals', 'options'],
    queryFn: () =>
      apiFetcher<{
        hospitals: Array<{ id: string; name: string; location: string | null; city: string | null; status: string }>
      }>('/api/admin/hospitals'),
  })
  const activeHospitals = (hospitalsData?.hospitals ?? []).filter((h) => h.status !== 'INACTIVE')

  const form = useForm<CreateSupervisorInput>({
    resolver: zodResolver(createSupervisorSchema),
    defaultValues: { name: '', phone: '', password: '', hospitalName: '' },
  })

  const createMutation = useMutation({
    mutationFn: (values: CreateSupervisorInput) =>
      apiPost<{ message: string }>('/api/admin/users', {
        ...values,
        role: 'DOCTOR_SUPERVISOR',
      }),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      setCreateOpen(false)
      form.reset()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const receivers = (data?.users ?? []).filter(
    (u) => !search || u.name.includes(search) || u.phone.includes(search)
  )

  if (isLoading) return <DashboardSkeleton />

  return (
    <div className="space-y-4">
      {/* الترويسة الطبية الفاخرة — لمسة Indigo طبية تميّز منظومة المشرفين بهوية تكليفات */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-4 shadow-[0_1px_3px_rgba(15,27,78,0.05)] sm:p-5">
        <div aria-hidden className="pointer-events-none absolute -top-20 start-4 h-40 w-64 rounded-full bg-indigo-500/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 end-4 h-44 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-cyan-500 text-white shadow-lg shadow-indigo-500/25">
              <UserSquare2 className="size-6" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-black tracking-tight sm:text-2xl">مشرفو الأطباء</h1>
              <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
                إدارة حسابات مشرفي الأطباء — يستدعي كل مشرف أطباء جهته ويُنشئ تكليفات الأطباء
              </p>
            </div>
          </div>
          <div className="flex w-full items-center gap-2.5 lg:w-auto">
            <div className="relative flex-1 sm:w-56 sm:flex-none">
              <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="بحث..."
                className="h-11 rounded-xl border-border/70 bg-background ps-9 shadow-sm transition-shadow focus-visible:ring-indigo-500/25"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button
              onClick={() => setCreateOpen(true)}
              className="h-11 shrink-0 gap-2 rounded-xl bg-gradient-to-l from-indigo-600 to-cyan-600 px-5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 transition-transform hover:scale-[1.02]"
            >
              <UserPlus className="size-4" />
              إضافة مشرف أطباء
            </Button>
          </div>
        </div>
      </div>

      {receivers.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title="لا يوجد مستلمون إداريون"
          description="أضف أول حساب مستلم إداري ليتمكن من استلام التكليفات."
          action={
            <Button
              onClick={() => setCreateOpen(true)}
              className="gap-2 rounded-xl bg-gradient-to-l from-indigo-600 to-cyan-600 text-white shadow-lg shadow-indigo-500/25"
            >
              <UserPlus className="size-4" />
              إضافة مستلم
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {receivers.map((user) => (
            <article
              key={user.id}
              className="group flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_1px_3px_rgba(15,27,78,0.05)] transition-all duration-300 hover:-translate-y-0.5 hover:border-indigo-500/30 hover:shadow-[0_16px_36px_-20px_rgba(15,27,78,0.28)]"
            >
              {/* شريط هوية علوي رقيق يتلوّن بحسب حالة الحساب */}
              <div
                aria-hidden
                className={cn(
                  'h-1 w-full',
                  user.status === 'APPROVED'
                    ? 'bg-gradient-to-l from-emerald-500 to-emerald-300'
                    : user.status === 'PENDING'
                      ? 'bg-gradient-to-l from-amber-500 to-amber-300'
                      : user.status === 'REJECTED'
                        ? 'bg-gradient-to-l from-red-500 to-red-300'
                        : 'bg-gradient-to-l from-muted-foreground/40 to-muted-foreground/10'
                )}
              />

              {/* رأس البطاقة — الهوية + قائمة الإجراءات */}
              <div className="flex items-start gap-3 p-4 pb-2.5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/15 to-cyan-500/15 text-indigo-700 ring-1 ring-indigo-500/10 dark:text-indigo-300">
                  <UserSquare2 className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[15px] font-extrabold leading-6" title={user.name}>
                    {user.name}
                  </h3>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground" dir="ltr">
                    <PhoneIcon className="size-3 shrink-0" />
                    <span className="tracking-wide">{user.phone}</span>
                  </p>
                </div>
                <UserActionsMenu
                  user={{
                    ...user,
                    documentsCount: user._count.documents,
                    autoSharePercent,
                  }}
                  onChanged={() => {
                    queryClient.invalidateQueries({ queryKey: ['admin-users'] })
                    queryClient.invalidateQueries({ queryKey: ['stats'] })
                  }}
                >
                  <DropdownMenuItem
                    onClick={() => {
                      setDetailsUserId(user.id)
                      setDetailsOpen(true)
                    }}
                    className="gap-2"
                  >
                    <Eye className="size-4" />
                    عرض البيانات الكاملة
                  </DropdownMenuItem>
                </UserActionsMenu>
              </div>

              {/* الحالة والجهة الصحية */}
              <div className="flex flex-wrap items-center gap-1.5 px-4 pb-2">
                <StatusBadge status={user.status} labels={USER_STATUS_LABELS} />
                {user.hospitalName && (
                  <Badge variant="outline" className="max-w-full gap-1">
                    <Hospital className="size-3 shrink-0" />
                    <span className="truncate" title={user.hospitalName}>
                      {user.hospitalName}
                    </span>
                  </Badge>
                )}
              </div>

              {/* الحصة والأذونات */}
              <div className="flex flex-wrap items-center gap-1.5 px-4 pb-4">
                <Badge
                  variant={user.commissionPercent != null ? 'default' : 'outline'}
                  className="gap-1"
                >
                  <Percent className="size-3" />
                  {user.commissionPercent != null
                    ? `${user.commissionPercent}٪ مخصصة`
                    : `تلقائي ${autoSharePercent}٪`}
                </Badge>
                {user.fullProfileAccess && (
                  <Badge
                    variant="outline"
                    className="gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                  >
                    <ShieldCheck className="size-3" />
                    أذونات كاملة
                  </Badge>
                )}
                {user.trustedContactViewer && (
                  <Badge
                    variant="outline"
                    className="gap-1 border-teal-500/40 bg-teal-50 text-teal-700 dark:border-teal-500/40 dark:bg-teal-950/40 dark:text-teal-300"
                  >
                    <PhoneCall className="size-3" />
                    موثوق جداً
                  </Badge>
                )}
              </div>

              {/* تذييل البطاقة — التكليفات وتاريخ الإنشاء */}
              <div className="mt-auto flex items-center justify-between border-t border-border/50 bg-secondary/30 px-4 py-2.5 text-xs text-muted-foreground">
                <Badge variant="secondary" className="gap-1">
                  <ClipboardList className="size-3" />
                  {user._count.assignments} تكليف
                </Badge>
                <span className="font-semibold">{formatDate(user.createdAt)}</span>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* الملف التفصيلي للمستلم الإداري — قبل الاعتماد وبعده */}
      <ReceiverProfileDialog
        userId={detailsUserId}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
      />

      {/* حوار إضافة مستلم */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة مشرف أطباء جديد</DialogTitle>
            <DialogDescription>
              يُنشأ الحساب معتمداً تلقائياً — والجهة الصحية إجبارية من جهات الإدارة المسجلة ليرتبط
              المشرف بجهته رسمياً في منصة تكليفات.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="receiver-name">الاسم الكامل</Label>
              <Input id="receiver-name" placeholder="مثال: محمد عبدالله" {...form.register('name')} />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="receiver-phone">رقم الهاتف</Label>
              <div className="relative">
                <PhoneIcon className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="receiver-phone"
                  type="tel"
                  dir="ltr"
                  placeholder="7xxxxxxxx"
                  className="ps-10 text-start"
                  {...form.register('phone')}
                />
              </div>
              {form.formState.errors.phone && (
                <p className="text-xs text-destructive">{form.formState.errors.phone.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="receiver-hospital" className="flex items-center gap-2">
                <Hospital className="size-4 text-primary" />
                الجهة الصحية — من جهات الإدارة المسجلة *
              </Label>
              {/* الجولة 31: منتقي الجهة من كتالوج الإدارة — لا جهات حرة، الارتباط الرسمي مضمون */}
              <Select
                value={form.watch('hospitalName') || ''}
                onValueChange={(v) => form.setValue('hospitalName', v, { shouldValidate: true })}
              >
                <SelectTrigger id="receiver-hospital">
                  <SelectValue placeholder="اختر الجهة الصحية من القائمة" />
                </SelectTrigger>
                <SelectContent>
                  {activeHospitals.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      لا توجد جهات صحية مسجلة — أضف الجهة أولاً من قسم «الجهات الصحية»
                    </div>
                  ) : (
                    activeHospitals.map((h) => (
                      <SelectItem key={h.id} value={h.name}>
                        <span className="flex items-center gap-2">
                          {h.name}
                          {(h.location || h.city) && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="size-3" />
                              {h.location || h.city}
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {form.formState.errors.hospitalName && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.hospitalName.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="receiver-password">كلمة المرور</Label>
              <div className="relative">
                <Lock className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="receiver-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="ps-10 pe-10"
                  {...form.register('password')}
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
              {form.formState.errors.password && (
                <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
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
