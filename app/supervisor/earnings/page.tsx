'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Banknote,
  Clock,
  Coins,
  Hourglass,
  Landmark,
  TrendingUp,
  Wallet,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetcher, apiPost } from '@/lib/api-client'
import { formatDateTime, formatCurrency, cn } from '@/lib/utils'
import { EmptyState, DashboardSkeleton } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * قسم أرباحي — مشرف الأطباء
 * نسبة من كل تكليف تُحتسب من حساب الإدارة + طلب سحب الأرباح
 * بعنوان المحفظة ورقم الحساب المحفوظَين بشكل رئيسي للسحب.
 */

interface EarningEntry {
  id: string
  amount: number
  percent: number
  createdAt: string
  assignment: { id: string; title: string; facility: string; value: number }
}

interface WithdrawalEntry {
  id: string
  amount: number
  walletAddress: string
  accountNumber: string
  status: string
  note: string | null
  createdAt: string
  processedAt: string | null
}

interface EarningsData {
  summary: {
    totalEarned: number
    withdrawn: number
    pending: number
    available: number
    sharePercent: number
  }
  earnings: EarningEntry[]
  withdrawals: WithdrawalEntry[]
  wallet: { walletAddress: string; accountNumber: string }
}

const WITHDRAWAL_STATUS: Record<string, { label: string; className: string }> = {
  PENDING: {
    label: 'قيد المعالجة',
    className:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900',
  },
  PAID: {
    label: 'تم الصرف',
    className:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900',
  },
  REJECTED: {
    label: 'مرفوض',
    className:
      'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900',
  },
}

