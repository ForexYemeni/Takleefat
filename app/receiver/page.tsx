'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useQuery } from '@tanstack/react-query'
import { BadgeCheck, CheckCircle2, Inbox, ClipboardList, Users } from 'lucide-react'
import { apiFetcher } from '@/lib/api-client'
import { formatDate, formatCurrency, POST_STATUS_LABELS } from '@/lib/utils'
import { DashboardSkeleton } from '@/components/shared/empty-state'
import { AssignmentAlertCard } from '@/components/shared/assignment-alert-card'
import { StatusBadge } from '@/components/shared/status-badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PromoBanner } from '@/components/shared/promo-banner'
// الجولة 57 — لافتة الحالة الموحدة الأنيقة
import { AccountStatusBanner } from '@/components/shared/verification-checklist'

interface ReceiverStats {
  myAssignments: number
  pendingReceipt: number
  completedAssignments: number
}

interface OverviewAssignment {
  id: string
  title: string
  facility: string
  department: string | null
  startDate: string
  status: string
  nurse: { id: string; name: string; specialty: string | null; phone: string }
}

interface OverviewPost {
  id: string
  title: string
  facility: string
  department: string | null
  status: string
  value: number
  _count: { applications: number }
}

export default function ReceiverOverviewPage() {
  const { data: session } = useSession()
  const { data, isLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: () => apiFetcher<ReceiverStats>('/api/stats'),
  })

  // بطاقة التكليف أعلى الصفحة: تكليف جارٍ (بانتظار الاستلام) أو أحدث تكليف مُعلن
  const { data: assignmentsData } = useQuery({
    queryKey: ['my-assignments'],
    queryFn: () =>
      apiFetcher<{ assignments: OverviewAssignment[] }>('/api/me/assignments'),
  })
  const { data: postsData } = useQuery({
    queryKey: ['my-posts'],
    queryFn: () => apiFetcher<{ posts: OverviewPost[] }>('/api/posts'),
  })

  if (isLoading) return <DashboardSkeleton />

  const assignments = assignmentsData?.assignments ?? []
  const activeAssignment = assignments.find((a) => a.status === 'ACTIVE')
  const latestOpenPost = (postsData?.posts ?? []).find((p) => p.status === 'OPEN')

  const status = session?.user?.status

  const cards = [
    {
      title: 'إجمالي التكليفات الواردة',
      value: data?.myAssignments ?? 0,
      icon: ClipboardList,
      color: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
      accent: 'from-blue-500/60 via-blue-400/20',
    },
    {
      title: 'بانتظار استلامك',
      value: data?.pendingReceipt ?? 0,
      icon: Inbox,
      color: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300',
      accent: 'from-cyan-500/60 via-cyan-400/20',
    },
    {
      title: 'تكليفات مكتملة',
      value: data?.completedAssignments ?? 0,
      icon: CheckCircle2,
      color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
      accent: 'from-emerald-500/60 via-emerald-400/20',
    },
  ]

  return (
    <div className="relative space-y-6">
      {/* هالة خلفية طبية خافتة جداً — زخرفة فقط بلا أي محتوى */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-10 -z-10 h-56 overflow-hidden">
        <div className="absolute -top-24 start-1/4 size-72 rounded-full bg-gradient-to-b from-blue-500/[0.07] to-transparent blur-3xl" />
        <div className="absolute -top-10 end-0 size-56 rounded-full bg-gradient-to-b from-cyan-400/[0.06] to-transparent blur-3xl" />
      </div>

      {/* الجولة 44: بانر العرض بدون رسوم إدارة */}
      <PromoBanner />
      <div>
        <h1 className="text-[1.65rem] font-black leading-tight tracking-tight sm:text-3xl">نظرة عامة</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          ملخص التكليفات الواردة إليك في منصة{' '}
          <span className="whitespace-nowrap">تكليفات | Takleefat</span>
        </p>
      </div>

      {/* بطاقة وجود تكليف — أعلى النظرة العامة */}
      {activeAssignment ? (
        <AssignmentAlertCard
          tone="active"
          eyebrow="تكليف جارٍ الآن"
          title={activeAssignment.title}
          subtitle={`${activeAssignment.facility}${activeAssignment.department ? ` — ${activeAssignment.department}` : ''} • الكادر: ${activeAssignment.nurse.name}`}
          chips={
            <>
              <Badge variant="outline" className="gap-1">
                <ClipboardList className="size-3" />
                البدء: {formatDate(activeAssignment.startDate)}
              </Badge>
              <StatusBadge status={activeAssignment.status} labels={{ ACTIVE: 'بانتظار تأكيد استلامك', RECEIVED: 'تم الاستلام', COMPLETED: 'مكتمل', CANCELLED: 'ملغي' }} />
            </>
          }
          href="/receiver/assignments"
          ctaLabel="تأكيد الاستلام"
        />
      ) : latestOpenPost ? (
        <AssignmentAlertCard
          tone="open"
          eyebrow="أحدث تكليف مُعلن منك"
          title={latestOpenPost.title}
          subtitle={`${latestOpenPost.facility}${latestOpenPost.department ? ` — ${latestOpenPost.department}` : ''}`}
          chips={
            <>
              <StatusBadge status={latestOpenPost.status} labels={POST_STATUS_LABELS} />
              <Badge variant="outline" className="gap-1">
                {formatCurrency(latestOpenPost.value)}
              </Badge>
              <Badge variant="outline" className="gap-1">
                <Users className="size-3" />
                {latestOpenPost._count.applications} تقديم بانتظار المراجعة
              </Badge>
            </>
          }
          href="/receiver/assignments"
          ctaLabel="مراجعة التقديمات"
        />
      ) : (
        <AssignmentAlertCard
          tone="empty"
          eyebrow="التكليفات"
          title="لا توجد تكليفات جارية أو مُعلنة حالياً"
          subtitle="أنشئ تكليفاً جديداً ليصل للكادر التمريضي المؤهل فوراً"
          href="/receiver/assignments"
          ctaLabel="إنشاء تكليف"
        />
      )}

      {/* حالة الحساب — لافتة موحدة أنيقة (الجولة 57) */}
      {status === 'PENDING' && (
        <AccountStatusBanner status="PENDING" featureLabel="إنشاء التكليفات" />
      )}
      {status === 'SUSPENDED' && (
        <AccountStatusBanner
          status="SUSPENDED"
          suspendedDescription="لا يمكنك إنشاء تكليفات حالياً — يرجى التواصل مع إدارة المنصة."
        />
      )}
      {status === 'REJECTED' && <AccountStatusBanner status="REJECTED" />}
      {status === 'APPROVED' && (
        <AccountStatusBanner
          status="APPROVED"
          approvedDescription="يمكنك إنشاء التكليفات ومتابعة التكليفات الواردة إليك وتوثيق استلامها إلكترونياً."
        />
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <Card
            key={card.title}
            className="group relative h-full overflow-hidden border-border/70 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-border hover:shadow-md"
          >
            {/* خيط ضوئي علوي رفيع بلون البطاقة — لمسة طبية فاخرة */}
            <span
              aria-hidden
              className={`absolute inset-x-6 top-0 h-px bg-gradient-to-l ${card.accent} to-transparent opacity-70`}
            />
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold leading-snug text-muted-foreground">
                    {card.title}
                  </p>
                  <p className="mt-2 text-4xl font-black tracking-tight tabular-nums">
                    {card.value}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-2xl p-3 shadow-sm ring-1 ring-black/[0.04] transition-transform duration-300 group-hover:scale-105 dark:ring-white/[0.06] ${card.color}`}
                >
                  <card.icon className="size-5" />
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="relative overflow-hidden border-primary/15 bg-gradient-to-bl from-primary/[0.05] via-card to-card shadow-sm transition-shadow hover:shadow-md">
        <CardContent className="flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center">
          <div>
            <p className="flex items-center gap-2 font-bold">
              <BadgeCheck className="size-5 text-primary" />
              التكليفات بانتظار استلامك
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              راجع التكليفات الجديدة وأكد استلامها إلكترونياً لتوثيق الإجراء.
            </p>
          </div>
          <Button
            asChild
            className="gap-2 shadow-md shadow-primary/25 transition-all hover:shadow-lg hover:shadow-primary/30"
          >
            <Link href="/receiver/assignments">
              <Inbox className="size-4" />
              عرض التكليفات الواردة
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
