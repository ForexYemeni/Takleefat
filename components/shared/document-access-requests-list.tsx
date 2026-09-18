'use client'

import { useQuery } from '@tanstack/react-query'
import { KeyRound, Loader2 } from 'lucide-react'
import { apiFetcher } from '@/lib/api-client'
import { ROLE_LABELS, formatDate, formatDateTime } from '@/lib/utils'
import { EmptyState } from '@/components/shared/empty-state'
import { AccessRequestStatusBadge, formatAccessTime } from '@/components/shared/document-access-panel'
import { cn } from '@/lib/utils'

/**
 * قائمة طلبات رؤية المستندات للطالب (المستلم الإداري/مشرف الأطباء)
 * — الجولة 61 | تكليفات | Takleefat
 * ---------------------------------------------------------------
 * تعرض طلبات هذا الحساب هو فقط: الكادر المطلوب، السبب، الحالة،
 * وملاحظة الإدارة ووقت القرار — شفافية كاملة بلا أي بيانات غيره.
 */

interface AccessRequestRow {
  id: string
  reason: string
  status: string
  reviewNote: string | null
  createdAt: string
  reviewedAt: string | null
  requester: { id: string; name: string; role: string }
  target: { id: string; name: string; role: string; specialty: string | null; status: string }
  reviewer: { name: string } | null
}

export function DocumentAccessRequestsList() {
  const { data, isLoading } = useQuery({
    queryKey: ['document-access'],
    queryFn: () => apiFetcher<{ requests: AccessRequestRow[] }>('/api/document-access'),
  })

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
        <Loader2 className="size-7 animate-spin text-primary" />
        <p className="text-sm font-bold">جارٍ تحميل طلباتك...</p>
      </div>
    )
  }

  const requests = data?.requests ?? []

  if (requests.length === 0) {
    return (
      <EmptyState
        icon={KeyRound}
        title="لا توجد طلبات بعد"
        description="عندما تحتاج رؤية مستندات كادر أو طبيب، افتح سيرته الذاتية واضغط «طلب رؤية المستندات من الإدارة» — سيظهر طلبك وحالته هنا."
      />
    )
  }

  return (
    <div className="space-y-3">
      {requests.map((r) => (
        <div key={r.id} className="rounded-2xl border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            {/* الكادر المطلوب */}
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-sm font-black">
                {r.target.name}
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-secondary-foreground">
                  {ROLE_LABELS[r.target.role] ?? r.target.role}
                </span>
                {r.target.specialty && (
                  <span className="text-[11px] font-normal text-muted-foreground">
                    {r.target.specialty}
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                طُلب بتاريخ {formatDate(r.createdAt)}
              </p>
            </div>
            <AccessRequestStatusBadge status={r.status} />
          </div>

          {/* سبب الطلب */}
          <div className="mt-3 rounded-xl border border-dashed bg-secondary/30 px-3.5 py-2.5">
            <p className="text-[10px] font-bold text-muted-foreground">سبب الطلب المُرسل للإدارة</p>
            <p className="mt-1 text-xs leading-relaxed">«{r.reason}»</p>
          </div>

          {/* قرار الإدارة */}
          {r.status !== 'PENDING' && (
            <div
              className={cn(
                'mt-2.5 rounded-xl px-3.5 py-2.5 text-[11px] leading-relaxed',
                r.status === 'APPROVED'
                  ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                  : r.status === 'REJECTED'
                    ? 'bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300'
                    : 'bg-secondary/50 text-muted-foreground'
              )}
            >
              <p className="font-extrabold">
                قرار الإدارة: {r.status === 'APPROVED' ? 'تم منح الرؤية' : r.status === 'REJECTED' ? 'مرفوض' : 'تم سحب الصلاحية'}
                {r.reviewer?.name ? ` — ${r.reviewer.name}` : ''}
              </p>
              <p className="mt-0.5">وقت القرار: {formatAccessTime(r.reviewedAt)}</p>
              {r.reviewNote && <p className="mt-1">ملاحظة الإدارة: {r.reviewNote}</p>}
              {r.status === 'APPROVED' && (
                <p className="mt-1 font-bold">
                  يمكنك عرض مستندات هذا الكادر الآن من سيرته الذاتية — الصلاحية قائمة حتى تسحبها الإدارة.
                </p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
