'use client'

import { Lock, MessageCircle, Phone as PhoneIcon, ShieldQuestion } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { whatsappLink } from '@/lib/utils'
import {
  contactUnlockSteps,
  useContactLockHint,
} from '@/lib/contact-hint'

/**
 * عرض رقم تواصل الكادر/الطبيب — الجولة 34
 * =========================================
 * - مقفول: الرقم مقنّع + شارة قفل أنيقة + تلميح بخطوات الفتح
 * - مفتوح: الرقم الكامل + زر اتصال + زر واتساب مباشر
 * يحاكي استجابة الخادم (phone / phoneMasked / phoneLocked) — الواجهة
 * لا تعرض شيئاً يخفيه الخادم، وإنما تُجمّل ما وصلها بشكل احترافي.
 * الجولة 46: التلميح الافتراضي عند القفل أصبح واعياً بنمط الرسوم —
 * «سداد نسبة الإدارة» في النمط العادي، و«بلا أي سداد» أثناء عرض بدون
 * رسوم إدارة — بدل نص ثابت مضلل في العرض (البلاغ الحرفي).
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
  /** تلميح بديل عند القفل — يُخفي خطوات الفتح (اتصال المستلم/المشرف للكادر — الجولة 38) */
  lockedHint,
}: {
  data: StaffPhoneData | null | undefined
  /** اسم صاحب الرقم — يُستخدم في نص زر الواتساب */
  personName?: string
  className?: string
  /** إظهار أزرار الاتصال/الواتساب عند الفتح (الافتراضي: نعم) */
  withActions?: boolean
  lockedHint?: string
}) {
  // الجولة 46: تلميح واعٍ بنمط الرسوم — يُستخدم عند غياب تلميح صريح
  const autoHint = useContactLockHint()

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
            {lockedHint ? (
              <p className="flex items-start gap-1.5 text-xs font-bold leading-relaxed">
                <ShieldQuestion className="mt-0.5 size-3.5 shrink-0" />
                {lockedHint}
              </p>
            ) : (
              <PhoneLockHintContent hint={autoHint} />
            )}
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
 * محتوى تلميح القفل — الجولة 46: يعرض النص المناسب لنمط الرسوم الحالي
 * (سداد نسبة الإدارة / رسوم التقديم / بلا أي سداد في عرض بدون رسوم)
 */
function PhoneLockHintContent({ hint, compact = false }: { hint: string; compact?: boolean }) {
  return (
    <div className="space-y-1.5">
      <p className="flex items-start gap-1.5 text-xs font-bold leading-relaxed">
        <ShieldQuestion className="mt-0.5 size-3.5 shrink-0" />
        {hint}
      </p>
      {!compact && (
        <ol className="list-inside list-decimal space-y-0.5 text-[11px] leading-relaxed text-muted-foreground">
          {contactUnlockSteps().map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      )}
    </div>
  )
}

/**
 * شريحة واتساب مشروطة بحالة فتح بيانات الاتصال — لصفحات التكليفات:
 * الجولة 46 — البلاغ الحرفي: «بيانات الاتصال يُفتح بعد سداد نسبة الإدارة
 * رغم انه عرض بدون رسوم»:
 *  - القرار يُبنى على قرار الخادم (phoneLocked) حصراً — وهو القاعدة الموحدة:
 *    السداد + التأكيد، أو بلا أي رسوم أثناء السير (عرض بدون رسوم / إسناد
 *    مباشر بلا قيمة) — فلا يعود القفل يظهر رغم انعدام الرسوم.
 *  - تلميح القفل واعٍ بنمط الرسوم (lockHint) بدل النص الثابت المضلل.
 */
export function AssignmentContactChip({
  paymentStatus: _paymentStatus,
  assignmentStatus: _assignmentStatus,
  phone,
  masked,
  personName,
  message,
  /** قرار الخادم في فتح بيانات الاتصال — القاعدة الموحدة (الجولة 46) */
  phoneLocked,
  /** تلميح واعٍ بنمط الرسوم يُعرض عند القفل */
  lockHint,
}: {
  paymentStatus: string
  assignmentStatus: string
  phone: string | null
  masked?: string
  personName: string
  message?: string
  phoneLocked?: boolean
  lockHint?: string
}) {
  const autoHint = useContactLockHint()
  // قرار الخادم هو المرجع — والاحتياط للتوافق: القاعدة التاريخية بالسداد
  const locked = phoneLocked ?? !(
    _paymentStatus === 'PAID' &&
    _assignmentStatus !== 'CANCELLED' &&
    _assignmentStatus !== 'COMPLETED'
  )
  if (!locked && phone) {
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
        <TooltipContent side="top" className="max-w-64 p-3 text-start">
          <PhoneLockHintContent hint={lockHint ?? autoHint} compact />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
