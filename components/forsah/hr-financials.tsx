'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Coins, TrendingUp, Wallet } from 'lucide-react'
import { apiFetcher } from '@/lib/api-client'
import { formatCurrency } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { ForsahBadge, TRANSACTION_STATUS_AR } from '@/components/forsah/opportunity-visuals'

/**
 * المالية والعمولات — لوحة HR (المواصفة 4/16/17)
 * إجمالي الرسوم / مستحقات HR / مستحقات الإدارة + تفصيل عمليات فرصه حصراً.
 */
interface OpportunityWithTx {
  id: string
  number: number
  title: string
  status: string
}

interface TxRow {
  id: string
  opportunityId: string
  baseAmount: number
  currency: string
  feeAmount: number
  hrCommissionAmount: number
  adminAmount: number
  status: string
  createdAt: string
}

export function HrFinancials() {
  const { data, isLoading } = useQuery({
    queryKey: ['forsah-financials'],
    queryFn: () => apiFetcher<{ opportunities: OpportunityWithTx[] }>('/api/opportunities?take=50'),
  })

  const dashboard = useQuery({
    queryKey: ['forsah-dashboard'],
    queryFn: () =>
      apiFetcher<{ stats: { totalFees: number; hrCommission: number; adminAmount: number } }>(
        '/api/forsah/dashboard'
      ),
  })

  // جلب عمليات كل فرصة (العدد صغير — ضمن نطاق v1)
  const opportunityIds = useMemo(() => (data?.opportunities ?? []).map((o) => o.id), [data])
  const { data: txData, isLoading: txLoading } = useQuery({
    queryKey: ['forsah-financials-tx', opportunityIds],
    queryFn: async () => {
      const results = await Promise.all(
        opportunityIds.map((id) =>
          apiFetcher<{ transactions: TxRow[] }>(`/api/opportunities/${id}/transaction`)
            .then((r) => r.transactions.map((t) => ({ ...t, opportunityId: id })))
            .catch(() => [] as (TxRow & { opportunityId: string })[])
        )
      )
      return { rows: results.flat() }
    },
    enabled: opportunityIds.length > 0,
  })

  const oppById = new Map((data?.opportunities ?? []).map((o) => [o.id, o]))
  const rows = txData?.rows ?? []
  const totalFees = rows.reduce((s, t) => s + t.feeAmount, 0)
  const hrTotal = rows.reduce((s, t) => s + t.hrCommissionAmount, 0)
  const adminTotal = rows.reduce((s, t) => s + t.adminAmount, 0)

  return (
    <div className="space-y-5">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-black">
          <span className="flex size-9 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-amber-400 text-white shadow-md">
            <Wallet className="size-4.5" />
          </span>
          المالية والعمولات
        </h1>
        <p className="mt-1 text-xs font-bold text-muted-foreground">
          مستحقاتك من رسوم الفرص — تُحتسب تلقائياً عند اختيار كل موظف وفق إعدادات الإدارة
        </p>
      </header>

      {/* الملخص */}
      <div className="grid grid-cols-3 gap-2.5">
        {[
          { label: 'إجمالي الرسوم', value: totalFees, icon: Coins, tone: 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300' },
          { label: 'مستحقات HR', value: hrTotal, icon: Wallet, tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' },
          { label: 'مستحقات الإدارة', value: adminTotal, icon: TrendingUp, tone: 'bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300' },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border bg-card p-3.5 shadow-sm">
            <span className={`flex size-8 items-center justify-center rounded-xl ${c.tone}`}>
              <c.icon className="size-4" />
            </span>
            {isLoading || txLoading ? (
              <Skeleton className="mt-2 h-7 w-20" />
            ) : (
              <p className="mt-2 text-lg font-black tabular-nums">{formatCurrency(c.value)}</p>
            )}
            <p className="mt-0.5 text-[10px] font-bold text-muted-foreground">{c.label}</p>
          </div>
        ))}
      </div>

      {/* العمليات */}
      {txLoading ? (
        <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed px-6 py-12 text-center">
          <Coins className="size-8 text-amber-500" />
          <p className="text-sm font-black">لا عمليات مالية بعد</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            تُنشأ العملية المالية تلقائياً عند اختيار موظف لفرصة لها راتب محدد — ولا تُنشأ مطلقاً في فرص «حسب الاتفاق»
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((t) => {
            const opp = oppById.get(t.opportunityId)
            return (
              <article key={t.id} className="rounded-2xl border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black">{opp ? `فرصة ${opp.number} — ${opp.title}` : 'فرصة'}</p>
                    <p className="mt-0.5 text-[10px] font-bold text-muted-foreground">{t.createdAt ? new Date(t.createdAt).toLocaleDateString('ar') : ''}</p>
                  </div>
                  <Badge variant="secondary">{TRANSACTION_STATUS_AR[t.status] ?? t.status}</Badge>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-muted/50 p-2">
                    <p className="text-[10px] font-bold text-muted-foreground">الرسوم</p>
                    <p className="text-sm font-black">{t.feeAmount.toLocaleString('ar-YE')}</p>
                  </div>
                  <div className="rounded-xl bg-emerald-500/10 p-2">
                    <p className="text-[10px] font-bold text-muted-foreground">نصيبك</p>
                    <p className="text-sm font-black text-emerald-700 dark:text-emerald-300">{t.hrCommissionAmount.toLocaleString('ar-YE')}</p>
                  </div>
                  <div className="rounded-xl bg-sky-500/10 p-2">
                    <p className="text-[10px] font-bold text-muted-foreground">الإدارة</p>
                    <p className="text-sm font-black text-sky-700 dark:text-sky-300">{t.adminAmount.toLocaleString('ar-YE')}</p>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
