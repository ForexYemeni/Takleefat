'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Briefcase,
  CalendarClock,
  ClipboardCheck,
  Coins,
  Eye,
  FileBarChart,
  Inbox,
  Send,
  Sparkles,
  UserCheck,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react'
import { apiFetcher } from '@/lib/api-client'
import { formatCurrency } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { ForsahErrorState } from '@/components/forsah/opportunity-visuals'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * لوحة الموارد البشرية الرئيسية — الجولة 66 | ميزة «فرصة» (المواصفة 4)
 * الإحصائيات العشر + Quick Actions الخمسة — هوية Premium بهوية فرصة البنفسجية
 * فوق نظام تكليفات، Mobile First وبلا أي وظائف خارج النطاق.
 */

interface ForsahStats {
  totalOpportunities: number
  published: number
  active: number
  paused: number
  closed: number
  totalApplications: number
  pendingApplications: number
  interviewInvited: number
  upcomingInterviews: number
  todayInterviews: number
  selections: number
  totalFees: number
  hrCommission: number
  adminAmount: number
}

export function HrDashboard() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['forsah-dashboard'],
    queryFn: () => apiFetcher<{ stats: ForsahStats }>('/api/forsah/dashboard'),
    staleTime: 15_000,
    retry: 1,
  })

  const stats = data?.stats

  const statCards: { label: string; value: string; icon: React.ComponentType<{ className?: string }>; tone: string }[] = [
    { label: 'إجمالي الفرص', value: String(stats?.totalOpportunities ?? 0), icon: Briefcase, tone: 'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300' },
    { label: 'فرص منشورة', value: String(stats?.published ?? 0), icon: Send, tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' },
    { label: 'فرص نشطة', value: String(stats?.active ?? 0), icon: Sparkles, tone: 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300' },
    { label: 'فرص مغلقة', value: String(stats?.closed ?? 0), icon: XCircle, tone: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' },
    { label: 'إجمالي المتقدمين', value: String(stats?.totalApplications ?? 0), icon: Users, tone: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300' },
    { label: 'بانتظار المراجعة', value: String(stats?.pendingApplications ?? 0), icon: Inbox, tone: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' },
    { label: 'مرشحون للمقابلات', value: String(stats?.interviewInvited ?? 0), icon: CalendarClock, tone: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300' },
    { label: 'مقابلات قادمة', value: String(stats?.upcomingInterviews ?? 0), icon: CalendarClock, tone: 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300' },
    { label: 'موظفون مختارون', value: String(stats?.selections ?? 0), icon: UserCheck, tone: 'bg-emerald-600/10 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' },
    { label: 'مستحقات HR', value: formatCurrency(stats?.hrCommission ?? 0), icon: Wallet, tone: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' },
  ]

  const quickActions = [
    { label: 'نشر فرصة', icon: Send, href: '/hr/opportunities?new=1', primary: true },
    { label: 'المتقدمون', icon: Users, href: '/hr/applicants' },
    { label: 'المقابلات', icon: CalendarClock, href: '/hr/interviews' },
    { label: 'الموظفون المختارون', icon: UserCheck, href: '/hr/financials?tab=selections' },
    { label: 'التقارير المالية', icon: FileBarChart, href: '/hr/financials' },
  ]

  return (
    <div className="space-y-6">
      {/* الترويسة الفاخرة */}
      <header className="relative overflow-hidden rounded-3xl border bg-gradient-to-bl from-[#1e1b4b] via-[#3b0764] to-[#4c1d95] p-6 text-white shadow-lg md:p-8">
        <div className="pointer-events-none absolute -end-20 -top-20 size-56 rounded-full bg-violet-500/25 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -start-12 -bottom-10 size-44 rounded-full bg-sky-400/20 blur-3xl" aria-hidden />
        <div className="relative">
          <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-violet-200">
            <Sparkles className="size-3.5" />
            تكليفات — قسم فرصة
          </p>
          <h1 className="mt-1 text-2xl font-black md:text-3xl">لوحة الموارد البشرية</h1>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-violet-100/90">
            إدارة كاملة لدورة فرص العمل الصحية: النشر للمؤهلين، مراجعة المتقدمين، المقابلات،
            الاختيار، والعمولات — كل شيء في مكان واحد
          </p>
          <div className="mt-4 flex items-center gap-2 text-xs font-black">
            <span className="rounded-full bg-white/10 px-3 py-1.5 backdrop-blur">
              إجمالي الرسوم: {formatCurrency(stats?.totalFees ?? 0)}
            </span>
            <span className="rounded-full bg-emerald-400/20 px-3 py-1.5 text-emerald-100 backdrop-blur">
              مستحقاتك: {formatCurrency(stats?.hrCommission ?? 0)}
            </span>
          </div>
        </div>
      </header>

      {/* Quick Actions */}
      <nav aria-label="الإجراءات السريعة" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {quickActions.map((a) => (
          <Link
            key={a.label}
            href={a.href}
            className={cn(
              'group flex items-center gap-2.5 rounded-2xl border p-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md',
              a.primary
                ? 'bg-gradient-to-l from-violet-600 to-violet-500 text-white border-transparent'
                : 'bg-card'
            )}
          >
            <span
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-xl',
                a.primary ? 'bg-white/15 text-white' : 'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300'
              )}
            >
              <a.icon className="size-4.5" />
            </span>
            <span className={cn('min-w-0 truncate text-xs font-black', !a.primary && 'text-foreground')}>{a.label}</span>
          </Link>
        ))}
      </nav>

      {/* الإحصائيات */}
      <section aria-label="إحصائيات الفرص">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-black text-muted-foreground">نظرة عامة بالأرقام</h2>
          {stats?.todayInterviews ? (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-black text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
              مقابلة واحدة اليوم على الأقل {stats.todayInterviews > 1 ? `(${stats.todayInterviews})` : ''}
            </span>
          ) : null}
        </div>
        {isError ? (
          // الجولة 67: رسالة حقيقية (مثل إغلاق النظام من الإدارة) بدل أرقام صفرية مضللة
          <ForsahErrorState message={(error as Error | null)?.message} onRetry={() => refetch()} />
        ) : isLoading ? (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {statCards.map((c) => (
              <div key={c.label} className="relative overflow-hidden rounded-2xl border bg-card p-4 shadow-sm">
                <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-l from-violet-500/60 via-transparent to-transparent" aria-hidden />
                <div className="flex items-center justify-between">
                  <span className={cn('flex size-8 items-center justify-center rounded-xl', c.tone)}>
                    <c.icon className="size-4" />
                  </span>
                </div>
                <p className="mt-2.5 text-xl font-black tabular-nums">{c.value}</p>
                <p className="mt-0.5 text-[11px] font-bold text-muted-foreground">{c.label}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
