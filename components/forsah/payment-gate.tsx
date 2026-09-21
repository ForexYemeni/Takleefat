'use client'

import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Ban,
  Building2,
  CheckCircle2,
  Hourglass,
  ImagePlus,
  Lock,
  ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetcher } from '@/lib/api-client'
import { compressImage } from '@/lib/compress-image'
import { formatDate } from '@/lib/utils'
import { FORSAH_CURRENCY_SYMBOLS } from '@/lib/forsah/constants'
import { PaymentCard } from '@/components/shared/payment-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DocumentViewer, type ViewableDocument } from '@/components/shared/document-viewer'

/**
 * بوابة سداد رسوم «فرصة» الإلزامية — الجولة 71
 * ============================================================
 * بعد اختيار المرشح لتوقيت سداد رسوم الخدمة تُفعَّل هذه البوابة حصراً:
 *  - بطاقة حاجبة فوق كل واجهات الكادر — لا زر إغلاق، لا نقر خارجها، لا Escape
 *    («غير قابلة للازالة ولا يتمكن الخروج منها» — بطلب صريح من صاحب المنصة).
 *  - تُظهر بيانات حساب الإدارة المالية (طريقة الدفع/رقم الحساب/اسم الحساب/ملاحظات)
 *    من إعدادات المنصة التي يديرها حساب الإدارة حصراً.
 *  - لا تُرفع البوابة إلا بعد اكتمال الشرطين معاً:
 *      1) رفع إثبات الدفع من حساب المرشح (صورة تُضغط من جهة العميل)
 *      2) تأكيد وصول الدفعة من حساب الإدارة (تبويب «تأكيدات الدفع»)
 *  - إن رفضت الإدارة الإثبات تظهر رسالة السبب ويعيد المرشح الرفع — والبوابة تبقى.
 *  - مراقبة دورية كل 30 ثانية أثناء تفعيل البوابة — بعد تأكيد الإدارة تُرفع تلقائياً.
 * لا بوابة لمن: لم يختر توقيتاً بعد / لا رسوم عليه (راتب حسب الاتفاق) / سدّد وتأكدت الدفعة.
 */

interface GatePayload {
  hasGate: boolean
  gate: {
    applicationId: string | null
    transactionId: string
    opportunityId: string | null
    opportunityTitle: string
    feeAmount: number
    currency: string
    status: string
    paymentTimingLabel: string | null
    paymentTimingChosenAt: string | null
    paymentDueAt: string | null
    paymentProofUrl: string | null
    paymentProofFileName: string | null
    paymentProofUploadedAt: string | null
    paymentProofRejectionNote: string | null
  } | null
  /** بيانات حساب الإدارة المالية من إعدادات المنصة — GET /api/me/opportunity-payments */
  adminPayment: { method: string; accountNumber: string; accountName: string; notes: string } | null
}

