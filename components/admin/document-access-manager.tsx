'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BadgeCheck,
  Clock,
  KeyRound,
  Loader2,
  MessageSquareText,
  ShieldCheck,
  Stethoscope,
  Undo2,
  UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { apiFetcher, apiPatch } from '@/lib/api-client'
import { ROLE_LABELS, cn, formatDate, formatDateTime } from '@/lib/utils'
import { EmptyState } from '@/components/shared/empty-state'
import { AccessRequestStatusBadge } from '@/components/shared/document-access-panel'

/**
 * مدير طلبات رؤية المستندات — حساب الإدارة | الجولة 61
 * =====================================================
 * طابور القرار: كل طلب يعرض الطالب والكادر المطلوب وسبب الطلب —
 * قبول (منح الرؤية) أو رفض بملاحظة اختيارية.
 * سجل القرارات: المنح القائمة (بزر سحب فوري) والمرفوضة والمسحوبة.
 * كل قرار يُشعِر الطالب وصاحب المستندات فوراً (شفافية كاملة).
 */

interface AdminAccessRequest {
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

export function DocumentAccessManager() {
  const queryClient = useQueryClient()
  const [acting, setActing] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [decisionNote, setDecisionNote] = useState('')
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-document-access'],
    queryFn: () => apiFetcher<{ requests: AdminAccessRequest[] }>('/api/document-access'),
  })

  const decide = async (id: string, action: 'APPROVE' | 'REJECT' | 'REVOKE', note?: string) => {
    setActing(id)
    try {
      const res = await apiPatch<{ message: string }>(`/api/document-access/${id}`, {
        action,
        ...(note?.trim() ? { note: note.trim() } : {}),
      })
      toast.success(res.message)
      setRejectingId(null)
      setRevokingId(null)
      setDecisionNote('')
      await queryClient.invalidateQueries({ queryKey: ['admin-document-access'] })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setActing(null)
    }
  }

  const requests = data?.requests ?? []
  const pending = requests.filter((r) => r.status === 'PENDING')
  const decided = requests.filter((r) => r.status !== 'PENDING')

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
        <Loader2 className="size-7 animate-spin text-primary" />
        <p className="text-sm font-bold">جارٍ تحميل الطلبات...</p>
      </div>
    )
  }

  return (
    <Tabs defaultValue="pending" className="space-y-4">
      <TabsList className="grid w-full max-w-md grid-cols-2">
        <TabsTrigger value="pending" className="gap-1.5">
          قيد المراجعة
          {pending.length > 0 && (
            <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-black text-white">
              {pending.length}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="history">سجل القرارات ({decided.length})</TabsTrigger>
      </TabsList>

      {/* ============ طابور القرار ============ */}
      <TabsContent value="pending" className="space-y-3">
        {pending.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="لا توجد طلبات بانتظار قرارك"
            description="عندما يطلب مستلم إداري أو مشرف أطباء رؤية مستندات كادر سيظهر طلبه هنا مع السبب لاتخاذ القرار."
          />
        ) : (
          pending.map((r) => (
            <div key={r.id} className="rounded-2xl border border-amber-200 bg-card p-4 dark:border-amber-900">
              <RequestHeader request={r} />

              {/* سبب الطلب — جوهر القرار */}
              <div className="mt-3 rounded-xl border border-primary/25 bg-primary/5 px-3.5 py-3">
                <p className="flex items-center gap-1.5 text-[11px] font-extrabold text-primary">
                  <MessageSquareText className="size-3.5" />
                  سبب الطلب
                </p>
                <p className="mt-1 text-sm leading-relaxed">«{r.reason}»</p>
              </div>

              {/* الإجراءات */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
                  disabled={acting === r.id}
                  onClick={() => decide(r.id, 'APPROVE')}
                >
                  {acting === r.id ? <Loader2 className="size-4 animate-spin" /> : <BadgeCheck className="size-4" />}
                  قبول ومنح الرؤية
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-red-600 hover:text-red-700"
                  disabled={acting === r.id}
                  onClick={() => {
                    setRejectingId(r.id)
                    setDecisionNote('')
                  }}
                >
                  رفض الطلب
                </Button>
              </div>

              {/* صندوق سبب الرفض */}
              {rejectingId === r.id && (
                <div className="mt-3 space-y-2 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
                  <Label htmlFor={`reject-note-${r.id}`} className="text-xs font-bold">
                    سبب الرفض (اختياري — يصل للطالب في الإشعار)
                  </Label>
                  <Textarea
                    id={`reject-note-${r.id}`}
                    rows={2}
                    placeholder="مثال: يكفي شارات التحقق المعروضة — المستندات تُفتح عند الحاجة الفعلية الموثقة فقط"
                    value={decisionNote}
                    onChange={(e) => setDecisionNote(e.target.value)}
                    maxLength={500}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={acting === r.id}
                      onClick={() => decide(r.id, 'REJECT', decisionNote)}
                    >
                      {acting === r.id ? <Loader2 className="size-4 animate-spin" /> : null}
                      تأكيد الرفض
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setRejectingId(null)}>
                      تراجع
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </TabsContent>

      {/* ============ سجل القرارات ============ */}
      <TabsContent value="history" className="space-y-3">
        {decided.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="لا توجد قرارات بعد"
            description="ستظهر هنا كل الطلبات التي اتخذتَ فيها قراراً — المنح القائمة والمرفوضة والمسحوبة."
          />
        ) : (
          decided.map((r) => (
            <div
              key={r.id}
              className={cn(
                'rounded-2xl border bg-card p-4',
                r.status === 'APPROVED' && 'border-emerald-200 dark:border-emerald-900'
              )}
            >
              <RequestHeader request={r} showDecision />

              {/* السحب من المنح القائمة */}
              {r.status === 'APPROVED' && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3.5 py-2.5 dark:bg-emerald-950/30">
                  <p className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                    <ShieldCheck className="size-3.5" />
                    الصلاحية قائمة — يمكنك سحبها في أي وقت وسيسري فوراً
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-red-600 hover:text-red-700"
                    onClick={() => {
                      setRevokingId(r.id)
                      setDecisionNote('')
                    }}
                  >
                    <Undo2 className="size-3.5" />
                    سحب الصلاحية
                  </Button>
                </div>
              )}

              {r.reviewNote && (
                <p className="mt-2 rounded-lg bg-secondary/50 px-3 py-2 text-[11px] text-muted-foreground">
                  ملاحظة الإدارة: {r.reviewNote}
                </p>
              )}
            </div>
          ))
        )}
      </TabsContent>

      {/* تأكيد السحب */}
      <AlertDialog open={!!revokingId} onOpenChange={(v) => !v && setRevokingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>سحب صلاحية رؤية المستندات؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيسري السحب فوراً — يفقد الطالب إمكانية رؤية مستندات هذا الكادر لحظياً،
              ويصل إشعار للطرفين بالقرار. يمكن للطالب تقديم طلب جديد لاحقاً.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="revoke-note" className="text-xs font-bold">
              سبب السحب (اختياري — يصل للطرفين)
            </Label>
            <Textarea
              id="revoke-note"
              rows={2}
              value={decisionNote}
              onChange={(e) => setDecisionNote(e.target.value)}
              maxLength={500}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>تراجع</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={acting === revokingId}
              onClick={(e) => {
                e.preventDefault()
                if (revokingId) decide(revokingId, 'REVOKE', decisionNote)
              }}
            >
              {acting === revokingId ? <Loader2 className="size-4 animate-spin" /> : null}
              تأكيد السحب الفوري
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Tabs>
  )
}

/** ترويسة موحدة لبطاقة الطلب — الطالب ← الكادر المطلوب */
function RequestHeader({
  request: r,
  showDecision = false,
}: {
  request: AdminAccessRequest
  showDecision?: boolean
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1.5">
        <p className="flex flex-wrap items-center gap-2 text-sm font-black">
          <span className="flex items-center gap-1.5">
            <UserRound className="size-4 text-primary" />
            {r.requester.name}
          </span>
          <Badge variant="outline" className="text-[10px] font-bold">
            {ROLE_LABELS[r.requester.role] ?? r.requester.role}
          </Badge>
          <span className="text-muted-foreground">←</span>
          <span className="flex items-center gap-1.5">
            <Stethoscope className="size-4 text-primary" />
            {r.target.name}
          </span>
          <Badge variant="outline" className="text-[10px] font-bold">
            {ROLE_LABELS[r.target.role] ?? r.target.role}
          </Badge>
        </p>
        <p className="text-[11px] text-muted-foreground">
          {r.target.specialty ? `${r.target.specialty} — ` : ''}طلب بتاريخ {formatDate(r.createdAt)}
          {showDecision && r.reviewedAt ? ` — قرار بتاريخ ${formatDateTime(r.reviewedAt)}` : ''}
          {showDecision && r.reviewer?.name ? ` — بواسطة ${r.reviewer.name}` : ''}
        </p>
      </div>
      {showDecision && <AccessRequestStatusBadge status={r.status} />}
    </div>
  )
}
