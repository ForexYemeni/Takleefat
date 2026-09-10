'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BadgeCheck,
  Building2,
  Eye,
  EyeOff,
  FileText,
  Lock,
  PhoneIcon,
  ShieldAlert,
  UserPlus,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { apiFetcher, apiPost } from '@/lib/api-client'
import { formatDate, GENDER_LABELS, USER_STATUS_LABELS } from '@/lib/utils'
import { AFFILIATION_STATUS_LABELS } from '@/lib/network'
import {
  receiverCreateNurseSchema,
  type ReceiverCreateNurseInput,
  type ReceiverCreateNurseFormValues,
} from '@/lib/validations/user'
import { QUALIFICATION_OPTIONS } from '@/lib/utils'
import { zodResolver } from '@hookform/resolvers/zod'
import { StatusBadge } from '@/components/shared/status-badge'
import { EmptyState, DashboardSkeleton } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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

/**
 * كوادر جهتي — المستلم الإداري يضيف الممرضين الخاصين بجهته الصحية (الجولة الثامنة)
 * - يظهر الكادر المضاف فوراً في حساب الإدارة (الكادر التمريضي) وفي لوحة الجهة
 * - لا يستقبل أي تكليف أو إجراء قبل اعتماده من الإدارة ورفع مستنداته
 */

interface StaffNurse {
  affiliationId: string
  affiliationStatus: string
  affiliationStatusLabel: string
  requestedStatus: string | null
  workYears: number | null
  createdAt: string
  nurse: {
    id: string
    name: string
    phone: string
    gender: string | null
    specialty: string | null
    qualification: string | null
    yearsOfExperience: number | null
    status: string
    _count: { documents: number }
  }
}

