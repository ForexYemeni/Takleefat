'use client'

import { cn } from '@/lib/utils'
import {
  BadgeCheck,
  CalendarClock,
  CircleDollarSign,
  Clock,
  Coins,
  FileText,
  HeartPulse,
  MapPin,
  Sparkles,
  Stethoscope,
  TriangleAlert,
  UserCheck,
  Users,
} from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * عناصر بصرية مشتركة لـ «فرصة | Forsah» — الجولة 66 | تكليفات | Takleefat
 * ============================================================
 * شارات الحالات + تنسيق الرواتب + قائمة الأهلية + خط زمني الطلب.
 * هوية Premium Medical SaaS بهوية تكليفات (Deep Navy + بنفسجي فرصة)
 * — متسقة مع Design System القائم: بطاقات مستديرة 16–22px وظلال ناعمة.
 */

// ---------------- شارات الحالات ----------------

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:ring-slate-700',
  PUBLISHED: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800',
  ACTIVE: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-800',
  PAUSED: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800',
  CLOSED: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800',
  ARCHIVED: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-800',
}

export const OPPORTUNITY_STATUS_AR: Record<string, string> = {
  DRAFT: 'مسودة',
  PUBLISHED: 'منشورة',
  ACTIVE: 'نشطة',
  PAUSED: 'متوقفة مؤقتاً',
  CLOSED: 'مغلقة',
  ARCHIVED: 'مؤرشفة',
}

export const APPLICATION_STATUS_AR: Record<string, string> = {
  PENDING: 'قيد المراجعة',
  REVIEWED: 'تمت المراجعة',
  INTERVIEW_INVITED: 'مرشح للمقابلة',
  INTERVIEW_CONFIRMED: 'مقابلة مؤكدة',
  INTERVIEW_DECLINED: 'اعتذر عن المقابلة',
  SELECTED: 'تم الاختيار',
  REJECTED: 'غير مقبول',
  WITHDRAWN: 'منسحب',
}

export const APPLICATION_STATUS_STYLES: Record<string, string> = {
  PUBLISHED: STATUS_STYLES.PUBLISHED,
  PENDING: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800',
  REVIEWED: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-800',
  INTERVIEW_INVITED: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-800',
  INTERVIEW_CONFIRMED: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800',
  INTERVIEW_DECLINED: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:ring-slate-700',
  SELECTED: 'bg-emerald-600 text-white ring-emerald-600 shadow-sm',
  REJECTED: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800',
  WITHDRAWN: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:ring-slate-700',
}

export const TRANSACTION_STATUS_AR: Record<string, string> = {
  PENDING: 'معلقة',
  AWAITING_PAYMENT: 'بانتظار السداد',
  PAID: 'مسددة',
  PARTIALLY_PAID: 'مسددة جزئياً',
  FAILED: 'فاشلة',
  CANCELLED: 'ملغاة',
  REFUNDED: 'مستردة',
  COMPLETED: 'مكتملة',
}

export function ForsahBadge({ status, kind = 'opportunity', className }: { status: string; kind?: 'opportunity' | 'application' | 'transaction'; className?: string }) {
  const label =
    kind === 'opportunity'
      ? (OPPORTUNITY_STATUS_AR[status] ?? status)
      : kind === 'application'
        ? (APPLICATION_STATUS_AR[status] ?? status)
        : (TRANSACTION_STATUS_AR[status] ?? status)
  const styleKey = kind === 'opportunity' ? status : status
  const styles = kind === 'transaction' ? STATUS_STYLES : (APPLICATION_STATUS_STYLES[styleKey] ?? STATUS_STYLES[styleKey] ?? STATUS_STYLES.DRAFT)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-black ring-1',
        styles,
        className
      )}
    >
      {status === 'SELECTED' && <BadgeCheck className="size-3" />}
      {label}
    </span>
  )
}

// ---------------- تنسيق الراتب ----------------

export const SALARY_TYPE_AR: Record<string, string> = {
  MONTHLY: 'شهري',
  DAILY: 'يومي',
  NEGOTIABLE: 'حسب الاتفاق',
}

export const FORSAH_CURRENCY_AR: Record<string, string> = {
  YER: 'ريال',
  SAR: 'ريال سعودي',
  USD: '$',
}

export function formatSalary(
  amount: number | null | undefined,
  type: string,
  currency: string
): { main: string; suffix: string } {
  if (type === 'NEGOTIABLE' || amount == null || amount <= 0) {
    return { main: 'حسب الاتفاق', suffix: '' }
  }
  const symbol = FORSAH_CURRENCY_AR[currency] ?? 'ريال'
  return {
    main: amount.toLocaleString('ar-YE'),
    suffix: `${symbol} / ${SALARY_TYPE_AR[type] ?? 'شهري'}`,
  }
}

// ---------------- صف معلومة صغير ----------------

export function InfoChip({ icon: Icon, children, className }: { icon?: React.ComponentType<{ className?: string }>; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground', className)}>
      {Icon && <Icon className="size-3.5 shrink-0 text-[var(--role-accent)]" />}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  )
}

export { MapPin, Clock, Coins, Users, Stethoscope, HeartPulse, CircleDollarSign, FileText, CalendarClock, UserCheck, Sparkles }

// ---------------- قائمة الأهلية (المواصفة 7) ----------------

export interface EligibilityCheckLite {
  ok: boolean
  blocking: boolean
  text: string
}

