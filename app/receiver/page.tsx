'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useQuery } from '@tanstack/react-query'
import { BadgeCheck, CheckCircle2, Inbox, ClipboardList, ShieldAlert } from 'lucide-react'
import { apiFetcher } from '@/lib/api-client'
import { DashboardSkeleton } from '@/components/shared/empty-state'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface ReceiverStats {
  myAssignments: number
  pendingReceipt: number
  completedAssignments: number
}

export default function ReceiverOverviewPage() {
  const { data: session } = useSession()
  const { data, isLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: () => apiFetcher<ReceiverStats>('/api/stats'),
  })

  if (isLoading) return <DashboardSkeleton />

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