export function PaymentGate() {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [viewProof, setViewProof] = useState<ViewableDocument | null>(null)

  const gate = useQuery({
    queryKey: ['forsah-payment-gate'],
    queryFn: () => apiFetcher<GatePayload>('/api/me/opportunity-payments'),
    // مراقبة دورية أثناء الحجب حصراً — بعد تأكيد الإدارة تُرفع البوابة تلقائياً
    refetchInterval: (query) => (query.state.data?.hasGate ? 30_000 : false),
    staleTime: 15_000,
    retry: 1,
  })

  const uploadMutation = useMutation({
    mutationFn: async ({ file, applicationId }: { file: File; applicationId: string }) => {
      const { file: compressed } = await compressImage(file)
      const formData = new FormData()
      formData.append('file', compressed)
      formData.append('applicationId', applicationId)
      const response = await fetch('/api/me/opportunity-payments', { method: 'POST', body: formData })
      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.includes('application/json')) {
        throw new Error(`تعذر رفع الصورة (رمز ${response.status}) — أعد المحاولة`)
      }
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'فشل رفع الإثبات')
      return result as { message: string }
    },
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['forsah-payment-gate'] })
      queryClient.invalidateQueries({ queryKey: ['forsah-mine'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const data = gate.data
  // لا بوابة: تحميل/خطأ/لا عملية نشطة — الصفحة تعمل طبيعياً
  if (gate.isLoading || gate.isError || !data?.hasGate || !data.gate || !data.adminPayment) return null

  const g = data.gate
  const cur = FORSAH_CURRENCY_SYMBOLS[g.currency] ?? g.currency
  const proofUploaded = !!g.paymentProofUrl
  const rejected = !proofUploaded && !!g.paymentProofRejectionNote

  return (
    // طبقة حاجبة فوق كل شيء — لا معالجات إغلاق إطلاقاً (لا زر X، لا نقر خارجي، لا Escape)
    <div
      dir="rtl"
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/85 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="سداد رسوم الخدمة — إلزامي"
    >
      <div className="my-auto w-full max-w-xl overflow-hidden rounded-3xl border-2 border-amber-300 bg-card shadow-2xl dark:border-amber-700">
        {/* الترويسة — القفل إلزامي */}
        <div className="flex items-center gap-3 border-b border-amber-200 bg-gradient-to-b from-amber-100/90 to-amber-50/50 px-5 py-4 dark:border-amber-900 dark:from-amber-950/50 dark:to-amber-950/20">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-sm dark:bg-amber-600">
            <Lock className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-amber-900 dark:text-amber-200">
              سداد رسوم الخدمة — إلزامي
            </p>
            <p className="mt-0.5 flex min-w-0 items-center gap-1 truncate text-[11px] font-bold text-muted-foreground">
              <Building2 className="size-3 shrink-0" />
              <span className="truncate">فرصة: {g.opportunityTitle}</span>
            </p>
          </div>
          {proofUploaded ? (
            <Badge className="gap-1 bg-amber-600 text-[10px] text-white hover:bg-amber-600">
              <Hourglass className="size-3" />
              بانتظار تأكيد الإدارة
            </Badge>
          ) : (
            <Badge className="gap-1 bg-amber-600 text-[10px] text-white hover:bg-amber-600">
              <ImagePlus className="size-3" />
              بانتظار رفع الإثبات
            </Badge>
          )}
        </div>

        <div className="space-y-4 p-5">
          {/* المبلغ وتوقيت السداد المختار */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-dashed border-amber-400 bg-amber-50/70 px-4 py-3 dark:border-amber-700 dark:bg-amber-950/30">
            <div>
              <p className="text-[11px] font-extrabold text-muted-foreground">المبلغ الواجب سداده للإدارة</p>
              <p className="text-2xl font-black text-amber-700 dark:text-amber-300" dir="ltr">
                {g.feeAmount.toLocaleString('ar-YE')} {cur}
              </p>
              {g.paymentDueAt && (
                <p className="mt-0.5 text-[10px] font-bold text-muted-foreground">
                  يستحق: {formatDate(g.paymentDueAt)}
                </p>
              )}
            </div>
            <div className="text-end">
              <p className="text-[11px] font-extrabold text-muted-foreground">توقيت السداد المعتمد</p>
              <p className="flex items-center justify-end gap-1 text-xs font-black text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-3.5" />
                {g.paymentTimingLabel}
              </p>
            </div>
          </div>

          {/* خطوات الإتمام */}
          <ol className="grid gap-1.5 rounded-2xl bg-muted/50 p-3 text-[11px] font-bold text-muted-foreground">
            <li className="flex items-center gap-2">
              <span className="flex size-4.5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[9px] font-black text-white">1</span>
              اختيار توقيت السداد <CheckCircle2 className="size-3.5 text-emerald-600" />
            </li>
            <li className="flex items-center gap-2">
              <span className="flex size-4.5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[9px] font-black text-white">2</span>
              الدفع عبر حساب إدارة المنصة (البيانات أدناه)
            </li>
            <li className="flex items-center gap-2">
              <span className="flex size-4.5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[9px] font-black text-white">3</span>
              رفع صورة إثبات الدفع من هنا
            </li>
            <li className="flex items-center gap-2">
              <span className="flex size-4.5 shrink-0 items-center justify-center rounded-full bg-slate-400 text-[9px] font-black text-white">4</span>
              تأكيد إدارة المنصة للدفعة — تُرفع البوابة تلقائياً
            </li>
          </ol>

          {/* بيانات حساب الإدارة المالية — من إعدادات المنصة */}
          <PaymentCard
            settings={{
              paymentMethod: data.adminPayment.method,
              paymentAccountNumber: data.adminPayment.accountNumber,
              paymentAccountName: data.adminPayment.accountName,
              paymentNotes: data.adminPayment.notes,
            }}
            dueAmount={null}
          />

          {/* سبب رفض الإثبات السابق — إن وجد */}
          {rejected && (
            <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50/80 p-3 text-xs font-bold text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              <Ban className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-black">رُفض إثبات الدفع السابق من إدارة المنصة</p>
                <p className="mt-0.5 leading-relaxed">السبب: {g.paymentProofRejectionNote}</p>
                <p className="mt-0.5">يرجى دفع المبلغ مجدداً إن لم يصل ورفع إثبات جديد واضح.</p>
              </div>
            </div>
          )}

          {/* إثبات الدفع — الرفع إلزامي هنا */}
          <div className="rounded-2xl border-2 border-dashed p-3.5">
            <p className="flex items-center gap-1.5 text-xs font-extrabold">
              <ImagePlus className="size-3.5 text-primary" />
              إثبات دفع رسوم الخدمة
            </p>

            {proofUploaded ? (
              <div className="mt-2.5 space-y-2">
                <button
                  type="button"
                  onClick={() =>
                    setViewProof({
                      fileUrl: g.paymentProofUrl!,
                      fileName: g.paymentProofFileName ?? 'إثبات الدفع',
                      title: 'إثبات دفع رسوم الخدمة',
                      mimeType: 'image/*',
                    })
                  }
                  className="flex w-full items-center gap-3 rounded-xl border p-2.5 text-start transition-colors hover:bg-accent"
                >
                  <img
                    src={g.paymentProofUrl!}
                    alt="إثبات الدفع"
                    className="size-14 rounded-lg border object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold">{g.paymentProofFileName ?? 'لقطة الإثبات'}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      رُفع {g.paymentProofUploadedAt ? formatDate(g.paymentProofUploadedAt) : ''} — اضغط للعرض
                    </span>
                  </span>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">قيد المراجعة</Badge>
                </button>
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-bold leading-relaxed text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  وصل إثباتك لإدارة المنصة — بعد تأكيد وصول الدفعة تُرفع هذه البطاقة تلقائياً
                  وتعود لاستخدام المنصة كالمعتاد. تُفحص حالة الدفع تلقائياً كل 30 ثانية.
                </p>
              </div>
            ) : (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file && g.applicationId) uploadMutation.mutate({ file, applicationId: g.applicationId })
                    e.target.value = ''
                  }}
                />
                <Button
                  className="mt-2.5 w-full gap-2 rounded-xl bg-amber-600 text-white hover:bg-amber-700"
                  disabled={uploadMutation.isPending || !g.applicationId}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImagePlus className="size-4" />
                  {uploadMutation.isPending ? 'جارٍ رفع الإثبات...' : 'رفع صورة إثبات الدفع'}
                </Button>
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  بعد دفع المبلغ عبر {data.adminPayment.method ?? 'طريقة الدفع'} المبينة أعلاه، ارفع صورة
                  إيصال التحويل هنا — تُعرض لإدارة المنصة للتأكيد.
                </p>
              </>
            )}
          </div>

          {/* القفل: لماذا لا يمكن الإغلاق */}
          <p className="flex items-start gap-2 rounded-xl bg-muted/60 px-3 py-2.5 text-[11px] font-bold leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
            هذه البطاقة إلزامية لحماية الطرفين: لا يمكن إغلاقها أو مغادرة هذه الشاشة إلا
            بعد رفع إثبات الدفع وتأكيد إدارة المنصة وصول الدفعة — بعدها تُرفع تلقائياً.
          </p>
        </div>
      </div>

      {/* عارض صورة الإثبات */}
      <DocumentViewer
        document={viewProof}
        open={!!viewProof}
        onOpenChange={(open) => !open && setViewProof(null)}
      />
    </div>
  )
}
