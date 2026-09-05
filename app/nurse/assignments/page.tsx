'use client'

import { useQuery } from '@tanstack/react-query'
import { ClipboardList } from 'lucide-react'
import { apiFetcher } from '@/lib/api-client'
import { formatDate, ASSIGNMENT_STATUS_LABELS } from '@/lib/utils'
import { StatusBadge } from '@/components/shared/status-badge'
import { EmptyState, DashboardSkeleton } from '@/components/shared/empty-state'
import { Card, CardContent } from '@/components/ui/card'

interface MyAssignment {
  id: string
  title: string
  description: string | null
  facility: string
  department: string | null
  startDate: string
  endDate: string | null
  status: string
  receivedAt: string | null
  receiver: { name: string }
}

export default function NurseAssignmentsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-assignments'],
    queryFn: () => apiFetcher<{ assignments: MyAssignment[] }>('/api/me/assignments'),
  })

  if (isLoading) return <DashboardSkeleton />

  const assignments = data?.assignments ?? []

  if (assignments.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-extrabold">تكليفاتي</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            التكليفات الطبية والتمريضية المسندة إليك في منصة تكليفات
          </p>
        </div>
        <EmptyState
          icon={ClipboardList}
          title="لا توجد تكليفات بعد"
          description="سيصلك إشعار فور إسناد تكليف جديد إليك من إدارة المنصة."
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">تكليفاتي</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          جميع التكليفات المسندة إليك مع حالتها الحالية
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {assignments.map((a) => (
          <Card key={a.id}>
            <CardContent className="space-y-3 p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold">{a.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {a.facility}
                    {a.department ? ` — ${a.department}` : ''}
                  </p>
                </div>
                <StatusBadge status={a.status} labels={ASSIGNMENT_STATUS_LABELS} />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-secondary/60 p-2.5">
                  <p className="text-muted-foreground">تاريخ البدء</p>
                  <p className="mt-0.5 font-bold">{formatDate(a.startDate)}</p>
                </div>
                <div className="rounded-lg bg-secondary/60 p-2.5">
                  <p className="text-muted-foreground">تاريخ الانتهاء</p>
                  <p className="mt-0.5 font-bold">{a.endDate ? formatDate(a.endDate) : 'غير محدد'}</p>
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                <p>
                  المستلم الإداري: <span className="font-bold text-foreground">{a.receiver.name}</span>
                </p>
                {a.receivedAt && <p>تم الاستلام من الجهة المستقبِلة ✓</p>}
              </div>

              {a.description && (
                <p className="rounded-lg border border-dashed p-3 text-xs leading-relaxed text-muted-foreground">
                  {a.description}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
