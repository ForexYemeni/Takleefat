'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Inbox, PackageCheck } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetcher, apiPost } from '@/lib/api-client'
import { formatDate, formatDateTime, ASSIGNMENT_STATUS_LABELS } from '@/lib/utils'
import { StatusBadge } from '@/components/shared/status-badge'
import { EmptyState, DashboardSkeleton } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface ReceiverAssignment {
  id: string
  title: string
  description: string | null
  facility: string
  department: string | null
  startDate: string
  endDate: string | null
  status: string
  receivedAt: string | null
  createdAt: string
  nurse: { id: string; name: string; specialty: string | null }
}

export default function ReceiverAssignmentsPage() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['my-assignments'],
    queryFn: () => apiFetcher<{ assignments: ReceiverAssignment[] }>('/api/me/assignments'),
  })

  const receiveMutation = useMutation({
    mutationFn: (id: string) =>
      apiPost<{ message: string }>(`/api/me/assignments/${id}/receive`, {}),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['my-assignments'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (isLoading) return <DashboardSkeleton />

  const assignments = data?.assignments ?? []
  const pending = assignments.filter((a) => a.status === 'ACTIVE')
  const others = assignments.filter((a) => a.status !== 'ACTIVE')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">التكليفات الواردة</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          التكليفات المسندة إلى جهتك — تأكيد الاستلام يوثق العملية إلكترونياً
        </p>
      </div>

      {assignments.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="لا توجد تكليفات واردة"
          description="سيصلك إشعار فور إسناد تكليف جديد إلى جهتك."
        />
      ) : (
        <>
          {pending.length > 0 && (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm font-bold text-amber-700">
                <Inbox className="size-4" />
                بانتظار استلامك ({pending.length})
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                {pending.map((a) => (
                  <Card key={a.id} className="border-amber-200 bg-amber-50/40">
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

                      <div className="flex flex-wrap gap-2 text-xs">
                        <Badge variant="secondary" className="gap-1">
                          الكادر: {a.nurse.name}
                        </Badge>
                        {a.nurse.specialty && <Badge variant="outline">{a.nurse.specialty}</Badge>}
                      </div>

                      <p className="text-xs text-muted-foreground">
                        تاريخ البدء: {formatDate(a.startDate)}
                        {a.endDate ? ` — حتى ${formatDate(a.endDate)}` : ''}
                      </p>

                      {a.description && (
                        <p className="rounded-lg border border-dashed bg-white/60 p-3 text-xs leading-relaxed text-muted-foreground">
                          {a.description}
                        </p>
                      )}

                      <Button
                        className="w-full gap-2"
                        onClick={() => receiveMutation.mutate(a.id)}
                        disabled={receiveMutation.isPending}
                      >
                        <PackageCheck className="size-4" />
                        {receiveMutation.isPending ? 'جارٍ التأكيد...' : 'تأكيد استلام التكليف'}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {others.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-bold">تكليفات سابقة</p>
              <div className="grid gap-4 md:grid-cols-2">
                {others.map((a) => (
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

                      <div className="flex flex-wrap gap-2 text-xs">
                        <Badge variant="secondary" className="gap-1">
                          الكادر: {a.nurse.name}
                        </Badge>
                      </div>

                      <p className="text-xs text-muted-foreground">
                        من {formatDate(a.startDate)}
                        {a.endDate ? ` حتى ${formatDate(a.endDate)}` : ''}
                      </p>
                      {a.receivedAt && (
                        <p className="flex items-center gap-1.5 text-xs text-emerald-700">
                          <CheckCircle2 className="size-3.5" />
                          تم الاستلام بتاريخ {formatDateTime(a.receivedAt)}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
