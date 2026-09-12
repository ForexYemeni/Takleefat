'use client'

import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BadgeCheck,
  Banknote,
  Building2,
  Hourglass,
  ImagePlus,
  MapPin,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { compressImage } from '@/lib/compress-image'
import { cn, formatCurrency } from '@/lib/utils'
import { PaymentCard, type PaymentInfoData } from '@/components/shared/payment-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DocumentViewer, type ViewableDocument } from '@/components/shared/document-viewer'

/**
 * بطاقة سداد رسوم الإدارة — الجولة 37
 *
 * بطاقة احترافية بارزة لتكليف لم تُسدَّد رسومه/نسبته للإدارة:
 * تُظهر المبلغ الفعلي الواجب سداده بخط كبير مع تفصيل الرسوم وطرق الدفع،
 * ورفع لقطة شاشة إثبات الدفع مباشرة منها — بثلاث حالات واضحة:
 *   1) بانتظار السداد (لم يُرفع إثبات)  2) بانتظار تأكيد الإدارة (رُفع الإثبات)  3) أكدت الإدارة الدفع
 * تُستخدم في تبويب «تقديماتي» (قسم السداد) وفي «تكليفاتي المؤكدة»،
 * ويصل إليها رابط عميق من تنبيه «نظرة عامة» (?pay=<id>) بتمييز وتمرير تلقائي.
 */

export interface FeePaymentAssignment {
  id: string
  title: string
  facility: string
  department: string | null
  status: string
  value: number | null
  adminFee: number | null
  paymentStatus: string | null
  paymentScreenshotUrl: string | null
  paymentScreenshotName: string | null
}

export interface FeePaymentSettings extends PaymentInfoData {
  feeMode: 'APPLICATION' | 'ADMIN'
  applicationFee: number
  adminFeeType: 'PERCENTAGE' | 'FIXED'
  adminPercentage: number
}

