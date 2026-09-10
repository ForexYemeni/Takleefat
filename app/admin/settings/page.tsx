'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BadgeDollarSign,
  Banknote,
  Coins,
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
import { cn, formatCurrency } from '@/lib/utils'
import {
  settingsSchema,
  type SettingsInput,
  type SettingsFormValues,
} from '@/lib/validations/post'
import { DashboardSkeleton } from '@/components/shared/empty-state'
import { DepartmentManager } from '@/components/admin/catalog-manager'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

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

  const form = useForm<SettingsFormValues, unknown, SettingsInput>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      feeMode: 'ADMIN',
      applicationFee: 1000,
      adminFeeType: 'PERCENTAGE',
      adminPercentage: 10,
      adminFeeFixed: 0,
      paymentMethod: 'محفظة جيب',
      paymentAccountNumber: '',
      paymentAccountName: 'منصة تكليفات',
      paymentNotes: '',
      receiverSharePercent: 10,
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

  const feeMode = form.watch('feeMode')
  const applicationFee = Number(form.watch('applicationFee')) || 0
  const adminPercentage = Number(form.watch('adminPercentage')) || 0
  const adminFeeFixed = Number(form.watch('adminFeeFixed')) || 0
  const adminFeeType = form.watch('adminFeeType')
  const receiverSharePercent = Number(form.watch('receiverSharePercent')) || 0

  if (isLoading) return <DashboardSkeleton />

  const adminShareExample =
    adminFeeType === 'FIXED'
      ? adminFeeFixed
      : Math.round((100000 * adminPercentage) / 100)

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
              <p className="text-sm text-muted-foreground">حصة الإدارة من التكليف</p>
              <p className="mt-1 text-3xl font-extrabold" dir="ltr">
                {adminFeeType === 'FIXED' ? formatCurrency(adminFeeFixed) : `${adminPercentage}٪`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {adminFeeType === 'FIXED' ? 'مبلغ ثابت لكل تكليف' : 'نسبة من قيمة كل تكليف'} — مثال: تكليف
                {' '}100,000 → {formatCurrency(adminShareExample)} للإدارة
              </p>
            </div>
            <span className="rounded-xl bg-teal-50 p-2.5 text-teal-700">
              <Percent className="size-5" />
            </span>
          </CardContent>
        </Card>
      </div>

      <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-4">
        {/* الرسوم — نوع واحد فقط: حصة إدارة أو رسوم تقديم */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Banknote className="size-4 text-primary" />
              رسوم المنصة — تُحصّل واحدة فقط
            </CardTitle>
            <CardDescription>
              اختر نمط الرسوم: حصة إدارة مقتطعة من قيمة التكليف، أو رسوم تقديم يدفعها الكادر — لا
              تُحصّل الاثنان معاً. تُعرض للكادر والجهات عند التقديم وبعد الاعتماد
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* مبدّل النمط */}
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => form.setValue('feeMode', 'ADMIN', { shouldDirty: true })}
                className={cn(
                  'rounded-2xl border-2 p-4 text-start transition-all',
                  feeMode === 'ADMIN'
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border hover:border-primary/40'
                )}
              >
                <div className="flex items-center gap-2">
                  <Percent className={cn('size-4', feeMode === 'ADMIN' ? 'text-primary' : 'text-muted-foreground')} />
                  <p className={cn('text-sm font-extrabold', feeMode === 'ADMIN' && 'text-primary')}>
                    حصة إدارة من قيمة التكليف
                  </p>
                  {feeMode === 'ADMIN' && <Badge className="ms-auto">النمط النشط</Badge>}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  نسبة مئوية أو مبلغ ثابت يُقتطع من قيمة كل تكليف مؤكد — بلا رسوم تقديم على الكادر
                </p>
              </button>
              <button
                type="button"
                onClick={() => form.setValue('feeMode', 'APPLICATION', { shouldDirty: true })}
                className={cn(
                  'rounded-2xl border-2 p-4 text-start transition-all',
                  feeMode === 'APPLICATION'
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border hover:border-primary/40'
                )}
              >
                <div className="flex items-center gap-2">
                  <BadgeDollarSign className={cn('size-4', feeMode === 'APPLICATION' ? 'text-primary' : 'text-muted-foreground')} />
                  <p className={cn('text-sm font-extrabold', feeMode === 'APPLICATION' && 'text-primary')}>
                    رسوم تقديم من الكادر
                  </p>
                  {feeMode === 'APPLICATION' && <Badge className="ms-auto">النمط النشط</Badge>}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  مبلغ ثابت يدفعه الكادر بعد اعتماد تقديمه — بلا اقتطاع من قيمة التكليف
                </p>
              </button>
            </div>

            {feeMode === 'ADMIN' ? (
              <div className="grid gap-4 rounded-2xl bg-muted/40 p-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="s-fee-type">حصة الإدارة — نسبة أم مبلغ ثابت؟</Label>
                  <Select
                    value={adminFeeType}
                    onValueChange={(v) => form.setValue('adminFeeType', v as 'PERCENTAGE' | 'FIXED')}
                  >
                    <SelectTrigger id="s-fee-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PERCENTAGE">نسبة مئوية من قيمة التكليف</SelectItem>
                      <SelectItem value="FIXED">مبلغ ثابت لكل تكليف</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {adminFeeType === 'PERCENTAGE' ? (
                  <div className="space-y-2">
                    <Label htmlFor="s-percent">نسبة الإدارة (٪ من قيمة التكليف)</Label>
                    <Input id="s-percent" type="number" min={0} max={100} {...form.register('adminPercentage')} />
                    {form.formState.errors.adminPercentage && (
                      <p className="text-xs text-destructive">{form.formState.errors.adminPercentage.message}</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="s-fixed">المبلغ الثابت للحصة الإدارية (ريال / لكل تكليف)</Label>
                    <Input id="s-fixed" type="number" min={1} {...form.register('adminFeeFixed')} />
                    {form.formState.errors.adminFeeFixed && (
                      <p className="text-xs text-destructive">{form.formState.errors.adminFeeFixed.message}</p>
                    )}
                  </div>
                )}
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  مثال: تكليف بقيمة 100,000 ريال → حصة الإدارة{' '}
                  <span className="font-bold text-foreground">{formatCurrency(adminShareExample)}</span>
                </p>
              </div>
            ) : (
              <div className="grid gap-4 rounded-2xl bg-muted/40 p-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="s-fee">رسوم التقديم (ريال يمني — لكل تقديم معتمد)</Label>
                  <Input id="s-fee" type="number" min={1} {...form.register('applicationFee')} />
                  {form.formState.errors.applicationFee && (
                    <p className="text-xs text-destructive">{form.formState.errors.applicationFee.message}</p>
                  )}
                </div>
                <p className="self-center text-xs text-muted-foreground">
                  تُحصّل من الكادر بعد اعتماد تقديمه — وتبقى قيمة التكليف كاملة للكادر بدون أي اقتطاع
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* نسبة المستلم الإداري */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Coins className="size-4 text-amber-600" />
              نسبة المستلم الإداري من كل تكليف
            </CardTitle>
            <CardDescription>
              تُضاف هذه النسبة من قيمة كل تكليف إلى قسم «أرباحي» لدى المستلم الإداري — وتُحتسب من
              حساب الإدارة — ويمكنه طلب سحبها ببيانات محفظته
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 rounded-2xl bg-muted/40 p-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="s-receiver-share">نسبة المستلم الإداري (٪ من قيمة التكليف)</Label>
                <Input
                  id="s-receiver-share"
                  type="number"
                  min={0}
                  max={100}
                  {...form.register('receiverSharePercent')}
                />
                {form.formState.errors.receiverSharePercent && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.receiverSharePercent.message}
                  </p>
                )}
              </div>
              <p className="self-center text-xs leading-relaxed text-muted-foreground">
                مثال: تكليف بقيمة 100,000 ريال بنسبة{' '}
                <span className="font-bold text-foreground">{receiverSharePercent}٪</span> → ربح
                المستلم{' '}
                <span className="font-bold text-amber-700" dir="ltr">
                  {formatCurrency(Math.round((100000 * receiverSharePercent) / 100))}
                </span>{' '}
                تُضاف لأرباحه بعد إنهاء التكليف
              </p>
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

      {/* الأقسام الطبية — تظهر للمستلم الإداري عند إنشاء التكليف
          (الجهات الصحية تُدار من قسم «الجهات الصحية» المخصص — أُزيلت من هنا لتجنب الازدواج) */}
      <Card className="mt-2">
        <CardHeader>
          <CardTitle className="text-lg">إدارة الأقسام الطبية</CardTitle>
          <CardDescription>
            الأقسام التي يختار منها المستلم الإداري والإدارة عند إنشاء التكليف — مثل: عناية،
            طوارئ، رقود، حضانة، قبالة، مختبر
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DepartmentManager />
        </CardContent>
      </Card>
    </div>
  )
}
