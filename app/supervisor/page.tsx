'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useQuery } from '@tanstack/react-query'
import { BadgeCheck, CheckCircle2, Inbox, ClipboardList, ShieldAlert, Users } from 'lucide-react'
import { apiFetcher } from '@/lib/api-client'
import { formatDate, formatCurrency, POST_STATUS_LABELS } from '@/lib/utils'
import { DashboardSkeleton } from '@/components/shared/empty-state'
import { AssignmentAlertCard } from '@/components/shared/assignment-alert-card'
import { StatusBadge } from '@/components/shared/status-badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

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
      color: 'bg-teal-50 text-teal-700',
    },
    {
      title: 'بانتظار استلامك',
      value: data?.pendingReceipt ?? 0,
      icon: Inbox,
      color: 'bg-amber-50 text-amber-700',
    },
    {
      title: 'تكليفات مكتملة',
      value: data?.completedAssignments ?? 0,
      icon: CheckCircle2,
      color: 'bg-emerald-50 text-emerald-700',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">نظرة عامة</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ملخص التكليفات الواردة إليك في منصة تكليفات | Takleefat
        </p>
      </div>

      {/* بطاقة وجود تكليف — أعلى النظرة العامة */}
      {activeAssignment ? (
        <AssignmentAlertCard
          tone="active"
          eyebrow="تكليف جارٍ الآن"
          title={activeAssignment.title}
          subtitle={`${activeAssignment.facility}${activeAssignment.department ? ` — ${activeAssignment.department}` : ''} • الطبيب: ${activeAssignment.nurse.name}`}
          chips={
            <>
              <Badge variant="outline" className="gap-1">
                <ClipboardList className="size-3" />
                البدء: {formatDate(activeAssignment.startDate)}
              </Badge>
              <StatusBadge status={activeAssignment.status} labels={{ ACTIVE: 'بانتظار تأكيد استلامك', RECEIVED: 'تم الاستلام', COMPLETED: 'مكتمل', CANCELLED: 'ملغي' }} />
            </>
          }
          href="/supervisor/assignments"
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
          href="/supervisor/assignments"
          ctaLabel="مراجعة التقديمات"
        />
      ) : (
        <AssignmentAlertCard
          tone="empty"
          eyebrow="التكليفات"
          title="لا توجد تكليفات جارية أو مُعلنة حالياً"
          subtitle="أنشئ تكليفاً جديداً ليصل للطبيب التمريضي المؤهل فوراً"
          href="/supervisor/assignments"
          ctaLabel="إنشاء تكليف"
        />
      )}

      {/* حالة الحساب */}
      {status === 'PENDING' && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-800">
          <ShieldAlert className="size-4" />
          <AlertTitle className="font-bold">حسابك بانتظار اعتماد الإدارة</AlertTitle>
          <AlertDescription className="leading-relaxed">
            يمكنك تسجيل الدخول ومتابعة حسابك فوراً — لكن إنشاء التكليفات غير متاح إلا بعد
            اعتماد حسابك من إدارة المنصة. سيصلك إشعار فور الاعتماد.
          </AlertDescription>
        </Alert>
      )}
      {status === 'SUSPENDED' && (
        <Alert variant="destructive" className="border-red-200 bg-red-50">
          <ShieldAlert className="size-4" />
          <AlertTitle className="font-bold">تم إيقاف حسابك مؤقتاً</AlertTitle>
          <AlertDescription>
            لا يمكنك إنشاء تكليفات حالياً — يرجى التواصل مع إدارة المنصة.
          </AlertDescription>
        </Alert>
      )}
      {status === 'APPROVED' && (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800">
          <BadgeCheck className="size-4" />
          <AlertTitle className="font-bold">حسابك معتمد</AlertTitle>
          <AlertDescription>
            يمكنك إنشاء التكليفات ومتابعة التكليفات الواردة إليك وتوثيق استلامها إلكترونياً.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.title} className="h-full">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
                  <p className="mt-1 text-3xl font-extrabold">{card.value}</p>
                </div>
                <span className={`rounded-xl p-2.5 ${card.color}`}>
                  <card.icon className="size-5" />
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-secondary/50">
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
          <Button asChild className="gap-2">
            <Link href="/supervisor/assignments">
              <Inbox className="size-4" />
              عرض التكليفات الواردة
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
