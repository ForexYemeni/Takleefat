'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Lock, Loader2, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetcher, apiPatch } from '@/lib/api-client'
import { formatDate, ROLE_LABELS, USER_STATUS_LABELS } from '@/lib/utils'
import { StatusBadge } from '@/components/shared/status-badge'
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
    </div>
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