export default function ReceiverEarningsPage() {
  const queryClient = useQueryClient()
  const [withdrawOpen, setWithdrawOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['receiver-earnings'],
    queryFn: () => apiFetcher<EarningsData>('/api/receiver/earnings'),
  })

  if (isLoading || !data) return <DashboardSkeleton />

  const { summary, earnings, withdrawals, wallet } = data

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-amber-100">
              <Coins className="size-5 text-amber-600" />
            </span>
            أرباحي
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            تُضاف نسبة {summary.sharePercent}٪ من قيمة كل تكليف تُنهيه إلى أرباحك — وتُحتسب من حساب
            الإدارة — ويمكنك طلب سحبها متى شئت
          </p>
        </div>
        <Button
          onClick={() => setWithdrawOpen(true)}
          className="shrink-0 gap-2 bg-amber-600 hover:bg-amber-700"
        >
          <Wallet className="size-4" />
          سحب الأرباح
        </Button>
      </div>

      {/* بطاقات الملخص */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={TrendingUp}
          label="إجمالي الأرباح"
          value={formatCurrency(summary.totalEarned)}
          tint="bg-teal-100 text-teal-700"
        />
        <SummaryCard
          icon={Banknote}
          label="متاح للسحب"
          value={formatCurrency(summary.available)}
          tint="bg-amber-100 text-amber-700"
          strong
        />
        <SummaryCard
          icon={Hourglass}
          label="قيد المعالجة"
          value={formatCurrency(summary.pending)}
          tint="bg-violet-100 text-violet-700"
        />
        <SummaryCard
          icon={CheckCircle2}
          label="تم سحبه"
          value={formatCurrency(summary.withdrawn)}
          tint="bg-emerald-100 text-emerald-700"
        />
      </div>

      {/* سجل الأرباح */}
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm font-bold">
          <TrendingUp className="size-4 text-primary" />
          سجل الأرباح من التكليفات ({earnings.length})
        </p>
        {earnings.length === 0 ? (
          <EmptyState
            icon={Coins}
            title="لا توجد أرباح بعد"
            description={`عند إنهاء أي تكليف تُضاف نسبة ${summary.sharePercent}٪ من قيمته إلى هذا القسم تلقائياً.`}
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {earnings.map((e) => (
              <Card key={e.id} className="border-amber-100 bg-amber-50/30 dark:bg-amber-950/10">
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{e.assignment.title}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {e.assignment.facility} — قيمة التكليف {formatCurrency(e.assignment.value)}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground/80">
                      {formatDateTime(e.createdAt)}
                    </p>
                  </div>
                  <div className="shrink-0 text-end">
                    <p className="text-base font-extrabold text-amber-700 dark:text-amber-300" dir="ltr">
                      +{formatCurrency(e.amount)}
                    </p>
                    <Badge variant="outline" className="mt-1 text-[10px]">
                      {e.percent}٪ من التكليف
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* طلبات السحب */}
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm font-bold">
          <Landmark className="size-4 text-primary" />
          طلبات السحب ({withdrawals.length})
        </p>
        {withdrawals.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            لا توجد طلبات سحب — اضغط «سحب الأرباح» لطلب صرف رصيدك المتاح
          </p>
        ) : (
          <div className="space-y-2.5">
            {withdrawals.map((w) => {
              const st = WITHDRAWAL_STATUS[w.status] ?? WITHDRAWAL_STATUS.PENDING
              return (
                <div
                  key={w.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-extrabold">
                      <span dir="ltr">{formatCurrency(w.amount)}</span>
                      <Badge variant="outline" className={cn('border text-[10px]', st.className)}>
                        {st.label}
                      </Badge>
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground" dir="auto">
                      المحفظة: {w.walletAddress} — الحساب: {w.accountNumber}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                      طُلب بتاريخ {formatDateTime(w.createdAt)}
                      {w.processedAt ? ` — عولج بتاريخ ${formatDateTime(w.processedAt)}` : ''}
                    </p>
                    {w.note && (
                      <p className="mt-1 rounded-lg bg-secondary/60 px-2.5 py-1 text-[11px] text-muted-foreground">
                        ملاحظة الإدارة: {w.note}
                      </p>
                    )}
                  </div>
                  {w.status === 'PAID' ? (
                    <CheckCircle2 className="size-6 shrink-0 text-emerald-600" />
                  ) : w.status === 'REJECTED' ? (
                    <XCircle className="size-6 shrink-0 text-red-500" />
                  ) : (
                    <Clock className="size-6 shrink-0 text-amber-500" />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <WithdrawDialog
        open={withdrawOpen}
        onOpenChange={setWithdrawOpen}
        available={summary.available}
        wallet={wallet}
      />
    </div>
  )
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tint,
  strong,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  tint: string
  strong?: boolean
}) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2.5">
        <span className={cn('flex size-9 items-center justify-center rounded-xl', tint)}>
          <Icon className="size-4.5" />
        </span>
        <p className="text-xs font-bold text-muted-foreground">{label}</p>
      </div>
      <p
        className={cn(
          'mt-2.5 font-extrabold',
          strong ? 'text-lg text-amber-700 dark:text-amber-300' : 'text-lg'
        )}
        dir="ltr"
      >
        {value}
      </p>
    </div>
  )
}

function WithdrawDialog({
  open,
  onOpenChange,
  available,
  wallet,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  available: number
  wallet: { walletAddress: string; accountNumber: string }
}) {
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('')
  const [walletAddress, setWalletAddress] = useState(wallet.walletAddress)
  const [accountNumber, setAccountNumber] = useState(wallet.accountNumber)

  const mutation = useMutation({
    mutationFn: () =>
      apiPost<{ message: string }>('/api/receiver/withdrawals', {
        amount,
        walletAddress,
        accountNumber,
      }),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['receiver-earnings'] })
      onOpenChange(false)
      setAmount('')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const valid =
    Number(amount) > 0 && Number(amount) <= available && walletAddress.trim().length >= 3 && accountNumber.trim().length >= 3

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <Wallet className="size-4.5" />
            </span>
            طلب سحب الأرباح
          </DialogTitle>
          <DialogDescription>
            رصيدك المتاح للسحب: <span className="font-extrabold text-amber-700" dir="ltr">{formatCurrency(available)}</span> —
            يُحفظ عنوان المحفظة ورقم الحساب بشكل رئيسي للسحب وسيظهر طلبك للإدارة مع بياناتك للمصادقة عليها.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="w-amount">مبلغ السحب (ريال)</Label>
            <Input
              id="w-amount"
              type="number"
              min={1}
              max={available}
              placeholder={`الحد الأقصى ${available}`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="w-wallet">عنوان المحفظة</Label>
            <Input
              id="w-wallet"
              placeholder="مثال: محفظة جيب — 77xxxxxxx"
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="w-account">رقم الحساب</Label>
            <Input
              id="w-account"
              placeholder="رقم الحساب أو المحفظة المصرفية"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button
              className="gap-2 bg-amber-600 hover:bg-amber-700"
              disabled={!valid || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              <Banknote className="size-4" />
              {mutation.isPending ? 'جارٍ الإرسال...' : 'إرسال طلب السحب'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
