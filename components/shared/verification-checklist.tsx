'use client'

/**
 * رحلة توثيق الحساب + لافتة حالة الحساب — تكليفات | Takleefat
 * ------------------------------------------------------------
 * VerificationChecklist: قائمة تحقق تفاعلية ختامية للكادر التمريضي والطبيب
 * — تعرض خطوات التوثيق الثلاث بحالة حية (منجز/جارٍ/معلّق) مع أزرار إجراء
 * مباشرة وشريط تقدم متحرك وقسم «ماذا يفتح لك الاعتماد».
 * تُستبدل بتنبيه «قيد المراجعة» النصي الثابت.
 *
 * AccountStatusBanner: لافتة حالة موحدة أنيقة لكل الأدوار
 * (معتمد/قيد الاعتماد/موقوف/مرفوض) بلغة تصميم مطابقة للقائمة.
 */

import Link from 'next/link'
import {
  BadgeCheck,
  Check,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  FileUp,
  Hourglass,
  IdCard,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ============================ أنواع مشتركة ============================

type ChecklistStatus = 'PENDING' | 'REJECTED' | 'APPROVED'
type BannerStatus = 'PENDING' | 'APPROVED' | 'SUSPENDED' | 'REJECTED'

interface VerificationChecklistProps {
  status: ChecklistStatus
  role: 'NURSE' | 'DOCTOR'
  /** عدّادات المستندات الحية — من /api/stats */
  documents: {
    uploaded: number
    pending: number
    approved: number
    rejected: number
  }
  /** رابط صفحة إدارة المستندات حسب الدور */
  documentsHref: string
  /** إعادة التقديم بعد الرفض (نفس منطق /api/me/documents/resubmit) */
  onResubmit?: () => void
  resubmitting?: boolean
  className?: string
}

// ============================ عناصر مساعدة ============================

/** حالة الخطوة داخل السير */
type StepTone = 'done' | 'current' | 'todo' | 'error'

const STEP_CIRCLE: Record<StepTone, string> = {
  done: 'border-transparent bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/25',
  current:
    'border-amber-400 bg-amber-50 text-amber-600 shadow-[0_0_0_6px_rgba(251,191,36,0.12)] animate-pulse',
  todo: 'border-dashed border-muted-foreground/30 bg-muted text-muted-foreground/50',
  error: 'border-red-300 bg-red-50 text-red-600 shadow-[0_0_0_6px_rgba(239,68,68,0.08)]',
}

/** شارة حالة صغيرة أعلى كل خطوة */
function StepStateChip({ tone, label }: { tone: StepTone; label: string }) {
  const styles: Record<StepTone, string> = {
    done: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    current: 'bg-amber-50 text-amber-700 border-amber-200',
    todo: 'bg-muted text-muted-foreground border-border',
    error: 'bg-red-50 text-red-700 border-red-200',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold leading-none',
        styles[tone]
      )}
    >
      {label}
    </span>
  )
}

/** خطوة واحدة داخل السير — دائرة أيقونة + خط رابط + محتوى */
function Step({
  tone,
  icon: Icon,
  isLast,
  children,
}: {
  tone: StepTone
  icon: React.ComponentType<{ className?: string }>
  isLast?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="relative flex gap-4">
      {/* العمود الأيمن: دائرة الخطوة + الخط الرابط */}
      <div className="flex flex-col items-center">
        <span
          className={cn(
            'relative z-10 flex size-11 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-500',
            STEP_CIRCLE[tone]
          )}
        >
          <Icon className="size-5" />
        </span>
        {!isLast && <span className="my-1 w-0.5 flex-1 rounded-full bg-border" />}
      </div>
      {/* المحتوى */}
      <div className={cn('min-w-0 flex-1 pb-6 pt-0.5', isLast && 'pb-0')}>{children}</div>
    </div>
  )
}

// ============================ قائمة التحقق ============================

