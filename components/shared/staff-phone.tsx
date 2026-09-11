'use client'

import { Lock, MessageCircle, Phone as PhoneIcon, ShieldQuestion } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { whatsappLink } from '@/lib/utils'
import { PHONE_LOCKED_HINT, PHONE_UNLOCK_STEPS } from '@/lib/phone-privacy'

/**
 * عرض رقم تواصل الكادر/الطبيب — الجولة 34
 * =========================================
 * - مقفول: الرقم مقنّع + شارة قفل أنيقة + تلميح بخطوات الفتح
 * - مفتوح: الرقم الكامل + زر اتصال + زر واتساب مباشر
 * يحاكي استجابة الخادم (phone / phoneMasked / phoneLocked) — الواجهة
 * لا تعرض شيئاً يخفيه الخادم، وإنما تُجمّل ما وصلها بشكل احترافي.
 */
export interface StaffPhoneData {
  phone: string | null
  phoneMasked: string
  phoneLocked: boolean
}

export function StaffPhone({
  data,
  personName,
  className = '',
  withActions = true,
}: {
  data: StaffPhoneData | null | undefined
  /** اسم صاحب الرقم — يُستخدم في نص زر الواتساب */
  personName?: string
  className?: string
  /** إظهار أزرار الاتصال/الواتساب عند الفتح (الافتراضي: نعم) */
  withActions?: boolean
}) {
  if (!data) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-lg bg-muted px-2 py-1 text-xs text-muted-foreground ${className}`}
      >
        <Lock className="size-3" />
        غير متاح
      </span>
    )
  }

  if (data.phoneLocked) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300 ${className}`}
            >
              <Lock className="size-3" />
              <span dir="ltr" className="tracking-wider">
                {data.phoneMasked}
              </span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-64 p-3 text-start">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold">
              <ShieldQuestion className="size-3.5" />
              {PHONE_LOCKED_HINT}
            </p>
            <ol className="list-inside list-decimal space-y-0.5 text-[11px] leading-relaxed text-muted-foreground">
              {PHONE_UNLOCK_STEPS.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <a
        href={`tel:${data.phone ?? ''}`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-2 py-1 text-xs font-bold text-teal-800 transition-colors hover:bg-teal-100 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-300"
      >
        <PhoneIcon className="size-3" />
        <span dir="ltr">{data.phone}</span>
      </a>
      {withActions && data.phone && (
        <a
          href={whatsappLink(
            data.phone,
            `مرحباً ${personName ?? ''}، بخصوص التكليف — من منصة تكليفات | Takleefat`
          )}
          target="_blank"
          rel="noreferrer"
          title={`مراسلة ${personName ?? 'الكادر'} عبر واتساب`}
          className="inline-flex size-7 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
        >
          <MessageCircle className="size-3.5" />
        </a>
      )}
    </span>
  )
}

/**
 * شريحة واتساب مشروطة بحالة سداد نسبة الإدارة — لصفحات التكليفات:
 * - التكليف مسدد → زر واتساب أخضر للتواصل مع الكادر
 * - غير مسدد → شريحة قفل بالتلميح
 */
export function AssignmentContactChip({
  paymentStatus,
  assignmentStatus,
  phone,
  masked,
  personName,
  message,
}: {
  paymentStatus: string
  assignmentStatus: string
  phone: string | null
  masked?: string
  personName: string
  message?: string
}) {
  const open = paymentStatus === 'PAID' && assignmentStatus !== 'CANCELLED'
  if (open && phone) {
    return (
      <a
        href={whatsappLink(
          phone,
          message ?? `مرحباً ${personName}، بخصوص التكليف — من منصة تكليفات | Takleefat`
        )}
        target="_blank"
        rel="noreferrer"
        title={`مراسلة ${personName} عبر واتساب`}
        className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
      >
        <MessageCircle className="size-3" />
        واتساب
      </a>
    )
  }
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            <Lock className="size-3" />
            تواصل مقفل
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-60 p-3 text-start">
          <p className="text-xs font-bold">{PHONE_LOCKED_HINT}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {PHONE_UNLOCK_STEPS[1]} — ثم يُفتح زر التواصل تلقائياً لهذا التكليف
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
