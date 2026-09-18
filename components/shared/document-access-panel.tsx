'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  BadgeCheck,
  Clock,
  FileLock2,
  KeyRound,
  Loader2,
  MessageSquareText,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from '@/components/shared/status-badge'
import { apiPost } from '@/lib/api-client'
import { DOCUMENT_TYPE_LABELS, cn, formatDateTime } from '@/lib/utils'

/**
 * لوحة خصوصية المستندات — الجولة 61 | تكليفات | Takleefat
 * ========================================================
 * تُعرض في السيرة الذاتية الكاملة وفي سيرة المتقدم عندما تكون مستندات
 * الكادر مخفية عن المستلم الإداري/مشرف الأطباء:
 *  - توضّح سياسة الخصوصية الجديدة (المستندات بإذن الإدارة حصراً).
 *  - تعرض شارات جاهزية المستندات (معتمدة/مرفوضة/قيد المراجعة) للشفافية.
 *  - زر «طلب رؤية المستندات» يفتح حوار سبب إجباري (10 أحرف على الأقل).
 *  - تعرض حالة الطلب الحالي: قيد المراجعة / مرفوض (مع سبب الإدارة) /
 *    مسحوب من الإدارة — مع إمكانية إعادة التقديم عند الرفض أو السحب.
 */

export interface DocumentAccessState {
  status: string
  reviewNote: string | null
  canRequest: boolean
  requestedAt?: string | null
  decidedAt?: string | null
}

const ACCESS_STATUS_LABELS: Record<string, string> = {
  NONE: 'لا يوجد طلب',
  PENDING: 'قيد مراجعة الإدارة',
  APPROVED: 'ممنوح',
  REJECTED: 'مرفوض',
  REVOKED: 'مسحوب من الإدارة',
}

