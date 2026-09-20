'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import {
  BriefcaseBusiness,
  CalendarDays,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  PhoneIcon,
  Save,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetcher, apiPatch } from '@/lib/api-client'
import { formatDate, ROLE_LABELS, USER_STATUS_LABELS } from '@/lib/utils'
import { StatusBadge } from '@/components/shared/status-badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmailAccountCard } from '@/components/shared/email-account-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

/**
 * ملف حساب الموارد البشرية — الجولة 66 | ميزة «فرصة»
 * نفس خدمات الملف القائمة (/api/me/profile، /api/me/password عبر profile patch،
 * /api/me/phone، بطاقة البريد) — بدون أي نظام جديد.
 */

interface MyProfile {
  id: string
  name: string
  phone: string
  role: string
  status: string
  jobTitle?: string | null
  hospitalName?: string | null
  createdAt: string
}

export default function HrProfilePage() {
  const queryClient = useQueryClient()
  const [showPasswords, setShowPasswords] = useState(false)

  const { data } = useQuery({
    queryKey: ['my-profile'],
    queryFn: () => apiFetcher<{ user: MyProfile }>('/api/me/profile'),
  })
  const user = data?.user

  const nameForm = useForm<{ name: string }>({ values: { name: user?.name ?? '' } })
  const saveName = nameForm.handleSubmit(async (values) => {
    try {
      const res = await apiPatch<{ message: string }>('/api/me/profile', values)
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['my-profile'] })
    } catch (e) {
      toast.error((e as Error).message)
    }
  })

  const passForm = useForm<{ currentPassword: string; newPassword: string; confirmPassword: string }>({
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

  const initials = (user?.name ?? '').split(' ').slice(0, 2).map((w) => w[0]).join('')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">الملف الشخصي</h1>
        <p className="mt-1 text-sm text-muted-foreground">بيانات حسابك في منظومة «فرصة» وإعدادات الدخول</p>
      </div>

      {/* بطاقة الهوية */}
      <Card className="overflow-hidden">
        <div className="h-20 bg-gradient-to-l from-violet-800 via-violet-600 to-sky-500" />
        <CardContent className="relative -mt-10 pb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <Avatar className="size-20 border-4 border-background shadow-lg">
              <AvatarFallback className="bg-violet-100 text-xl font-extrabold text-violet-800 dark:bg-violet-950/60 dark:text-violet-200">
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
                  {user ? ROLE_LABELS[user.role] ?? 'الموارد البشرية' : '—'}
                </span>
                <span className="flex items-center gap-1">
                  <CalendarDays className="size-3.5" />
                  {user ? `منذ ${formatDate(user.createdAt)}` : '—'}
                </span>
                {user?.hospitalName && (
                  <span className="flex items-center gap-1">
                    <Sparkles className="size-3.5" />
                    {user.hospitalName}
                  </span>
                )}
              </p>
              {user?.jobTitle && <p className="mt-0.5 text-xs font-bold text-muted-foreground">المسمى الوظيفي: {user.jobTitle}</p>}
              <div className="mt-2">{user && <StatusBadge status={user.status} labels={USER_STATUS_LABELS} />}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <EmailAccountCard />

      {/* الاسم */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserRound className="size-4 text-primary" />
            الاسم
          </CardTitle>
          <CardDescription>الاسم الظاهر أمام المتقدمين والإدارة</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveName} className="flex flex-col gap-3 sm:flex-row sm:items-end" noValidate>
            <div className="flex-1 space-y-2">
              <Label htmlFor="hr-name">الاسم الكامل</Label>
              <Input id="hr-name" {...nameForm.register('name')} />
            </div>
            <Button type="submit" className="gap-2" disabled={nameForm.formState.isSubmitting}>
              {nameForm.formState.isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              حفظ الاسم
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* كلمة المرور */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lock className="size-4 text-primary" />
            تغيير كلمة المرور
          </CardTitle>
          <CardDescription>كلمة المرور الأولية من الإدارة — يُستحسن تغييرها فور أول دخول</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={savePassword} className="grid gap-4 sm:grid-cols-3" noValidate>
            <div className="space-y-2">
              <Label htmlFor="hrp-current">كلمة المرور الحالية</Label>
              <Input id="hrp-current" type={showPasswords ? 'text' : 'password'} autoComplete="current-password" {...passForm.register('currentPassword', { required: true })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hrp-new">كلمة المرور الجديدة</Label>
              <Input id="hrp-new" type={showPasswords ? 'text' : 'password'} autoComplete="new-password" {...passForm.register('newPassword', { required: true, minLength: 8 })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hrp-confirm">تأكيد كلمة المرور</Label>
              <Input id="hrp-confirm" type={showPasswords ? 'text' : 'password'} autoComplete="new-password" {...passForm.register('confirmPassword', { required: true })} />
            </div>
            <div className="flex items-center gap-3 sm:col-span-3">
              <Button type="submit" className="gap-2" disabled={passForm.formState.isSubmitting}>
                {passForm.formState.isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
                تحديث كلمة المرور
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowPasswords((v) => !v)}>
                {showPasswords ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                {showPasswords ? 'إخفاء' : 'إظهار'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
