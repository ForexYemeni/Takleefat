'use client'

import { Wallet, Hash, UserRound, Info } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

export interface PaymentInfoData {
  paymentMethod: string
  paymentAccountNumber: string
  paymentAccountName: string
  paymentNotes: string
}

/**
 * بطاقة طرق الدفع للإدارة — تظهر بعد اعتماد التقديم
 * تعرض طريقة الدفع (محفظة جيب)، رقم الحساب، اسم الحساب، والمبلغ الواجب دفعه.
 */
export function PaymentCard({
  settings,
  dueAmount,
  breakdown,
  className = '',
}: {
  settings: PaymentInfoData
  dueAmount?: number | null
  breakdown?: Array<{ label: string; amount: number; negative?: boolean }>
  className?: string
}) {
  return (
    <div className={`rounded-2xl border-2 border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/30 ${className}`}>
      <p className="flex items-center gap-2 text-sm font-extrabold text-emerald-800 dark:text-emerald-300">
        <Wallet className="size-4" />
        طرق الدفع للإدارة
      </p>

      {breakdown && breakdown.length > 0 ? (
        <div className="mt-3 space-y-1.5 rounded-xl bg-white/70 p-3 text-sm dark:bg-black/20">
          {breakdown.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{row.label}</span>
              <span className={`font-bold ${row.negative ? 'text-red-600' : 'text-foreground'}`} dir="ltr">
                {row.negative ? '−' : ''} {formatCurrency(row.amount)}
              </span>
            </div>
          ))}
          {dueAmount != null && (
            <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2">
              <span className="font-extrabold text-emerald-800 dark:text-emerald-300">المبلغ الواجب دفعه للإدارة</span>
              <span className="text-base font-extrabold text-emerald-700 dark:text-emerald-300" dir="ltr">
                {formatCurrency(dueAmount)}
              </span>
            </div>
          )}
        </div>
      ) : (
        dueAmount != null && (
          <p className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-white/70 p-3 text-sm dark:bg-black/20">
            <span className="font-bold text-emerald-800 dark:text-emerald-300">المبلغ الواجب دفعه للإدارة</span>
            <span className="text-base font-extrabold text-emerald-700 dark:text-emerald-300" dir="ltr">
              {formatCurrency(dueAmount)}
            </span>
          </p>
        )
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border bg-white/70 p-3 dark:bg-black/20">
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Wallet className="size-3" />
            طريقة الدفع
          </p>
          <p className="mt-1 text-sm font-bold">{settings.paymentMethod || '—'}</p>
        </div>
        <div className="rounded-xl border bg-white/70 p-3 dark:bg-black/20">
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Hash className="size-3" />
            رقم حساب الإدارة
          </p>
          <p className="mt-1 text-sm font-bold" dir="ltr">
            {settings.paymentAccountNumber || '—'}
          </p>
        </div>
        <div className="rounded-xl border bg-white/70 p-3 dark:bg-black/20">
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <UserRound className="size-3" />
            اسم الحساب
          </p>
          <p className="mt-1 truncate text-sm font-bold">{settings.paymentAccountName || '—'}</p>
        </div>
      </div>

      {settings.paymentNotes && (
        <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-white/70 p-2.5 text-xs leading-relaxed text-muted-foreground dark:bg-black/20">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {settings.paymentNotes}
        </p>
      )}
    </div>
  )
}