export function DocumentAccessPanel({
  targetId,
  targetName,
  access,
  documentsVerified,
  approvedDocuments,
  documentStatuses,
}: {
  targetId: string
  targetName: string
  access?: DocumentAccessState | null
  documentsVerified?: boolean
  approvedDocuments?: number
  documentStatuses?: Array<{ type: string; status: string }>
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const status = access?.status ?? 'NONE'
  const canRequest = access?.canRequest ?? true
  const validReason = reason.trim().length >= 10

  const submitRequest = async () => {
    if (!validReason) {
      toast.error('اكتب سبباً واضحاً للطلب (10 أحرف على الأقل)')
      return
    }
    setSubmitting(true)
    try {
      const res = await apiPost<{ message: string }>('/api/document-access', {
        targetId,
        reason: reason.trim(),
      })
      toast.success(res.message)
      setOpen(false)
      setReason('')
      // تحديث حالات السيرة والتقديمات فوراً بعد إرسال الطلب
      await queryClient.invalidateQueries()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-2.5">
      {/* بطاقة سياسة الخصوصية */}
      <div className="flex items-start gap-3 rounded-xl border-2 border-emerald-200 bg-gradient-to-bl from-emerald-50 to-transparent p-3.5 dark:border-emerald-900 dark:from-emerald-950/20">
        <span className="shrink-0 rounded-lg bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
          <ShieldCheck className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-extrabold text-emerald-800 dark:text-emerald-200">
            {documentsVerified
              ? `تم التحقق من مستندات ${targetName}`
              : `مستندات ${targetName} محفوظة وخاصة`}
            {documentsVerified && approvedDocuments ? ` (${approvedDocuments} معتمدة)` : ''}
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            بموجب سياسة الخصوصية الجديدة، مستندات الكادر لا تُفتح إلا بإذن صريح من
            إدارة المنصة بعد طلب رسمي بسبب معلن — وكل مشاهدة لمستنداته تُسجَّل.
          </p>
        </div>
      </div>

      {/* حالة الطلب الحالي */}
      {status === 'PENDING' && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 dark:border-amber-900 dark:bg-amber-950/30">
          <Clock className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-extrabold text-amber-800 dark:text-amber-300">
              طلبك قيد مراجعة الإدارة
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              سيصلك إشعار فور صدور القرار — لا حاجة لإرسال طلب جديد.
            </p>
          </div>
          <StatusBadge
            status="PENDING"
            labels={{ PENDING: 'قيد المراجعة' }}
            className="shrink-0"
          />
        </div>
      )}

      {status === 'REJECTED' && (
        <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 dark:border-red-900 dark:bg-red-950/30">
          <p className="flex items-center gap-2 text-xs font-extrabold text-red-700 dark:text-red-300">
            <XCircle className="size-4" />
            تم رفض طلبك برؤية مستندات {targetName}
          </p>
          {access?.reviewNote && (
            <p className="rounded-lg bg-background/70 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              سبب الإدارة: {access.reviewNote}
            </p>
          )}
          {canRequest && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
              <KeyRound className="size-3.5" />
              إعادة تقديم طلب جديد
            </Button>
          )}
        </div>
      )}

      {status === 'REVOKED' && (
        <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 dark:border-red-900 dark:bg-red-950/30">
          <p className="flex items-center gap-2 text-xs font-extrabold text-red-700 dark:text-red-300">
            <XCircle className="size-4" />
            سحبت الإدارة صلاحية رؤية مستندات {targetName}
          </p>
          {access?.reviewNote && (
            <p className="rounded-lg bg-background/70 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              ملاحظة الإدارة: {access.reviewNote}
            </p>
          )}
          {canRequest && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
              <KeyRound className="size-3.5" />
              تقديم طلب جديد
            </Button>
          )}
        </div>
      )}

      {/* زر الطلب — يظهر عندما لا يوجد طلب قائم أو منح مفتوح */}
      {status === 'NONE' && (
        <Button className="w-full gap-2" onClick={() => setOpen(true)}>
          <KeyRound className="size-4" />
          طلب رؤية المستندات من الإدارة
        </Button>
      )}

      {/* شارات جاهزية المستندات */}
      {(documentStatuses?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {documentStatuses!.map((ds) => (
            <span
              key={ds.type}
              className={cn(
                'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-extrabold',
                ds.status === 'APPROVED'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : ds.status === 'REJECTED'
                    ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                    : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
              )}
            >
              {ds.status === 'APPROVED' ? (
                <BadgeCheck className="size-3" />
              ) : ds.status === 'REJECTED' ? (
                <XCircle className="size-3" />
              ) : (
                <Clock className="size-3" />
              )}
              {DOCUMENT_TYPE_LABELS[ds.type] ?? ds.type}:{' '}
              {ds.status === 'APPROVED' ? 'معتمدة' : ds.status === 'REJECTED' ? 'مرفوضة' : 'قيد المراجعة'}
            </span>
          ))}
        </div>
      )}

      {/* حوار سبب الطلب */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <FileLock2 className="size-5 text-primary" />
              طلب رؤية مستندات {targetName}
            </DialogTitle>
            <DialogDescription>
              اكتب سبباً واضحاً لمطلبك — يصل الطلب مباشرة إلى إدارة المنصة لاتخاذ
              القرار، وسيصلك إشعار فور صدوره.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-start gap-2.5 rounded-xl border border-primary/25 bg-primary/5 px-3.5 py-3">
              <MessageSquareText className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                سيُسجَّل طلبك وقرار الإدارة فيه، وكل مشاهدة لمستندات الكادر بعد
                المنح تُوثَّق في سجل المشاهدات — شفافية كاملة للطرفين.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`doc-access-reason-${targetId}`}>
                سبب الطلب <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id={`doc-access-reason-${targetId}`}
                rows={4}
                dir="rtl"
                placeholder="مثال: نتأكد من سريان مزاولة الكادر قبل اعتماده في تكليف العناية المركزة الحالي"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
              />
              <p
                className={cn(
                  'text-[11px]',
                  validReason ? 'text-emerald-600' : 'text-muted-foreground'
                )}
              >
                {reason.trim().length}/10 حرف كحد أدنى — 500 حرف كحد أقصى
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                className="flex-1 gap-2"
                disabled={!validReason || submitting}
                onClick={submitRequest}
              >
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <KeyRound className="size-4" />
                )}
                {submitting ? 'جارٍ إرسال الطلب...' : 'إرسال الطلب للإدارة'}
              </Button>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
                تراجع
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** شارة حالة الطلب المختصرة — لقوائم الطلبات */
export function AccessRequestStatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    PENDING: 'قيد المراجعة',
    APPROVED: 'ممنوح',
    REJECTED: 'مرفوض',
    REVOKED: 'مسحوب',
  }
  const tones: Record<string, string> = {
    PENDING: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
    APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
    REJECTED: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900',
    REVOKED: 'bg-secondary text-secondary-foreground border-border',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold',
        tones[status] ?? tones.REVOKED
      )}
    >
      {labels[status] ?? status}
    </span>
  )
}

/** تنسيق موحد لوقت الطلب/القرار */
export function formatAccessTime(value?: string | null): string {
  return value ? formatDateTime(value) : '—'
}