export function FeePaymentCard({
  assignment: a,
  settings,
  highlight = false,
  className,
}: {
  assignment: FeePaymentAssignment
  settings: FeePaymentSettings
  /** تمييز البطاقة عند الوصول إليها برابط عميق من نظرة عامة */
  highlight?: boolean
  className?: string
}) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [viewScreenshot, setViewScreenshot] = useState<ViewableDocument | null>(null)

  const paid = a.paymentStatus === 'PAID'
  const cancelled = a.status === 'CANCELLED'
  const hasScreenshot = !!a.paymentScreenshotUrl

  const applicationFee =
    settings.feeMode === 'APPLICATION' ? Math.max(0, settings.applicationFee) : 0
  const dueToAdmin = (a.adminFee ?? 0) + applicationFee

  // رفع لقطة شاشة إثبات الدفع — ضغط من جهة العميل ثم رفع مباشر
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const { file: compressed } = await compressImage(file)
      const formData = new FormData()
      formData.append('file', compressed)
      const response = await fetch(`/api/me/assignments/${a.id}/payment-screenshot`, {
        method: 'POST',
        body: formData,
      })
      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.includes('application/json')) {
        throw new Error(`تعذر رفع الصورة (رمز ${response.status}) — أعد المحاولة`)
      }
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'فشل رفع الصورة')
      return result as { message: string }
    },
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['my-assignments'] })
      queryClient.invalidateQueries({ queryKey: ['my-applications'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div
      id={`fee-card-${a.id}`}
      className={cn(
        'overflow-hidden rounded-2xl border-2 shadow-sm transition-shadow',
        paid
          ? 'border-emerald-300 bg-gradient-to-b from-emerald-50/80 to-transparent dark:border-emerald-800 dark:from-emerald-950/30'
          : 'border-amber-300 bg-gradient-to-b from-amber-50/90 to-transparent dark:border-amber-800 dark:from-amber-950/30',
        highlight && 'ring-4 ring-amber-400/60 dark:ring-amber-500/40',
        className
      )}
    >
      {/* الترويسة: عنوان البطاقة + حالة السداد */}
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3',
          paid
            ? 'border-emerald-200 bg-emerald-100/60 dark:border-emerald-900 dark:bg-emerald-900/30'
            : 'border-amber-200 bg-amber-100/60 dark:border-amber-900 dark:bg-amber-900/30'
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-xl',
              paid
                ? 'bg-emerald-600 text-white'
                : 'bg-amber-500 text-white dark:bg-amber-600'
            )}
          >
            <Wallet className="size-4.5" />
          </span>
          <div className="min-w-0">
            <p
              className={cn(
                'text-sm font-black',
                paid ? 'text-emerald-800 dark:text-emerald-200' : 'text-amber-900 dark:text-amber-200'
              )}
            >
              {paid ? 'رسوم الإدارة — مسددة ومؤكدة' : 'سداد رسوم الإدارة مطلوب'}
            </p>
            <p className="mt-0.5 flex min-w-0 items-center gap-1 truncate text-[11px] text-muted-foreground">
              <Building2 className="size-3 shrink-0" />
              <span className="truncate font-bold">{a.title}</span>
              <span className="shrink-0">•</span>
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">
                {a.facility}
                {a.department ? ` — ${a.department}` : ''}
              </span>
            </p>
          </div>
        </div>
        {paid ? (
          <Badge className="gap-1 bg-emerald-600 text-[10px]">
            <BadgeCheck className="size-3" />
            أكدت الإدارة الدفع
          </Badge>
        ) : hasScreenshot ? (
          <Badge variant="secondary" className="gap-1 text-[10px]">
            <Hourglass className="size-3" />
            بانتظار تأكيد الإدارة
          </Badge>
        ) : (
          <Badge className="bg-amber-600 text-[10px] text-white hover:bg-amber-600">
            <Hourglass className="size-3" />
            بانتظار السداد
          </Badge>
        )}
      </div>

      <div className="space-y-3 p-4">
        {/* المبلغ الفعلي الواجب سداده — بخط كبير وواضح */}
        <div
          className={cn(
            'flex items-center justify-between gap-3 rounded-xl border-2 border-dashed px-4 py-3',
            paid
              ? 'border-emerald-300 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/30'
              : 'border-amber-400 bg-amber-50/70 dark:border-amber-700 dark:bg-amber-950/30'
          )}
        >
          <p className="flex items-center gap-1.5 text-xs font-extrabold text-muted-foreground">
            <Banknote className="size-4 shrink-0" />
            <span className="shrink-0">المبلغ الفعلي الواجب سداده للإدارة</span>
          </p>
          <p
            className={cn(
              'text-2xl font-black',
              paid ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'
            )}
            dir="ltr"
          >
            {formatCurrency(dueToAdmin)}
          </p>
        </div>

        {/* تفصيل الرسوم */}
        <div className="space-y-1 rounded-xl bg-white/70 p-3 text-xs dark:bg-black/20">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">قيمة التكليف</span>
            <span className="font-bold" dir="ltr">
              {formatCurrency(a.value ?? 0)}
            </span>
          </div>
          {settings.feeMode === 'ADMIN' ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">
                {settings.adminFeeType === 'FIXED'
                  ? 'حصة الإدارة (مبلغ ثابت)'
                  : `حصة الإدارة (${settings.adminPercentage}٪)`}
              </span>
              <span className="font-bold text-red-600" dir="ltr">
                − {formatCurrency(a.adminFee ?? 0)}
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">رسوم التقديم</span>
              <span className="font-bold text-red-600" dir="ltr">
                − {formatCurrency(applicationFee)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 border-t pt-1.5">
            <span className="font-extrabold">صافي المبلغ المستحق لك من التكليف</span>
            <span className="font-black text-emerald-700 dark:text-emerald-300" dir="ltr">
              {formatCurrency((a.value ?? 0) - dueToAdmin)}
            </span>
          </div>
        </div>

        {/* طرق الدفع للإدارة */}
        <PaymentCard
          settings={settings}
          dueAmount={paid ? null : dueToAdmin}
          className={paid ? 'opacity-80' : ''}
        />

        {/* إثبات الدفع — الرفع والعرض */}
        {!cancelled && (
          <div className="rounded-2xl border-2 border-dashed p-3">
            <p className="flex items-center gap-1.5 text-xs font-extrabold">
              <ImagePlus className="size-3.5 text-primary" />
              إثبات دفع رسوم/نسبة الإدارة
            </p>

            {hasScreenshot ? (
              <div className="mt-2.5 space-y-2">
                <button
                  type="button"
                  onClick={() =>
                    setViewScreenshot({
                      fileUrl: a.paymentScreenshotUrl!,
                      fileName: a.paymentScreenshotName ?? 'إثبات الدفع',
                      title: 'لقطة شاشة إثبات الدفع',
                      mimeType: 'image/*',
                    })
                  }
                  className="flex w-full items-center gap-3 rounded-xl border p-2.5 text-start transition-colors hover:bg-accent"
                >
                  <img
                    src={a.paymentScreenshotUrl!}
                    alt="إثبات الدفع"
                    className="size-14 rounded-lg border object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold">
                      {a.paymentScreenshotName ?? 'لقطة الشاشة'}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      اضغط لعرض الصورة وتكبيرها
                    </span>
                  </span>
                  {!paid && <Badge variant="secondary" className="shrink-0 text-[10px]">قيد المراجعة</Badge>}
                </button>
                {paid ? (
                  <p className="rounded-xl bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    تم تأكيد دفع الرسوم من الإدارة — يمكنك التقديم على تكليفات جديدة
                  </p>
                ) : (
                  <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                    رُفع الإثبات — بانتظار تأكيد الإدارة للدفع، وبعدها تُتاح لك التقديمات من جديد
                  </p>
                )}
              </div>
            ) : paid ? (
              <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                تم تأكيد دفع الرسوم من الإدارة مباشرة — يمكنك التقديم على تكليفات جديدة
              </p>
            ) : (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) uploadMutation.mutate(file)
                    e.target.value = ''
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2.5 w-full gap-2 border-dashed"
                  disabled={uploadMutation.isPending}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImagePlus className="size-4" />
                  {uploadMutation.isPending ? 'جارٍ الرفع...' : 'رفع لقطة شاشة إثبات الدفع'}
                </Button>
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  بعد دفع المبلغ للإدارة عبر {settings.paymentMethod ?? 'طريقة الدفع'} ارفع لقطة
                  شاشة هنا — تظهر للإدارة بشكل احترافي للتأكيد
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* عارض لقطة شاشة الدفع */}
      <DocumentViewer
        document={viewScreenshot}
        open={!!viewScreenshot}
        onOpenChange={(open) => !open && setViewScreenshot(null)}
      />
    </div>
  )
}
