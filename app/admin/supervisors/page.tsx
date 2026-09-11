'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Lock, MapPin, MoreHorizontal, PhoneIcon, Search, UserPlus, UserCog } from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { apiFetcher, apiPost } from '@/lib/api-client'
import { formatDate, USER_STATUS_LABELS } from '@/lib/utils'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Eye, EyeOff, Hospital, Percent, ShieldCheck } from 'lucide-react'

interface ReceiverUser {
  id: string
  name: string
  phone: string
  role: string
  status: string
  hospitalName: string | null
  commissionPercent: number | null
  fullProfileAccess: boolean
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
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-extrabold">مشرفو الأطباء</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            إدارة حسابات مشرفي الأطباء — يستدعي كل مشرف أطباء جهته ويُنشئ تكليفات الأطباء
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative w-full sm:w-56">
            <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="بحث..."
              className="ps-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button onClick={() => setCreateOpen(true)} className="shrink-0 gap-2">
            <UserPlus className="size-4" />
            إضافة مشرف أطباء
          </Button>
        </div>
      </div>

      {receivers.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title="لا يوجد مستلمون إداريون"
          description="أضف أول حساب مستلم إداري ليتمكن من استلام التكليفات."
          action={
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <UserPlus className="size-4" />
              إضافة مستلم
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/60 hover:bg-secondary/60">
                  <TableHead>الاسم</TableHead>
                  <TableHead className="hidden md:table-cell">الهاتف</TableHead>
                  <TableHead className="hidden lg:table-cell">الجهة الصحية</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>الحصة والأذونات</TableHead>
                  <TableHead className="hidden md:table-cell">تكليفات</TableHead>
                  <TableHead className="hidden md:table-cell">تاريخ الإنشاء</TableHead>
                  <TableHead className="text-start">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receivers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-bold">{user.name}</TableCell>
                    <TableCell className="hidden md:table-cell" dir="ltr">
                      <span className="text-start">{user.phone}</span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {user.hospitalName ? (
                        <Badge variant="outline" className="gap-1">
                          <Hospital className="size-3" />
                          {user.hospitalName}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={user.status} labels={USER_STATUS_LABELS} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
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
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="secondary">{user._count.assignments} تكليف</Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {formatDate(user.createdAt)}
                    </TableCell>
                    <TableCell>
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
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