export function VerificationChecklist({
  status,
  role,
  documents,
  documentsHref,
  onResubmit,
  resubmitting = false,
  className,
}: VerificationChecklistProps) {
  const staffLabel = role === 'DOCTOR' ? 'الطبيب' : 'الكادر التمريضي'
  const docsUploaded = documents.uploaded > 0

  // شريط التقدم: الخطوة 1 منجزة دائماً (34٪) — رفع المستندات (33٪) — الاعتماد (33٪)
  const percent = 34 + (docsUploaded ? 33 : 0) + (status === 'APPROVED' ? 33 : 0)

  const step2Tone: StepTone = docsUploaded ? 'done' : 'current'
  const step3Tone: StepTone =
    status === 'APPROVED' ? 'done' : status === 'REJECTED' ? 'error' : 'current'

  return (
    <section
      dir="rtl"
      className={cn(
        'relative overflow-hidden rounded-3xl border bg-card shadow-sm',
        status === 'REJECTED' && 'border-red-200/70',
        className
      )}
    >
      {/* زخارف خلفية ناعمة */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-20 -top-24 size-64 rounded-full bg-gradient-to-br from-teal-500 to-emerald-400 opacity-[0.07]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -right-16 size-52 rounded-full bg-gradient-to-br from-teal-400 to-cyan-400 opacity-[0.06]"
      />

      {/* ---------- الترويسة + النسبة ---------- */}
      <div className="relative flex items-start justify-between gap-4 p-6 pb-0">
        <div className="flex items-start gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-500 text-white shadow-lg shadow-teal-500/20">
            <ShieldCheck className="size-6" />
          </span>
          <div>
            <h2 className="text-lg font-extrabold leading-snug">رحلة توثيق حسابك</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {status === 'REJECTED'
                ? 'لم يكتمل التوثيق في آخر مراجعة — أكمل الخطوة الناقصة ثم أعد التقديم'
                : 'ثلاث خطوات بسيطة تفصلك عن تفعيل كل خدمات المنصة'}
            </p>
          </div>
        </div>
        <span
          dir="ltr"
          className="shrink-0 rounded-full border border-teal-200 bg-teal-50 px-3 py-1.5 text-sm font-extrabold tabular-nums text-teal-700"
        >
          {percent}%
        </span>
      </div>

      {/* ---------- شريط التقدم المتحرك ---------- */}
      <div className="relative mx-6 mt-4 h-2.5 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-gradient-to-l from-teal-500 via-teal-400 to-emerald-400 transition-all duration-700 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* ---------- الخطوات ---------- */}
      <div className="relative p-6">
        {/* الخطوة 1: إنشاء الحساب — منجزة دائماً */}
        <Step tone="done" icon={Check}>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold">إنشاء الحساب</p>
            <StepStateChip tone="done" label="منجزة" />
          </div>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            تم إنشاء حسابك كـ{staffLabel} بنجاح في منصة تكليفات — خطوتك الأولى اكتملت.
          </p>
        </Step>

        {/* الخطوة 2: رفع المستندات */}
        <Step tone={step2Tone} icon={docsUploaded ? Check : FileUp}>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold">رفع المستندات الأساسية</p>
            <StepStateChip
              tone={step2Tone}
              label={docsUploaded ? 'مكتملة' : 'مطلوبة الآن'}
            />
          </div>

          {docsUploaded ? (
            <>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                مستنداتك مرفوعة وتتولى الإدارة مراجعتها — يمكنك إضافة مستندات أخرى تقوّي ملفك
                المهني في أي وقت.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border bg-secondary/60 px-2.5 py-1 text-[11px] font-bold">
                  <FileUp className="size-3 text-teal-600" />
                  {documents.uploaded} مرفوع
                </span>
                {documents.pending > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                    <Hourglass className="size-3" />
                    {documents.pending} بانتظار المراجعة
                  </span>
                )}
                {documents.approved > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                    <CheckCircle2 className="size-3" />
                    {documents.approved} معتمد
                  </span>
                )}
                {documents.rejected > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700">
                    <ShieldAlert className="size-3" />
                    {documents.rejected} يحتاج إعادة رفع
                  </span>
                )}
                <Button asChild variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
                  <Link href={documentsHref}>
                    إدارة المستندات
                    <span aria-hidden>←</span>
                  </Link>
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                ارفع صورة الهوية وصورة المزاولة (وثيقة العمل) — لا تتم مراجعة الحساب قبل رفع
                المستندات، وهي شرط إلزامي للاعتماد دون استثناء.
              </p>
              <Button
                asChild
                size="sm"
                className="mt-3 gap-2 rounded-xl bg-gradient-to-l from-teal-600 to-emerald-500 text-white shadow-md shadow-teal-600/20 transition-all hover:shadow-lg hover:shadow-teal-600/30 active:scale-[0.98]"
              >
                <Link href={documentsHref}>
                  <FileUp className="size-4" />
                  ارفع مستنداتك الآن
                </Link>
              </Button>
            </>
          )}
        </Step>

        {/* الخطوة 3: مراجعة الإدارة واعتماد الحساب */}
        <Step tone={step3Tone} icon={status === 'REJECTED' ? ShieldAlert : status === 'APPROVED' ? Check : Hourglass} isLast>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold">مراجعة الإدارة واعتماد الحساب</p>
            <StepStateChip
              tone={step3Tone}
              label={status === 'REJECTED' ? 'مرفوض — يحتاج إجراء' : status === 'APPROVED' ? 'مكتملة' : 'بانتظار المراجعة'}
            />
          </div>

          {status === 'REJECTED' ? (
            <>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                لم يتم اعتماد الحساب في آخر مراجعة. حدّث مستنداتك أو أكمل الناقص ثم أعد تقديم
                حسابك للمراجعة — ويمكنك التواصل مع إدارة المنصة لمعرفة التفاصيل.
              </p>
              {onResubmit && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={onResubmit}
                  disabled={resubmitting}
                  className="mt-3 gap-2 rounded-xl"
                >
                  <RotateCcw className="size-4" />
                  {resubmitting ? 'جارٍ إعادة التقديم...' : 'إعادة التقديم للمراجعة'}
                </Button>
              )}
            </>
          ) : status === 'APPROVED' ? (
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              اعتمدت الإدارة حسابك رسمياً — كل خدمات المنصة مفتوحة لك الآن.
            </p>
          ) : (
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              حسابك الآن مع فريق الإدارة للمراجعة — سيصلك إشعار فوري فور اتخاذ القرار. الاعتماد
              يتم بعد التحقق من مستنداتك فقط.
            </p>
          )}
        </Step>
      </div>

      {/* ---------- ماذا يفتح لك الاعتماد؟ ---------- */}
      {status !== 'APPROVED' && (
        <div className="relative mx-6 mb-6 rounded-2xl border border-teal-100 bg-gradient-to-l from-teal-50 via-emerald-50/70 to-transparent p-4">
          <p className="text-sm font-extrabold text-teal-800">ماذا يفتح لك الاعتماد؟</p>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
            {[
              { icon: FileText, label: 'التقديم على التكليفات المتاحة' },
              { icon: ClipboardCheck, label: 'استلام التكليفات المسندة إليك' },
              { icon: IdCard, label: 'إصدار بطاقتك المهنية الرقمية' },
            ].map((b) => (
              <div key={b.label} className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white text-teal-600 shadow-sm ring-1 ring-teal-100">
                  <b.icon className="size-4" />
                </span>
                <p className="text-xs font-bold leading-snug text-teal-900/80">{b.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

// ============================ لافتة الحالة الموحدة ============================

const BANNER_TONES: Record<
  BannerStatus,
  { icon: React.ComponentType<{ className?: string }>; iconBg: string; wrap: string; title: string; pulse?: boolean }
> = {
  APPROVED: {
    icon: BadgeCheck,
    iconBg: 'from-emerald-500 to-teal-500 shadow-emerald-500/25',
    wrap: 'border-emerald-200/80',
    title: 'حسابك معتمد وموثق',
  },
  PENDING: {
    icon: Hourglass,
    iconBg: 'from-amber-500 to-orange-500 shadow-amber-500/25',
    wrap: 'border-amber-200/80',
    title: 'حسابك بانتظار اعتماد الإدارة',
    pulse: true,
  },
  SUSPENDED: {
    icon: ShieldAlert,
    iconBg: 'from-red-500 to-rose-500 shadow-red-500/25',
    wrap: 'border-red-200/80',
    title: 'تم إيقاف حسابك مؤقتاً',
  },
  REJECTED: {
    icon: ShieldAlert,
    iconBg: 'from-red-500 to-rose-500 shadow-red-500/25',
    wrap: 'border-red-200/80',
    title: 'لم يتم اعتماد حسابك',
  },
}

export function AccountStatusBanner({
  status,
  featureLabel = 'هذه الميزة',
  pendingDescription,
  approvedDescription,
  suspendedDescription,
  className,
}: {
  status: BannerStatus
  /** اسم الميزة المقيدة قبل الاعتماد — مثال: «إنشاء التكليفات» */
  featureLabel?: string
  pendingDescription?: string
  approvedDescription?: string
  suspendedDescription?: string
  className?: string
}) {
  if (!BANNER_TONES[status]) return null
  const tone = BANNER_TONES[status]
  const Icon = tone.icon

  const description =
    status === 'APPROVED'
      ? (approvedDescription ?? 'يمكنك استخدام جميع خدمات المنصة الآن.')
      : status === 'PENDING'
        ? (pendingDescription ??
          `يمكنك تسجيل الدخول ومتابعة حسابك فوراً — لكن ${featureLabel} غير متاحة إلا بعد اعتماد حسابك من إدارة المنصة. سيصلك إشعار فور الاعتماد.`)
        : status === 'SUSPENDED'
          ? (suspendedDescription ??
            'لا يمكنك استخدام خدمات المنصة حالياً — يرجى التواصل مع إدارة المنصة.')
          : 'يرجى التواصل مع إدارة المنصة لمعرفة تفاصيل القرار.'

  return (
    <section
      dir="rtl"
      className={cn(
        'relative overflow-hidden rounded-2xl border bg-card p-5 shadow-sm',
        tone.wrap,
        className
      )}
    >
      {/* زخرفة ناعمة */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-10 -top-14 size-40 rounded-full bg-current opacity-[0.04]"
      />
      <div className="relative flex items-start gap-4">
        <span
          className={cn(
            'flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg',
            tone.iconBg,
            tone.pulse && 'animate-pulse'
          )}
        >
          <Icon className="size-5.5" />
        </span>
        <div className="min-w-0 pt-0.5">
          <p className="text-[0.95rem] font-extrabold leading-snug">{tone.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
    </section>
  )
}