export function EligibilityPanel({ checks, eligible }: { checks: EligibilityCheckLite[]; eligible: boolean }) {
  if (checks.length === 0) return null
  return (
    <div
      className={cn(
        'rounded-2xl border p-4',
        eligible
          ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/30'
          : 'border-amber-200 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/30'
      )}
    >
      <p className="mb-3 flex items-center gap-2 text-sm font-black">
        <Sparkles className={cn('size-4', eligible ? 'text-emerald-600' : 'text-amber-600')} />
        {eligible ? 'أنت مؤهل لهذه الفرصة' : 'مطابقتك لهذه الفرصة'}
      </p>
      <ul className="space-y-2">
        {checks.map((c, i) => (
          <li key={i} className="flex items-start gap-2 text-xs font-semibold leading-relaxed">
            <span
              className={cn(
                'mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-white',
                c.ok ? 'bg-emerald-500' : c.blocking ? 'bg-rose-500' : 'bg-amber-500'
              )}
            >
              {c.ok ? '✓' : '✗'}
            </span>
            <span className="text-muted-foreground">{c.text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------- خط زمني الطلب (المواصفة 24) ----------------

const TIMELINE_STAGES = [
  { key: 'submitted', label: 'تم التقديم' },
  { key: 'reviewed', label: 'تمت المراجعة' },
  { key: 'invited', label: 'تم الترشيح للمقابلة' },
  { key: 'scheduled', label: 'تم تحديد المقابلة' },
  { key: 'attended', label: 'تم حضور المقابلة' },
  { key: 'selected', label: 'تم الاختيار' },
  { key: 'completed', label: 'تم إكمال العملية' },
] as const

/** تحويل حالة الطلب إلى مرحلة الخط الزمني (0..6) — -1 للطلبات السالبة */
export function timelineStageOf(status: string): number {
  switch (status) {
    case 'PENDING':
      return 0
    case 'REVIEWED':
      return 1
    case 'INTERVIEW_INVITED':
      return 2
    case 'INTERVIEW_CONFIRMED':
      return 4
    case 'SELECTED':
      return 5
    case 'COMPLETED_TX':
      return 6
    default:
      return -1 // REJECTED / WITHDRAWN / INTERVIEW_DECLINED — خط منقطع
  }
}

export function ApplicationTimeline({ status, selected }: { status: string; selected?: boolean }) {
  const current = selected ? 5 : timelineStageOf(status)
  const broken = current === -1

  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="mb-4 flex items-center gap-2 text-sm font-black">
        <Clock className="size-4 text-[var(--role-accent)]" />
        مراحل طلبك
      </p>
      <ol className="relative space-y-0">
        {TIMELINE_STAGES.map((stage, i) => {
          const done = !broken && i <= current
          const isCurrent = !broken && i === current
          const isLast = i === TIMELINE_STAGES.length - 1
          return (
            <li key={stage.key} className="relative flex gap-3 pb-4 last:pb-0">
              {!isLast && (
                <span
                  className={cn(
                    'absolute start-[7px] top-4 h-[calc(100%-8px)] w-0.5 rounded-full',
                    done && !broken && i < current ? 'bg-[var(--role-accent)]' : 'bg-border'
                  )}
                  aria-hidden
                />
              )}
              <span
                className={cn(
                  'relative z-10 mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full ring-4',
                  done && !broken
                    ? 'bg-[var(--role-accent)] ring-[var(--role-accent-soft)]'
                    : 'bg-muted-foreground/30 ring-background'
                )}
              >
                {isCurrent && <span className="status-dot-pulse absolute inset-0 rounded-full bg-[var(--role-accent)]" />}
              </span>
              <div className="min-w-0">
                <p className={cn('text-xs font-bold leading-tight', done && !broken ? 'text-foreground' : 'text-muted-foreground')}>
                  {stage.label}
                </p>
                {isCurrent && !broken && (
                  <p className="mt-0.5 text-[10px] font-black text-[var(--role-accent-strong)] dark:text-[var(--role-accent-glow)]">
                    المرحلة الحالية
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      {broken && (
        <p className="mt-2 rounded-xl bg-muted/60 px-3 py-2 text-xs font-bold text-muted-foreground">
          {status === 'REJECTED'
            ? 'لم يُعتمد هذا الطلب — لا يمنعك من التقديم على فرص أخرى'
            : status === 'WITHDRAWN'
              ? 'سحبت طلبك من هذه الفرصة'
              : 'اعتذرت عن حضور المقابلة'}
        </p>
      )}
    </div>
  )
}

// ---------------- الجولة 67: حالة خطأ موحدة ----------------

/**
 * حالة فشل جلب البيانات — تُظهر رسالة الخطأ الحقيقية مع زر إعادة المحاولة
 * بدل الانزلاق الصامت إلى حالة «لا توجد بيانات» (سبب وميض المحتوى واختفائه).
 */
export function ForsahErrorState({
  message,
  onRetry,
  compact,
}: {
  message?: string
  onRetry?: () => void
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-3xl border border-amber-200 bg-amber-50/60 text-center dark:border-amber-800 dark:bg-amber-950/20',
        compact ? 'px-4 py-6' : 'px-6 py-12'
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-950/50">
        <TriangleAlert className="size-6 text-amber-600 dark:text-amber-300" />
      </span>
      <p className="text-sm font-black text-amber-800 dark:text-amber-200">
        {message || 'تعذر تحميل البيانات — تحقق من الاتصال وأعد المحاولة'}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-black text-white shadow-sm transition-colors hover:bg-amber-700"
        >
          إعادة المحاولة
        </button>
      )}
    </div>
  )
}
