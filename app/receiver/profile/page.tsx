'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import {
  BriefcaseBusiness,
  CalendarDays,
  ClipboardList,
  Eye,
  EyeOff,
  FileCheck2,
  Inbox,
  Loader2,
  Lock,
  PhoneIcon,
  Save,
  UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetcher, apiPatch } from '@/lib/api-client'
import { formatDate, ROLE_LABELS, USER_STATUS_LABELS } from '@/lib/utils'
import { StatusBadge } from '@/components/shared/status-badge'
import { MyOrgsCard } from '@/components/shared/my-orgs-card'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

interface MyProfile {
  id: string
  name: string
  phone: string
  role: string
  status: string
  createdAt: string
  _count: { documents: number; assignments: number; posts: number; applications: number }
}

interface NameForm {
  name: string
}
interface PasswordForm {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}
interface PhoneForm {
  currentPassword: string
  newPhone: string
}

export default function ReceiverProfilePage() {
  const queryClient = useQueryClient()
  const [showPasswords, setShowPasswords] = useState(false)

  const { data } = useQuery({
    queryKey: ['my-profile'],
    queryFn: () => apiFetcher<{ user: MyProfile }>('/api/me/profile'),
  })

  const user = data?.user

  // ---------- الاسم ----------
  const nameForm = useForm<NameForm>({
    values: { name: user?.name ?? '' },
  })
  const saveName = nameForm.handleSubmit(async (values) => {
    try {
      const res = await apiPatch<{ message: string }>('/api/me/profile', values)
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['my-profile'] })
    } catch (e) {
      toast.error((e as Error).message)
    }
  })

  // ---------- كلمة المرور ----------
  const passForm = useForm<PasswordForm>({
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })
  const savePassword = passForm.handleSubmit(async (values) => {
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
      passForm.reset()
    } catch (e) {
      toast.error((e as Error).message)
    }
  })

  // ---------- رقم الهاتف ----------
  const phoneForm = useForm<PhoneForm>({
    defaultValues: { currentPassword: '', newPhone: '' },
  })
  const savePhone = phoneForm.handleSubmit(async (values) => {
    try {
      const res = await apiPatch<{ message: string }>('/api/me/phone', values)
      toast.success(res.message)
      phoneForm.reset()
      queryClient.invalidateQueries({ queryKey: ['my-profile'] })
    } catch (e) {
      toast.error((e as Error).message)
    }
  })

  const initials = (user?.name ?? '')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">الملف الشخصي</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          بيانات حسابك كمستلم إداري وإدارة إعدادات الدخول
        </p>
      </div>

      {/* بطاقة الهوية */}
      <Card className="overflow-hidden">
        <div className="h-20 bg-gradient-to-l from-teal-600 via-teal-500 to-emerald-500" />
        <CardContent className="relative -mt-10 pb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <Avatar className="size-20 border-4 border-background shadow-lg">
              <AvatarFallback className="bg-teal-100 text-xl font-extrabold text-teal-800">
                {initials || '؟'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 pb-1">
              <p className="text-lg font-extrabold">{user?.name ?? '...'}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <PhoneIcon className="size-3.5" />
                  <span dir="ltr">{user?.phone ?? '—'}</span>
                </span>
                <span className="flex items-center gap-1">
                  <BriefcaseBusiness className="size-3.5" />
                  {user ? ROLE_LABELS[user.role] ?? user.role : '—'}
                </span>
                <span className="flex items-center gap-1">
                  <CalendarDays className="size-3.5" />
                  {user ? `منذ ${formatDate(user.createdAt)}` : '—'}
                </span>
              </p>
              <div className="mt-2">
                {user && <StatusBadge status={user.status} labels={USER_STATUS_LABELS} />}
              </div>
            </div>
          </div>

          {/* إحصاءات سريعة */}
          {user && (
            <div className="mt-6 grid grid-cols-3 gap-3">
              <Stat icon={ClipboardList} label="تكليف مُعلن" value={user._count.posts} />
              <Stat icon={Inbox} label="تكليف مؤكد" value={user._count.assignments} />
              <Stat icon={FileCheck2} label="مستند" value={user._count.documents} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* الجولة 44: جهاتي الصحية — الأساسية + الإضافية بموافقة الإدارة */}
      <MyOrgsCard />

      {/* تعديل الاسم */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserRound className="size-4 text-primary" />
            الاسم
          </CardTitle>
          <CardDescription>الاسم الظاهر في المنصة أمام الكادر والإدارة</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveName} className="flex flex-col gap-3 sm:flex-row sm:items-end" noValidate>
            <div className="flex-1 space-y-2">
              <Label htmlFor="profile-name">الاسم الكامل</Label>
              <Input id="profile-name" {...nameForm.register('name')} />
            </div>
            <Button type="submit" className="gap-2" disabled={nameForm.formState.isSubmitting}>
              {nameForm.formState.isSubmitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              حفظ الاسم
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* تغيير كلمة المرور */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lock className="size-4 text-primary" />
            تغيير كلمة المرور
          </CardTitle>
          <CardDescription>كلمة المرور يجب أن تكون 8 أحرف على الأقل وتحتوي حروفاً وأرقاماً</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={savePassword} className="grid gap-4 sm:grid-cols-3" noValidate>
            <div className="space-y-2">
              <Label htmlFor="rp-current">كلمة المرور الحالية</Label>
              <Input
                id="rp-current"
                type={showPasswords ? 'text' : 'password'}
                autoComplete="current-password"
                {...passForm.register('currentPassword', { required: true })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rp-new">كلمة المرور الجديدة</Label>
              <Input
                id="rp-new"
                type={showPasswords ? 'text' : 'password'}
                autoComplete="new-password"
                {...passForm.register('newPassword', { required: true, minLength: 8 })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rp-confirm">تأكيد كلمة المرور</Label>
              <Input
                id="rp-confirm"
                type={showPasswords ? 'text' : 'password'}
                autoComplete="new-password"
                {...passForm.register('confirmPassword', { required: true })}
              />
            </div>
            <div className="flex items-center gap-3 sm:col-span-3">
              <Button type="submit" className="gap-2" disabled={passForm.formState.isSubmitting}>
                {passForm.formState.isSubmitting ? (
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
                {showPasswords ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                {showPasswords ? 'إخفاء' : 'إظهار'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* تغيير رقم الهاتف */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <PhoneIcon className="size-4 text-primary" />
            تغيير رقم الهاتف
          </CardTitle>
          <CardDescription>
            الرقم هو معرّف الدخول — بعد التغيير استخدم الرقم الجديد لتسجيل الدخول
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={savePhone} className="grid gap-4 sm:grid-cols-3" noValidate>
            <div className="space-y-2">
              <Label htmlFor="ph-current">كلمة المرور الحالية</Label>
              <Input
                id="ph-current"
                type={showPasswords ? 'text' : 'password'}
                autoComplete="current-password"
                {...phoneForm.register('currentPassword', { required: true })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ph-new">الرقم الجديد</Label>
              <Input
                id="ph-new"
                dir="ltr"
                inputMode="tel"
                placeholder="7xxxxxxxx"
                className="text-start"
                {...phoneForm.register('newPhone', { required: true })}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full gap-2" disabled={phoneForm.formState.isSubmitting}>
                {phoneForm.formState.isSubmitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <PhoneIcon className="size-4" />
                )}
                تحديث الرقم
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
}) {
  return (
    <div className="rounded-2xl border bg-secondary/40 p-3 text-center">
      <Icon className="mx-auto size-4 text-primary" />
      <p className="mt-1 text-lg font-extrabold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}
