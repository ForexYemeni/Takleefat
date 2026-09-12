'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Check, Hourglass, Link2, X } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetcher, apiPatch } from '@/lib/api-client'
import { formatDate } from '@/lib/utils'
import { ORG_TYPE_LABELS } from '@/lib/network'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'

/**
 * طلبات ربط الجهات الصحية بمسؤوليها — الجولة 44
 * =====================================================
 * «يمكنه اضافه جهه صحية اخرى بشرط الموافقة عليها من حساب الادارة»:
 * يعرض للادارة كل طلبات الربط المعلقة (مستلم إداري / مشرف أطباء يطلب إدارة
 * جهة إضافية) بقرار اعتماد أو رفض — الاعتماد يجعل الجهة فعّالة في حساب
 * المسؤول فوراً (كوادر جهتي + مجتمع الكوادر + نشر تكليفات لها).
 */

interface OrgLinkRequest {
  id: string
  status: string
  note: string | null
  createdAt: string
  receiver: { id: string; name: string; phone: string; role: string; hospitalName: string | null }
  hospital: { id: string; name: string; type: string; city: string | null; status: string }
}

export function ReceiverOrgRequests() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['admin-receiver-orgs'],
    queryFn: () => apiFetcher<{ links: OrgLinkRequest[]; pendingCount: number }>('/api/admin/receiver-orgs'),
  })

  const decisionMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'ACTIVE' | 'REJECTED' }) =>
      apiPatch<{ message: string }>(`/api/admin/receiver-orgs/${id}`, { status }),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['admin-receiver-orgs'] })
      queryClient.invalidateQueries({ queryKey: ['admin-orgs'] })
      queryClient.invalidateQueries({ queryKey: ['my-orgs'] })
      setRejectTarget(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const [rejectTarget, setRejectTarget] = useState<OrgLinkRequest | null>(null)

  const pending = (data?.links ?? []).filter((l) => l.status === 'PENDING')
  const recent = (data?.links ?? []).filter((l) => l.status !== 'PENDING').slice(0, 5)

  if (isLoading) {
    return (
      <div className="rounded-2xl border bg-card p-4">
        <p className="text-center text-xs text-muted-foreground">جارٍ تحميل طلبات الربط...</p>
      </div>
    )
  }

  if (pending.length === 0 && recent.length === 0) return null

  return (
    <div className="rounded-2xl border bg-card shadow-sm">
      {/* الرأس */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-gradient-to-l from-violet-600/10 via-violet-500/5 to-transparent px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-violet-500/10 p-1.5 text-violet-700 dark:text-violet-300">
            <Link2 className="size-4" />
          </span>
          <div>
            <p className="text-sm font-extrabold">طلبات ربط جهات بمسؤوليها</p>
            <p className="text-[11px] text-muted-foreground">
              مستلمون إداريون ومشرفو أطباء يطلبون إدارة جهة صحية إضافية
            </p>
          </div>
        </div>
        {pending.length > 0 && (
          <Badge className="gap-1 bg-amber-500 text-white">
            <Hourglass className="size-3" />
            {pending.length} معلقة
          </Badge>
        )}
      </div>

      <div className="grid gap-2 p-4">
        {/* المعلقة — قرار أول */}
        {pending.map((l) => (
          <div
            key={l.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/50 px-3.5 py-3 dark:border-amber-900 dark:bg-amber-950/20"
          >
            <span className="shrink-0 rounded-lg bg-amber-500/10 p-2 text-amber-700 dark:text-amber-300">
              <Building2 className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5 text-sm font-extrabold">
                {l.receiver.name}
                <span className="text-xs font-bold text-muted-foreground">
                  ({l.receiver.role === 'DOCTOR_SUPERVISOR' ? 'مشرف أطباء' : 'مستلم إداري'})
                </span>
                <span className="text-xs text-muted-foreground">يطلب ربط:</span>
                <span className="text-primary">{l.hospital.name}</span>
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                <span>
                  جهته الأساسية: {l.receiver.hospitalName ?? '—'} • طُلب {formatDate(l.createdAt)}
                </span>
                {l.hospital.city && <span>• {l.hospital.city}</span>}
                {l.hospital.status !== 'ACTIVE' && (
                  <Badge variant="outline" className="text-[9px]">
                    الجهة نفسها {l.hospital.status === 'PENDING' ? 'بانتظار اعتمادها' : 'غير نشطة'}
                  </Badge>
                )}
                {l.note && <span className="font-bold">«{l.note}»</span>}
              </p>
            </div>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                className="h-8 gap-1 bg-emerald-600 text-[11px] hover:bg-emerald-700"
                disabled={decisionMutation.isPending}
                onClick={() => decisionMutation.mutate({ id: l.id, status: 'ACTIVE' })}
              >
                <Check className="size-3.5" />
                اعتماد الربط
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1 text-[11px] text-red-600 hover:text-red-700"
                disabled={decisionMutation.isPending}
                onClick={() => setRejectTarget(l)}
              >
                <X className="size-3.5" />
                رفض
              </Button>
            </div>
          </div>
        ))}

        {/* القرارات الأخيرة */}
        {recent.length > 0 && (
          <div className="mt-1 space-y-1.5">
            <p className="text-[11px] font-bold text-muted-foreground">آخر القرارات:</p>
            {recent.map((l) => (
              <p
                key={l.id}
                className="flex flex-wrap items-center gap-1.5 rounded-lg bg-secondary/50 px-3 py-1.5 text-[11px] text-muted-foreground"
              >
                <Check className="size-3 text-muted-foreground" />
                <span className="font-bold">{l.receiver.name}</span>
                {l.status === 'ACTIVE' ? 'أُعتمد ربطه بجهة' : 'رُفض ربطه بجهة'}{' '}
                <span className="font-bold text-foreground">{l.hospital.name}</span> — {formatDate(l.createdAt)}
              </p>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!rejectTarget}
        onOpenChange={(v) => !v && setRejectTarget(null)}
        title="رفض طلب ربط الجهة"
        description={`سيُرفض طلب ${rejectTarget?.receiver.name ?? ''} لربط جهة (${rejectTarget?.hospital.name ?? ''}) ويصلهم إشعار بالرفض.`}
        confirmLabel="تأكيد الرفض"
        onConfirm={() => rejectTarget && decisionMutation.mutate({ id: rejectTarget.id, status: 'REJECTED' })}
        processing={decisionMutation.isPending}
      />
    </div>
  )
}
