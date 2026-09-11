'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Award, Lock, Loader2, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetcher, apiPatch } from '@/lib/api-client'
import { formatDate, ROLE_LABELS, USER_STATUS_LABELS } from '@/lib/utils'
import { StatusBadge } from '@/components/shared/status-badge'
import { Stars } from '@/components/shared/star-rating'
import { AffiliationsManager } from '@/components/nurse/affiliations-manager'
import { WorkDepartmentsManager } from '@/components/nurse/work-specialties-manager'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface MyProfile {
  id: string
  name: string
  phone: string
  role: string
  status: string
  specialty: string | null
  qualification: string | null
  yearsOfExperience: number | null
  createdAt: string
}

interface PasswordForm {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

export default function NurseProfilePage() {
  const [showPasswords, setShowPasswords] = useState(false)

  const { data } = useQuery({
    queryKey: ['my-profile'],
    queryFn: () => apiFetcher<{ user: MyProfile }>('/api/me/profile'),
  })

  const form = useForm<PasswordForm>({
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })

  const changePassword = async (values: PasswordForm) => {
    if (values.newPassword !== values.confirmPassword) {
      toast.error('كلمتا المرور غير متطابقتين')
      return
    }
    try {
      const res = await apiPatch<{ message: string }>('/api/me/profile', {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      })
      toast.success(res.message)
      form.reset()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const user = data?.user

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">الملف الشخصي</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          بيانات حسابك في منصة تكليفات | Takleefat
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">بيانات الحساب</CardTitle>
        </CardHeader>
        <CardContent>
          {user ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Info label="الاسم" value={user.name} />
              <Info label="رقم الهاتف" value={user.phone} ltr />
              <Info label="الدور" value={ROLE_LABELS[user.role] ?? user.role} />
              <div>
                <p className="text-xs text-muted-foreground">حالة الحساب</p>
                <div className="mt-1">
                  <StatusBadge status={user.status} labels={USER_STATUS_LABELS} />
                </div>
              </div>
              <Info label="التخصص" value={user.specialty ?? '—'} />
              <Info label="المؤهل العلمي" value={user.qualification ?? '—'} />
              <Info
                label="سنوات الخبرة"
                value={user.yearsOfExperience != null ? `${user.yearsOfExperience} سنة` : '—'}
              />
              <Info label="تاريخ الانضمام" value={formatDate(user.createdAt)} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">جارٍ تحميل البيانات...</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <KeyRound className="size-4 text-primary" />
            تغيير كلمة المرور
          </CardTitle>
          <CardDescription>كلمة المرور يجب أن تكون 8 أحرف على الأقل وتحتوي حروفاً وأرقاماً</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={form.handleSubmit(changePassword)}
            className="grid gap-4 sm:grid-cols-3"
            noValidate
          >
            <div className="space-y-2">
              <Label htmlFor="current-password">كلمة المرور الحالية</Label>
              <Input
                id="current-password"
                type={showPasswords ? 'text' : 'password'}
                autoComplete="current-password"
                {...form.register('currentPassword', { required: true })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">كلمة المرور الجديدة</Label>
              <Input
                id="new-password"
                type={showPasswords ? 'text' : 'password'}
                autoComplete="new-password"
                {...form.register('newPassword', { required: true, minLength: 8 })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">تأكيد كلمة المرور</Label>
              <Input
                id="confirm-password"
                type={showPasswords ? 'text' : 'password'}
                autoComplete="new-password"
                {...form.register('confirmPassword', { required: true })}
              />
            </div>
            <div className="flex items-center gap-3 sm:col-span-3">
              <Button type="submit" className="gap-2" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Lock className="size-4" />
                )}
                تحديث كلمة المرور
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowPasswords((v) => !v)}
              >
                {showPasswords ? 'إخفاء' : 'إظهار'} كلمات المرور
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* تخصصات العمل — تعدد تخصصات من كتالوج الإدارة: رقود/طوارئ/عناية/مختبر...
          عند إنشاء تكليف في أحد التخصصات يصل الإشعار للطبيب مباشرة */}
      <Card>
        <CardContent className="pt-6">
          <WorkDepartmentsManager />
        </CardContent>
      </Card>

      {/* جهات العمل — السجل المهني: إضافة جهات حالية/سابقة مع سنوات العمل */}
      <Card>
        <CardContent className="pt-6">
          <AffiliationsManager />
        </CardContent>
      </Card>

      {/* تقييماتي من المستلمين الإداريين — تُضاف تلقائياً للسيرة الذاتية */}
      <MyRatingsCard />
    </div>
  )
}

interface MyRating {
  id: string
  overall: number
  punctuality: number | null
  quality: number | null
  communication: number | null
  discipline: number | null
  comment: string | null
  createdAt: string
  receiver: { name: string }
  assignment: { id: string; title: string; facility: string }
}

function MyRatingsCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-ratings'],
    queryFn: () =>
      apiFetcher<{ ratings: MyRating[]; average: number; count: number }>('/api/me/ratings'),
  })

  if (isLoading) return null
  const ratings = data?.ratings ?? []
  if (ratings.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Award className="size-4 text-amber-500" />
            تقييماتي
          </CardTitle>
          <CardDescription>
            بعد إنهاء أول تكليف سيقيّمك المستلم الإداري — تُعرض التقييمات هنا وتُضاف تلقائياً إلى
            سيرتك الذاتية عند التقديم لأي تكليف آخر
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-lg">
          <span className="flex items-center gap-2">
            <Award className="size-4 text-amber-500" />
            تقييماتي من المستلمين الإداريين
          </span>
          <span className="flex items-center gap-2">
            <Stars value={data?.average ?? 0} size="md" />
            <Badge className="bg-amber-500 text-white">
              {data?.average} من 5 — {data?.count} تقييم
            </Badge>
          </span>
        </CardTitle>
        <CardDescription>
          هذه التقييمات تُعرض في سيرتك الذاتية عند التقديم على أي تكليف جديد
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {ratings.map((r) => (
          <div key={r.id} className="rounded-2xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-extrabold">{r.assignment.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  {r.assignment.facility} — قيّمك {r.receiver.name} بتاريخ {formatDate(r.createdAt)}
                </p>
              </div>
              <Stars value={r.overall} size="md" />
            </div>

            {(r.punctuality != null || r.quality != null || r.communication != null || r.discipline != null) && (
              <div className="mt-2.5 grid gap-1.5 text-xs sm:grid-cols-2">
                {(
                  [
                    ['الالتزام بالمواعيد', r.punctuality],
                    ['جودة الأداء الطبي', r.quality],
                    ['التعامل والتواصل', r.communication],
                    ['الانضباط المهني', r.discipline],
                  ] as const
                )
                  .filter(([, v]) => v != null)
                  .map(([label, v]) => (
                    <p
                      key={label}
                      className="flex items-center justify-between gap-2 rounded-lg bg-secondary/60 px-3 py-1.5"
                    >
                      <span className="text-muted-foreground">{label}</span>
                      <span className="flex items-center gap-1.5 font-bold">
                        {v}/5 <Stars value={v!} size="sm" />
                      </span>
                    </p>
                  ))}
              </div>
            )}

            {r.comment && (
              <p className="mt-2.5 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                «{r.comment}»
              </p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function Info({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-bold" dir={ltr ? 'ltr' : undefined} style={ltr ? { textAlign: 'start' } : undefined}>
        {value}
      </p>
    </div>
  )
}
