'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BadgeDollarSign,
  Banknote,
  Hash,
  Percent,
  PiggyBank,
  Save,
  UserRound,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { apiFetcher, apiPatch } from '@/lib/api-client'
import { formatCurrency } from '@/lib/utils'
import { settingsSchema, type SettingsInput } from '@/lib/validations/post'
import { DashboardSkeleton } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface AdminStats {
  receivedAssignments: number
  approvedNurses: number
  pendingNurses: number
  pendingReceivers: number
  pendingDocuments: number
  openPosts: number
  pendingApplications: number
}

interface SettingsPayload {
  settings: SettingsInput & { paymentNotes: string }
}

export default function AdminSettingsPage() {
  const queryClient = useQueryClient()
  const [savedAt, setSavedAt] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiFetcher<SettingsPayload>('/api/settings'),
  })

  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: () => apiFetcher<AdminStats>('/api/stats'),
  })

  const form = useForm<SettingsInput>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      applicationFee: 1000,
      adminPercentage: 10,
      paymentMethod: 'محفظة جيب',
      paymentAccountNumber: '',
      paymentAccountName: 'منصة تكليفات',
      paymentNotes: '',
    },
  })

  useEffect(() => {
    if (data?.settings) {
      form.reset(data.settings)
    }
  }, [data, form])

  const saveMutation = useMutation({
    mutationFn: (values: SettingsInput) => apiPatch<{ message: string }>('/api/settings', values),
    onSuccess: (res) => {
      toast.success(res.message)
      setSavedAt(new Date().toISOString())
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (isLoading) return <DashboardSkeleton />

  const applicationFee = Number(form.watch('applicationFee')) || 0
  const adminPercentage = Number(form.watch('adminPercentage')) || 0

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">الرسوم وطرق الدفع</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          تحكم في رسوم التقديم ونسبة الإدارة من التكليفات، وبيانات حساب الدفع (مثل محفظة جيب)
          التي تظهر للكادر والجهات بعد الاعتماد
        </p>
      </div>

      {/* ملخص الإيرادات */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-start justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">تكليفات مؤكدة (تم استلامها)</p>
              <p className="mt-1 text-3xl font-extrabold">{stats?.receivedAssignments ?? 0}</p>
              <p className="mt-1 text-xs text-muted-foreground">لكل تكليف تُحتسب نسبة الإدارة</p>
            </div>
            <span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700">
              <PiggyBank className="size-5" />
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-start justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">رسوم التقديم الحالية</p>
              <p className="mt-1 text-3xl font-extrabold" dir="ltr">
                {formatCurrency(applicationFee)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">تُدفع من الكادر بعد اعتماد التقديم</p>
            </div>
            <span className="rounded-xl bg-amber-50 p-2.5 text-amber-700">
              <BadgeDollarSign className="size-5" />
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-start justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">نسبة الإدارة من التكليف</p>
              <p className="mt-1 text-3xl font-extrabold" dir="ltr">
                {adminPercentage}٪
              </p>
              <p className="mt-1 text-xs text-muted-foreground">مثال: تكليف 100,000 → {formatCurrency(Math.round(100000 * adminPercentage / 100))} للإدارة</p>
            </div>
            <span className="rounded-xl bg-teal-50 p-2.5 text-teal-700">
              <Percent className="size-5" />
            </span>
          </CardContent>
        </Card>
      </div>

      <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-4">
        {/* الرسوم */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Banknote className="size-4 text-primary" />
              رسوم المنصة
            </CardTitle>
            <CardDescription>
              تُعرض هذه الرسوم للكادر التمريضي عند التقديم على التكليفات وبعد الاعتماد
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="s-fee">رسوم التقديم (ريال يمني)</Label>
              <Input id="s-fee" type="number" min={0} {...form.register('applicationFee')} />
              {form.formState.errors.applicationFee && (
                <p className="text-xs text-destructive">{form.formState.errors.applicationFee.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-percent">نسبة الإدارة من قيمة التكليف (٪)</Label>
              <Input id="s-percent" type="number" min={0} max={100} {...form.register('adminPercentage')} />
              {form.formState.errors.adminPercentage && (
                <p className="text-xs text-destructive">{form.formState.errors.adminPercentage.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* طرق الدفع */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Wallet className="size-4 text-primary" />
              بيانات الدفع للإدارة
            </CardTitle>
            <CardDescription>
              تظهر للكادر والجهات المُعلنة بعد اعتماد التقديم — مثال: محفظة جيب مع رقم الحساب واسم صاحبه
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="s-method">طريقة الدفع</Label>
              <Input id="s-method" placeholder="مثال: محفظة جيب" {...form.register('paymentMethod')} />
              {form.formState.errors.paymentMethod && (
                <p className="text-xs text-destructive">{form.formState.errors.paymentMethod.message}</p>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="s-account" className="flex items-center gap-1.5">
                  <Hash className="size-3.5" />
                  رقم حساب الإدارة
                </Label>
                <Input
                  id="s-account"
                  dir="ltr"
                  className="text-start"
                  placeholder="مثال: 755000000"
                  {...form.register('paymentAccountNumber')}
                />
                {form.formState.errors.paymentAccountNumber && (
                  <p className="text-xs text-destructive">{form.formState.errors.paymentAccountNumber.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-account-name" className="flex items-center gap-1.5">
                  <UserRound className="size-3.5" />
                  اسم الحساب (المستفيد)
                </Label>
                <Input
                  id="s-account-name"
                  placeholder="مثال: منصة تكليفات"
                  {...form.register('paymentAccountName')}
                />
                {form.formState.errors.paymentAccountName && (
                  <p className="text-xs text-destructive">{form.formState.errors.paymentAccountName.message}</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-notes">ملاحظات تظهر مع بيانات الدفع (اختياري)</Label>
              <Textarea
                id="s-notes"
                rows={2}
                placeholder="مثال: يُرجى إرسال صورة إثبات التحويل عبر واتساب للإدارة بعد الدفع."
                {...form.register('paymentNotes')}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-3">
          {savedAt && !form.formState.isDirty && (
            <p className="text-xs text-muted-foreground">تم الحفظ ✓</p>
          )}
          <Button type="submit" className="gap-2" disabled={saveMutation.isPending}>
            <Save className="size-4" />
            {saveMutation.isPending ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}
          </Button>
        </div>
      </form>
    </div>
  )
}
