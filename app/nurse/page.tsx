'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  BadgeCheck,
  CheckCircle2,
  ClipboardList,
  FileUp,
  Hourglass,
  RotateCcw,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'
import { apiFetcher, apiPost } from '@/lib/api-client'
import { formatDate, formatCurrency, ASSIGNMENT_STATUS_LABELS } from '@/lib/utils'
import { StatusBadge } from '@/components/shared/status-badge'
import { DashboardSkeleton } from '@/components/shared/empty-state'
import { AssignmentAlertCard } from '@/components/shared/assignment-alert-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface NurseStats {
  myAssignments: number
  activeAssignments: number
  completedAssignments: number
  pendingDocuments: number
  approvedDocuments: number
}

interface MyAssignment {
  id: string
  title: string
  facility: string
  department: string | null
  startDate: string
  status: string
  receiver: { name: string }
}

interface OpenPost {
  id: string
  title: string
  facility: string
  department: string | null
  status: string
  value: number
}

export default function NurseOverviewPage() {
  const { data: session } = useSession()
  const [resubmitting, setResubmitting] = useState(false)

  const stats = useQuery({
    queryKey: ['stats'],
    queryFn: () => apiFetcher<NurseStats>('/api/stats'),
  })

  const assignments = useQuery({
    queryKey: ['my-assignments'],
    queryFn: () => apiFetcher<{ assignments: MyAssignment[] }>('/api/me/assignments'),
  })

  // تكليفات مفتوحة قد تناسب الكادر — لبطاقة التكليف أعلى الصفحة
  const openPosts = useQuery({
    queryKey: ['open-posts'],
    queryFn: () => apiFetcher<{ posts: OpenPost[] }>('/api/posts'),
  })

  const resubmit = async () => {
    setResubmitting(true)
    try {
      const res = await apiPost<{ message: string }>('/api/me/documents/resubmit', {})
      toast.success(res.message)
      // إعادة تحديث الجلسة لإظهار الحالة الجديدة
      window.location.reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setResubmitting(false)
    }
  }

  if (stats.isLoading) return <DashboardSkeleton />

  const status = session?.user?.status
  const recentAssignments = (assignments.data?.assignments ?? []).slice(0, 5)
  const activeAssignment = (assignments.data?.assignments ?? []).find((a) => a.status === 'ACTIVE')
  const suggestedPost = (openPosts.data?.posts ?? []).find((p) => p.status === 'OPEN')

  const cards = [
    {
      title: 'إجمالي تكليفاتي',
      value: stats.data?.myAssignments ?? 0,
      icon: ClipboardList,
      color: 'bg-teal-50 text-teal-700',
    },
    {
      title: 'تكليفات جارية',
      value: stats.data?.activeAssignments ?? 0,
      icon: Hourglass,
      color: 'bg-amber-50 text-amber-700',
    },
    {
      title: 'تكليفات مكتملة',
      value: stats.data?.completedAssignments ?? 0,
      icon: CheckCircle2,
      color: 'bg-emerald-50 text-emerald-700',
    },
    {
      title: 'مستندات معتمدة',
      value: stats.data?.approvedDocuments ?? 0,
      icon: BadgeCheck,
      hint: `${stats.data?.pendingDocuments ?? 0} بانتظار المراجعة`,
      color: 'bg-cyan-50 text-cyan-700',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">نظرة عامة</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          مرحباً {session?.user?.name} — هذه ملخص حسابك في منصة تكليفات
        </p>
      </div>

      {/* بطاقة وجود تكليف — أعلى النظرة العامة */}
      {activeAssignment ? (
        <AssignmentAlertCard
          tone="active"
          eyebrow="لديك تكليف جارٍ الآن"
          title={activeAssignment.title}
          subtitle={`${activeAssignment.facility}${activeAssignment.department ? ` — ${activeAssignment.department}` : ''} • الجهة: ${activeAssignment.receiver.name}`}
          chips={
            <>
              <StatusBadge status={activeAssignment.status} labels={ASSIGNMENT_STATUS_LABELS} />
              <span className="text-xs text-muted-foreground">البدء: {formatDate(activeAssignment.startDate)}</span>
            </>
          }
          href="/nurse/assignments"
          ctaLabel="متابعة التكليف"
        />
      ) : suggestedPost ? (
        <AssignmentAlertCard
          tone="open"
          eyebrow="تكليف جديد قد يناسبك"
          title={suggestedPost.title}
          subtitle={`${suggestedPost.facility}${suggestedPost.department ? ` — ${suggestedPost.department}` : ''}`}
          chips={
            <Badge variant="outline" className="gap-1">
              {formatCurrency(suggestedPost.value)}
            </Badge>
          }
          href="/nurse/assignments"
          ctaLabel="استعرض وتقدّم"
        />
      ) : (
        <AssignmentAlertCard
          tone="empty"
          eyebrow="التكليفات"
          title="لا توجد تكليفات متاحة حالياً"
          subtitle="سيصلك إشعار فور نشر تكليف جديد مطابق لمجالك"
          href="/nurse/assignments"
          ctaLabel="تكليفاتي"
        />
      )}

      {/* حالة الحساب */}
      {status === 'PENDING' && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-800">
          <Hourglass className="size-4" />
          <AlertTitle className="font-bold">حسابك قيد المراجعة</AlertTitle>
          <AlertDescription className="leading-relaxed">
            يمكنك تسجيل الدخول ومتابعة حسابك فوراً — لكن لن يكون التقديم على التكليفات متاحاً
            إلا بعد رفع مستنداتك (الهوية وصورة المزاولة) واعتماد حسابك من الإدارة. ارفع
            مستنداتك الآن لتسريع الاعتماد — سيصلك إشعار فور اعتماد الحساب.
          </AlertDescription>
        </Alert>
      )}
      {status === 'REJECTED' && (
        <Alert variant="destructive" className="border-red-200 bg-red-50">
          <AlertCircle className="size-4" />
          <AlertTitle className="font-bold">لم يتم اعتماد حسابك</AlertTitle>
          <AlertDescription className="space-y-3 leading-relaxed">
            {session?.user && (
              <p>
                يرجى تحديث مستنداتك ثم إعادة تقديم الحساب للمراجعة. يمكنك التواصل مع إدارة
                المنصة لمعرفة التفاصيل.
              </p>
            )}
            <Button
              size="sm"
              variant="destructive"
              onClick={resubmit}
              disabled={resubmitting}
              className="gap-2"
            >
              <RotateCcw className="size-4" />
              {resubmitting ? 'جارٍ إعادة التقديم...' : 'إعادة التقديم للمراجعة'}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {status === 'APPROVED' && (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800">
          <BadgeCheck className="size-4" />
          <AlertTitle className="font-bold">حسابك معتمد</AlertTitle>
          <AlertDescription>
            يمكنك استلام التكليفات المسندة إليك ومتابعتها من صفحة «تكليفاتي».
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.title} className="h-full">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
                  <p className="mt-1 text-3xl font-extrabold">{card.value}</p>
                  {card.hint && <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>}
                </div>
                <span className={`rounded-xl p-2.5 ${card.color}`}>
                  <card.icon className="size-5" />
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-lg">أحدث تكليفاتي</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/nurse/assignments">عرض الكل</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {recentAssignments.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              لا توجد تكليفات مسندة إليك بعد — سيصلك إشعار فور إسناد تكليف جديد.
            </p>
          ) : (
            recentAssignments.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl border p-3">
                <div>
                  <p className="text-sm font-bold">{a.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.facility} {a.department ? `— ${a.department}` : ''} • من {formatDate(a.startDate)}
                  </p>
                </div>
                <StatusBadge status={a.status} labels={ASSIGNMENT_STATUS_LABELS} />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="bg-secondary/50">
        <CardContent className="flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center">
          <div>
            <p className="font-bold">أكمل ملفك المهني</p>
            <p className="mt-1 text-sm text-muted-foreground">
              ارفع البطاقة الشخصية وصورة المزاولة وشهادات الخبرة لاعتماد حسابك بشكل أسرع.
            </p>
          </div>
          <Button asChild className="gap-2">
            <Link href="/nurse/documents">
              <FileUp className="size-4" />
              رفع المستندات
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
