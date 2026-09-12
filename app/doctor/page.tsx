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
import { ActiveAssignmentCard, type ActiveAssignmentData } from '@/components/shared/active-assignment-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { PromoBanner } from '@/components/shared/promo-banner'

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
  /** الجولة 46: وقت انتهاء التكليف — للعد التنازلي الحي في نظرة عامة */
  endDate: string | null
  status: string
  value: number | null
  adminFee: number | null
  paymentStatus: string | null
  receiver: { name: string }
}

interface PlatformSettingsLite {
  feeMode: 'APPLICATION' | 'ADMIN'
  applicationFee: number
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
    queryFn: () =>
      apiFetcher<{ assignments: MyAssignment[]; settings?: PlatformSettingsLite }>('/api/me/assignments'),
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
  const suggestedPost = (openPosts.data?.posts ?? []).find((p) => p.status === 'OPEN')

  // الجولة 46 — البلاغ الحرفي: «عندما يكون لدى الكادر التمريضي او الطبيب تكليف
  // يجب ان تظهر بطاقة صغيرة احترافية جدا في اعلى صفحة نظرة عامة مع العد التنازلي»:
  // نختار التكليف الساري: الجاري الآن (بدأ ولم ينتهِ وقته) أولاً، وإلا أقرب
  // تكليف قادم — وتُعرض البطاقة المدمجة بعدّ تنازلي حي أعلى الصفحة.
  const currentAssignment = (() => {
    const live = (assignments.data?.assignments ?? []).filter(
      (a) => a.status === 'ACTIVE' || a.status === 'RECEIVED'
    )
    if (live.length === 0) return null
    const now = Date.now()
    const running = live
      .filter((a) => {
        const s = new Date(a.startDate).getTime()
        const e = a.endDate ? new Date(a.endDate).getTime() : null
        return now >= s && (e == null || now < e)
      })
      .sort((a, b) => {
        const ea = a.endDate ? new Date(a.endDate).getTime() : Infinity
        const eb = b.endDate ? new Date(b.endDate).getTime() : Infinity
        return ea - eb
      })[0]
    if (running) return running
    return [...live].sort(
      (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    )[0]
  })()

  const currentCard: ActiveAssignmentData | null = currentAssignment
    ? {
        id: currentAssignment.id,
        title: currentAssignment.title,
        facility: currentAssignment.facility,
        department: currentAssignment.department,
        startDate: currentAssignment.startDate,
        endDate: currentAssignment.endDate,
        status: currentAssignment.status,
        receiverName: currentAssignment.receiver.name,
      }
    : null

  // الجولة 37: تكليفات معلّقة لم تُسدّد رسوم الإدارة — تنبيه بارز أعلى نظرة عامة
  const feeSettings = assignments.data?.settings
  const feeApplicationFee =
    feeSettings?.feeMode === 'APPLICATION' ? Math.max(0, feeSettings.applicationFee) : 0
  const unpaidAssignments = (assignments.data?.assignments ?? []).filter(
    (a) => a.paymentStatus !== 'PAID' && a.status !== 'CANCELLED'
  )
  const firstUnpaid = unpaidAssignments[0]
  const firstUnpaidDue = (firstUnpaid?.adminFee ?? 0) + feeApplicationFee

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
      {/* الجولة 44: بانر العرض بدون رسوم إدارة */}
      <PromoBanner />
      <div>
        <h1 className="text-2xl font-extrabold">نظرة عامة</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          مرحباً {session?.user?.name} — هذه ملخص حسابك في منصة تكليفات
        </p>
      </div>

      {/* تنبيه سداد الرسوم — أعلى أولوية في نظرة عامة (الجولة 37):
          الضغط عليه يفتح بطاقة السداد مباشرة في تقديماتي (?tab=applications&pay=<id>) */}
      {firstUnpaid && (
        <AssignmentAlertCard
          tone="unpaid"
          eyebrow="لديك تكليف معلق لم تقم بدفع رسوم الإدارة"
          title={firstUnpaid.title}
          subtitle={`${firstUnpaid.facility}${firstUnpaid.department ? ` — ${firstUnpaid.department}` : ''} • الجهة: ${firstUnpaid.receiver.name}`}
          chips={
            <>
              <Badge className="bg-amber-600 text-[11px] text-white hover:bg-amber-600">
                الواجب سداده: {formatCurrency(firstUnpaidDue)}
              </Badge>
              {unpaidAssignments.length > 1 && (
                <Badge variant="outline" className="text-[11px]">
                  + {unpaidAssignments.length - 1} تكليف آخر بانتظار السداد
                </Badge>
              )}
            </>
          }
          href={`/doctor/assignments?tab=applications&pay=${firstUnpaid.id}`}
          ctaLabel="سداد الرسوم الآن"
        />
      )}

      {/* بطاقة التكليف الحالي بعد تنازلي حي — أعلى النظرة العامة (الجولة 46) */}
      {currentCard ? (
        <ActiveAssignmentCard
          assignment={currentCard}
          href="/doctor/assignments"
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
          href="/doctor/assignments"
          ctaLabel="استعرض وتقدّم"
        />
      ) : (
        <AssignmentAlertCard
          tone="empty"
          eyebrow="التكليفات"
          title="لا توجد تكليفات متاحة حالياً"
          subtitle="سيصلك إشعار فور نشر تكليف جديد مطابق لمجالك"
          href="/doctor/assignments"
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
            <Link href="/doctor/assignments">عرض الكل</Link>
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
            <Link href="/doctor/documents">
              <FileUp className="size-4" />
              رفع المستندات
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