export default function ReceiverStaffPage() {
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [details, setDetails] = useState<StaffNurse | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['receiver-staff'],
    queryFn: () => apiFetcher<{ org: { id: string; name: string; city: string | null; status: string } | null; nurses: StaffNurse[] }>('/api/receiver/staff'),
  })

  const createForm = useForm<ReceiverCreateNurseFormValues, unknown, ReceiverCreateNurseInput>({
    resolver: zodResolver(receiverCreateNurseSchema),
    defaultValues: {
      name: '',
      phone: '',
      password: '',
      gender: undefined,
      qualification: undefined,
      specialty: '',
      yearsOfExperience: undefined,
    } as unknown as ReceiverCreateNurseFormValues,
  })

  const createMutation = useMutation({
    mutationFn: (values: ReceiverCreateNurseInput) =>
      apiPost<{ message: string }>('/api/receiver/staff', {
        ...values,
        yearsOfExperience: values.yearsOfExperience ?? 0,
      }),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['receiver-staff'] })
      setCreateOpen(false)
      createForm.reset()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const org = data?.org
  const nurses = data?.nurses ?? []
  const orgPending = org?.status === 'PENDING'

  if (isLoading) return <DashboardSkeleton />

  const pendingCount = nurses.filter((n) => n.nurse.status === 'PENDING').length

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-extrabold">كوادر جهتي</h1>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            <Building2 className="size-4 text-primary" />
            {org ? (
              <>
                الممرضون الخاصون بجهة <span className="font-bold text-foreground">{org.name}</span>
                {org.city ? ` — ${org.city}` : ''}
              </>
            ) : (
              'لا توجد جهة صحية مرتبطة بحسابك بعد'
            )}
          </p>
        </div>
        {org && (
          <Button onClick={() => setCreateOpen(true)} className="shrink-0 gap-2">
            <UserPlus className="size-4" />
            إضافة ممرض للجهة
          </Button>
        )}
      </div>

      {/* تنبيه حالة الجهة: بانتظار الاعتماد */}
      {orgPending && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
          <Building2 className="size-5 shrink-0" />
          <p className="leading-relaxed">
            جهتك الصحية <span className="font-bold">({org?.name})</span> بانتظار اعتماد الإدارة —
            عند اعتمادها ستُعتمد ارتباطات كوادر الجهة تلقائياً، ويبقى اعتماد حساب كل كادر
            ورفع مستنداته لدى الإدارة شرطاً لاستقبال التكليفات.
          </p>
        </div>
      )}

      {/* تنبيه الحاجز: لا تكليفات قبل الاعتماد والمستندات */}
      {org && !orgPending && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <ShieldAlert className="size-5 shrink-0" />
          <p className="leading-relaxed">
            الكوادر المضافة هنا تظهر مباشرة في حساب الإدارة — ولا يستقبل أي كادر أي تكليف أو إجراء
            قبل <span className="font-bold">اعتماده من الإدارة ورفع مستنداته</span>
            {pendingCount > 0 && (
              <Badge className="ms-2 bg-amber-500 text-white">
                {pendingCount} بانتظار الاعتماد
              </Badge>
            )}
          </p>
        </div>
      )}

      {!org ? (
        <EmptyState
          icon={Building2}
          title="لا توجد جهة صحية مرتبطة بحسابك"
          description="إذا كانت جهتك جديدة فبانتظار اعتمادها من الإدارة — وإذا كانت قائمة يرجى مراجعة الإدارة لربطها بحسابك."
        />
      ) : nurses.length === 0 ? (
        <EmptyState
          icon={Users}
          title="لا يوجد كوادر في جهتك بعد"
          description="أضف الممرضين الخاصين بجهتك الصحية — سيراهم حساب الإدارة مباشرة ويعتمدهم بعد مراجعة مستنداتهم."
          action={
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <UserPlus className="size-4" />
              إضافة ممرض للجهة
            </Button>
          }
        />
      ) : (
        <div className="grid gap-2">
          {nurses.map((n) => (
            <div key={n.affiliationId} className="flex flex-wrap items-center gap-3 rounded-2xl border p-4">
              <span className="rounded-xl bg-secondary p-2.5">
                <Users className="size-5 text-primary" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-extrabold">
                  {n.nurse.name}
                  <span className="text-[10px] font-normal text-muted-foreground">الحساب:</span>
                  <StatusBadge status={n.nurse.status} labels={USER_STATUS_LABELS} />
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span dir="ltr">{n.nurse.phone}</span>
                  {n.nurse.gender && <span>{GENDER_LABELS[n.nurse.gender] ?? n.nurse.gender}</span>}
                  {n.nurse.specialty && <span>{n.nurse.specialty}</span>}
                  {n.nurse.yearsOfExperience != null && n.nurse.yearsOfExperience > 0 && (
                    <span>{n.nurse.yearsOfExperience} سنة خبرة</span>
                  )}
                  <span className="flex items-center gap-1">
                    <FileText className="size-3" />
                    {n.nurse._count.documents} مستند
                  </span>
                  <span>أُضيف {formatDate(n.createdAt)}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">الارتباط:</span>
                <Badge variant="outline">{n.affiliationStatusLabel}</Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => setDetails(n)}
                >
                  <Eye className="size-3.5" />
                  عرض
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------- حوار إضافة ممرض للجهة ---------- */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="size-4 text-primary" />
              إضافة ممرض لجهة {org?.name}
            </DialogTitle>
            <DialogDescription>
              يُنشأ الحساب بحالة «قيد المراجعة» — يظهر فوراً في حساب الإدارة ولن يستقبل أي تكليف
              قبل اعتماده من الإدارة ورفع مستنداته. أبلغ الممرض رقم هاتفه وكلمة المرور لتسجيل الدخول.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={createForm.handleSubmit((v) => createMutation.mutate(v))}
            className="space-y-4"
            noValidate
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="staff-first">الاسم *</Label>
                <Input id="staff-first" placeholder="مثال: محمد" {...createForm.register('name')} />
                {createForm.formState.errors.name && (
                  <p className="text-xs text-destructive">{createForm.formState.errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="staff-phone">رقم الهاتف *</Label>
                <div className="relative">
                  <PhoneIcon className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="staff-phone"
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
                  <p className="text-xs text-destructive">{createForm.formState.errors.phone.message}</p>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
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
                  <p className="text-xs text-destructive">{createForm.formState.errors.gender.message}</p>
                )}
              </div>
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
                    {QUALIFICATION_OPTIONS.map((q) => (
                      <SelectItem key={q.value} value={q.value}>
                        {q.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {createForm.formState.errors.qualification && (
                  <p className="text-xs text-destructive">
                    {createForm.formState.errors.qualification.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>التخصص *</Label>
                <Input placeholder="مثال: تمريض طوارئ" {...createForm.register('specialty')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="staff-exp">سنوات الخبرة *</Label>
                <Input
                  id="staff-exp"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={50}
                  placeholder="مثال: 5 — أو 0 للمتخرج الجديد"
                  {...createForm.register('yearsOfExperience')}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="staff-password">كلمة المرور *</Label>
              <div className="relative">
                <Lock className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="staff-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="8 أحرف على الأقل مع حروف وأرقام"
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
                <p className="text-xs text-destructive">{createForm.formState.errors.password.message}</p>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                إلغاء
              </Button>
              <Button type="submit" disabled={createMutation.isPending} className="gap-2">
                <UserPlus className="size-4" />
                {createMutation.isPending ? 'جارٍ الإضافة...' : 'إضافة الممرض'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ---------- حوار تفاصيل الكادر ---------- */}
      <Dialog open={!!details} onOpenChange={(open) => !open && setDetails(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>بيانات الكادر</DialogTitle>
            <DialogDescription>الحالة في الجهة والتقدم للاعتماد</DialogDescription>
          </DialogHeader>
          {details && (
            <div className="space-y-3">
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div className="rounded-xl border bg-background p-2.5">
                  <p className="text-[11px] text-muted-foreground">الاسم</p>
                  <p className="font-bold">{details.nurse.name}</p>
                </div>
                <div className="rounded-xl border bg-background p-2.5">
                  <p className="text-[11px] text-muted-foreground">الهاتف</p>
                  <p className="font-bold" dir="ltr">{details.nurse.phone}</p>
                </div>
                <div className="rounded-xl border bg-background p-2.5">
                  <p className="text-[11px] text-muted-foreground">المؤهل</p>
                  <p className="font-bold">{details.nurse.qualification ?? '—'}</p>
                </div>
                <div className="rounded-xl border bg-background p-2.5">
                  <p className="text-[11px] text-muted-foreground">التخصص</p>
                  <p className="font-bold">{details.nurse.specialty ?? '—'}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm">
                <span className="text-muted-foreground">حالة الحساب:</span>
                <StatusBadge status={details.nurse.status} labels={USER_STATUS_LABELS} />
                <span className="text-muted-foreground">— الارتباط بالجهة:</span>
                <Badge variant="outline">{details.affiliationStatusLabel}</Badge>
              </div>
              {orgPending && details.affiliationStatus === 'PENDING' && (
                <p className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs leading-relaxed text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
                  <Building2 className="mt-0.5 size-4 shrink-0" />
                  الارتباط قيد المراجعة لأن الجهة الصحية نفسها بانتظار اعتماد الإدارة —
                  سيُعتمد تلقائياً مع اعتماد الجهة دون أي إجراء إضافي.
                </p>
              )}
              {details.nurse.status === 'PENDING' && (
                <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  <BadgeCheck className="mt-0.5 size-4 shrink-0" />
                  الكادر بانتظار اعتماد الإدارة — يجب أن يرفع مستنداته (الهوية وصورة المزاولة) من
                  حسابه أولاً، ثم تعتمده الإدارة ليصبح جاهزاً لاستقبال التكليفات.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
