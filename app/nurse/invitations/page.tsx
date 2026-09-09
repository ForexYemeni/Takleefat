'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, CalendarDays, CheckCircle2, Clock, Coins, MailPlus, MapPin, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetcher, apiPatch } from '@/lib/api-client'
import { formatCurrency, formatDateTime, POST_GENDER_LABELS } from '@/lib/utils'
import { INVITATION_STATUS_LABELS } from '@/lib/network'
import { StatusBadge } from '@/components/shared/status-badge'
import { EmptyState, DashboardSkeleton } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

/**
 * الاستدعاءات المباشرة للكادر | Nurse Invitations
 * كل استدعاء يعرض: الجهة + القسم + المدة (ساعات) + تاريخ البدء + السعر + التفاصيل
 * + زر قبول (يُنشئ تقديماً) + زر رفض.
 */

interface Invitation {
  id: string
  status: string
  message: string | null
  respondedAt: string | null
  expiresAt: string | null
  createdAt: string
  post: {
    id: string
    number: number
    title: string
    facility: string
    department: string | null
    location: string | null
    startDate: string
    hours: number | null
    gender: string
    value: number
    status: string
    description: string | null
    receiver: { id: string; name: string }
  }
}

export default function NurseInvitationsPage() {
  const queryClient = useQueryClient()
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: 'ACCEPT' | 'DECLINE'; title: string } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['my-invitations'],
    queryFn: () => apiFetcher<{ invitations: Invitation[]; pending: number }>('/api/me/invitations'),
  })

  const respondMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'ACCEPT' | 'DECLINE' }) =>
      apiPatch<{ message: string }>(`/api/me/invitations/${id}`, { action }),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['my-invitations'] })
      queryClient.invalidateQueries({ queryKey: ['posts'] })
      setConfirmAction(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (isLoading) return <DashboardSkeleton />

  const invitations = data?.invitations ?? []

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold">
          <MailPlus className="size-6 text-primary" />
          الاستدعاءات المباشرة
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          استدعاءات الجهات الصحية لك حصراً — راجع التفاصيل وأجب بالقبول أو الرفض (القبول يُرسل تقديمك للجهة)
          {data?.pending ? ` — لديك ${data.pending} بانتظار الرد` : ''}
        </p>
      </div>

      {invitations.length === 0 ? (
        <EmptyState
          icon={MailPlus}
          title="لا توجد استدعاءات"
          description="عندما تستدعيك جهة صحية لتكليف محدد سيصل الاستدعاء هنا مع كل التفاصيل"
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {invitations.map((inv) => (
            <div key={inv.id} className="rounded-2xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-extrabold">
                    <Building2 className="size-4 text-primary" />
                    {inv.post.facility}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {inv.post.title} — من {inv.post.receiver.name}
                  </p>
                </div>
                <StatusBadge status={inv.status} labels={INVITATION_STATUS_LABELS} />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <InfoChip icon={MapPin} label="القسم" value={inv.post.department ?? '—'} />
                <InfoChip icon={Clock} label="المدة" value={inv.post.hours ? `${inv.post.hours} ساعة` : 'غير محددة'} />
                <InfoChip icon={CalendarDays} label="تاريخ البدء" value={new Date(inv.post.startDate).toLocaleDateString('ar')} />
                <InfoChip icon={Coins} label="القيمة" value={formatCurrency(inv.post.value)} />
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant="outline">{POST_GENDER_LABELS[inv.post.gender] ?? inv.post.gender}</Badge>
                {inv.post.status !== 'OPEN' && <Badge variant="secondary">التكليف {inv.post.status === 'OPEN' ? '' : 'مغلق'}</Badge>}
                <span className="text-[11px] text-muted-foreground">أُرسل: {formatDateTime(inv.createdAt)}</span>
              </div>

              {inv.post.description && (
                <p className="mt-2 rounded-xl bg-secondary/60 p-2.5 text-xs leading-relaxed">{inv.post.description}</p>
              )}
              {inv.message && (
                <p className="mt-2 rounded-xl border-s-4 border-primary/50 bg-primary/5 p-2.5 text-xs font-medium">
                  رسالة الجهة: {inv.message}
                </p>
              )}

              {inv.status === 'PENDING' && inv.post.status === 'OPEN' && (
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => setConfirmAction({ id: inv.id, action: 'ACCEPT', title: inv.post.title })}
                  >
                    <CheckCircle2 className="size-4" />
                    قبول وإرسال التقديم
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-1.5 text-red-600 hover:text-red-600"
                    onClick={() => setConfirmAction({ id: inv.id, action: 'DECLINE', title: inv.post.title })}
                  >
                    <XCircle className="size-4" />
                    رفض
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmAction}
        onOpenChange={(v) => !v && setConfirmAction(null)}
        tone={confirmAction?.action === 'ACCEPT' ? 'success' : 'warning'}
        title={confirmAction?.action === 'ACCEPT' ? 'قبول الاستدعاء' : 'رفض الاستدعاء'}
        description={
          confirmAction?.action === 'ACCEPT'
            ? `سيتم إرسال تقديمك للتكليف (${confirmAction?.title}) لاعتماده من الجهة المستدعِية — بشروط التقديم نفسها (مستندات + رسوم مسددة)`
            : `سيتم إبلاغ الجهة برفضك للتكليف (${confirmAction?.title}) ويمكنها استدعاء كادر آخر`
        }
        confirmLabel={confirmAction?.action === 'ACCEPT' ? 'نعم، أقبل وأرسل تقديمي' : 'نعم، أرفض الاستدعاء'}
        processing={respondMutation.isPending}
        onConfirm={() => confirmAction && respondMutation.mutate({ id: confirmAction.id, action: confirmAction.action })}
      />
    </div>
  )
}

function InfoChip({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-secondary/50 px-2.5 py-1.5">
      <Icon className="size-3.5 shrink-0 text-primary" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="truncate font-bold">{value}</span>
    </div>
  )
}
