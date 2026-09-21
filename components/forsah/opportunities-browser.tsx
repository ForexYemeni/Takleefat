'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Banknote,
  Ban,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Coins,
  HeartPulse,
  Hourglass,
  ImagePlus,
  Inbox,
  MapPin,
  Search,
  Send,
  Sparkles,
  Stethoscope,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetcher, apiPatch, apiPost } from '@/lib/api-client'
import { FORSAH_CURRENCY_SYMBOLS, OPPORTUNITY_PAYMENT_TIMING_LABELS } from '@/lib/forsah/constants'
import { cn, formatDate, formatCurrency } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  EligibilityPanel,
  ApplicationTimeline,
  ForsahBadge,
  ForsahErrorState,
  formatSalary,
  SALARY_TYPE_AR,
  InfoChip,
} from '@/components/forsah/opportunity-visuals'
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value'

/**
 * متصفح «فرصة» للكادر الصحيي والأطباء — الجولة 66 | تكليفات | Takleefat
 * ============================================================
 * تبويب «الفرص المناسبة لك»: فرص مؤهلة حصراً من الخادم (Eligibility Engine)
 * + بحث + تفاصيل Premium + التقديم مع منع التكرار.
 * تبويب «فرصي»: كل طلباته بحالاته + خط زمني + دعوات المقابلة بتأكيد/اعتذار.
 */

/** الجولة 70 — معاينة رسوم الخدمة المعروضة للمرشح قبل التقديم — شفافية كاملة */
interface FeePreview {
  feeType: 'PERCENTAGE' | 'FIXED'
  feePercent: number | null
  feeAmount: number
  currency: string
  hasSalary: boolean
}

interface OpportunityLite {
  id: string
  number: number
  title: string
  status: string
  audience: string
  salaryAmount: number | null
  salaryType: string
  salaryCurrency: string
  workStartTime: string | null
  workEndTime: string | null
  gender: string
  vacations: string | null
  procedureSharePercent: number | null
  positionsNeeded: number
  minYearsExperience: number | null
  requiredDocuments: string[]
  description: string | null
  responsibilities: string | null
  benefits: string | null
  notes: string | null
  publishedAt: string | null
  createdAt: string
  hospital: { name: string; location: string | null; city: string | null }
  specialty: { name: string } | null
  department: { name: string } | null
  qualification: { name: string } | null
  applications?: Array<{ id: string; status: string; createdAt: string }>
  feePreview?: FeePreview | null
}

interface DetailPayload {
  opportunity: OpportunityLite
  viewer: string
  eligibility: { eligible: boolean; checks: Array<{ ok: boolean; blocking: boolean; text: string }> }
  myApplication: { id: string; status: string; createdAt: string } | null
  feePreview?: FeePreview | null
  canApply: boolean
}

interface MyApplication {
  id: string
  status: string
  createdAt: string
  selected: boolean
  opportunityClosed: boolean
  opportunity: {
    id: string
    number: number
    title: string
    status: string
    hospitalName: string
    location: string | null
    specialtyName: string | null
    departmentName: string | null
    salaryAmount: number | null
    salaryType: string
    salaryCurrency: string
  }
  interviews: Array<{
    id: string
    scheduledDate: string
    scheduledTime: string
    modeLabel: string
    location: string | null
    address: string | null
    mapUrl: string | null
    notes: string | null
    response: string
  }>
  /** الجولة 70 — بيانات الدفع بعد الاختيار — null = بلا رسوم (راتب حسب الاتفاق) */
  payment?: {
    feeAmount: number
    currency: string
    feeType: string
    feePercent: number | null
    status: string
    statusLabel: string
    paymentTiming: string | null
    paymentTimingLabel: string | null
    paymentTimingChosenAt: string | null
    paymentDueAt: string | null
    // الجولة 71: حالة إثبات الدفع — مرفوع/بانتظار تأكيد الإدارة/مرفوض بسبب
    paymentProofUrl: string | null
    paymentProofFileName: string | null
    paymentProofUploadedAt: string | null
    paymentProofRejectionNote: string | null
  } | null
}

const GENDER_AR: Record<string, string> = { MALE: 'ذكور', FEMALE: 'إناث', ANY: 'الجنسان' }

/** الجولة 70 — خيارات توقيت سداد الرسوم بعد الاختيار */
const PAYMENT_TIMING_OPTIONS: Array<{
  value: 'WITHIN_FIRST_TEN_DAYS' | 'DIRECT' | 'AFTER_THREE_DAYS'
  label: string
  hint: string
}> = [
  {
    value: 'WITHIN_FIRST_TEN_DAYS',
    label: OPPORTUNITY_PAYMENT_TIMING_LABELS.WITHIN_FIRST_TEN_DAYS,
    hint: 'سداد مرن خلال أول 10 أيام من بدء الدوام',
  },
  {
    value: 'DIRECT',
    label: OPPORTUNITY_PAYMENT_TIMING_LABELS.DIRECT,
    hint: 'يستحق فوراً عند الاختيار',
  },
  {
    value: 'AFTER_THREE_DAYS',
    label: OPPORTUNITY_PAYMENT_TIMING_LABELS.AFTER_THREE_DAYS,
    hint: 'يستحق بعد ثلاثة أيام من لحظة الاختيار',
  },
]

/** نص الرسوم المعروض للمرشح — نسبة أو ثابت مع الرمز */
function feeText(fp: FeePreview): string {
  const cur = FORSAH_CURRENCY_SYMBOLS[fp.currency] ?? fp.currency
  if (fp.feeType === 'PERCENTAGE' && fp.feePercent != null) {
    return `${fp.feePercent}٪ من الراتب ≈ ${fp.feeAmount.toLocaleString('ar-YE')} ${cur}`
  }
  return `${fp.feeAmount.toLocaleString('ar-YE')} ${cur}`
}

export function OpportunitiesBrowser({ basePath }: { basePath: '/nurse/opportunities' | '/doctor/opportunities' }) {
  const [tab, setTab] = useState<'matches' | 'mine'>('matches')
  const [q, setQ] = useState('')
  // الجولة 67: البحث المؤجل — لا استعلام جديد مع كل حرف (كان سبباً رئيسياً في وميض المحتوى)
  const dq = useDebouncedValue(q, 300)
  const [detailId, setDetailId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const matches = useQuery({
    queryKey: ['forsah-matches', dq],
    queryFn: () =>
      apiFetcher<{ opportunities: OpportunityLite[]; total: number }>(
        `/api/opportunities?page=1&take=30${dq ? `&q=${encodeURIComponent(dq)}` : ''}`
      ),
    // الجولة 67: تُبقى القائمة السابقة معروضة أثناء الجلب — لا انزلاق للهيكل العظمي
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: 1,
  })

  const mine = useQuery({
    queryKey: ['forsah-mine'],
    queryFn: () => apiFetcher<{ applications: MyApplication[] }>('/api/me/opportunities'),
    enabled: tab === 'mine',
    staleTime: 15_000,
    retry: 1,
  })

  const detail = useQuery({
    queryKey: ['forsah-detail', detailId],
    queryFn: () => apiFetcher<DetailPayload>(`/api/opportunities/${detailId}`),
    enabled: !!detailId,
  })

  const applyMutation = useMutation({
    mutationFn: (id: string) => apiPost<{ message: string }>(`/api/opportunities/${id}/apply`, {}),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['forsah-matches'] })
      queryClient.invalidateQueries({ queryKey: ['forsah-detail'] })
      queryClient.invalidateQueries({ queryKey: ['forsah-mine'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const respondMutation = useMutation({
    mutationFn: ({ interviewId, response }: { interviewId: string; response: 'CONFIRMED' | 'DECLINED' }) =>
      apiPost<{ message: string }>(`/api/opportunities/interviews/${interviewId}/respond`, { response }),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['forsah-mine'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="space-y-5" data-forsah-page>
      {/* ---------- الترويسة — هوية فرصة البنفسجية فوق هوية تكليفات ---------- */}
      <header className="relative overflow-hidden rounded-3xl border bg-gradient-to-l from-[#1e1b4b] via-[#312e81] to-[#4c1d95] p-6 text-white shadow-lg">
        <div className="pointer-events-none absolute -end-16 -top-16 size-48 rounded-full bg-violet-500/25 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -start-10 bottom-0 size-36 rounded-full bg-sky-400/20 blur-3xl" aria-hidden />
        <div className="relative">
          <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-violet-200">
            <Sparkles className="size-3.5" />
            تكليفات — قسم فرصة
          </p>
          <h1 className="mt-1 text-2xl font-black md:text-3xl">فرص العمل الصحية</h1>
          <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-violet-100/90">
            فرص وظيفية معلنة من الجهات الصحية — تظهر لك حصراً الفرص المطابقة لملفك المهني وتخصصك
          </p>
        </div>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'matches' | 'mine')}>
        <TabsList className="w-full max-w-sm grid grid-cols-2">
          <TabsTrigger value="matches" className="gap-1.5 text-xs">
            <Sparkles className="size-3.5" />
            المناسبة لك
          </TabsTrigger>
          <TabsTrigger value="mine" className="gap-1.5 text-xs">
            <Inbox className="size-3.5" />
            فرصي
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* ---------- البحث ---------- */}
      {tab === 'matches' && (
        <div className="relative">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث باسم الفرصة أو الجهة الصحية أو التخصص..."
            className="h-11 rounded-xl ps-9"
          />
        </div>
      )}

      {/* ---------- قائمة الفرص المؤهلة ---------- */}
      {tab === 'matches' && (
        <section className="space-y-3">
          {/* الجولة 67: حالة الخطأ صريحة برسالة حقيقية وإعادة محاولة — بدل الاختفاء الصامت */}
          {matches.isError ? (
            <ForsahErrorState
              message={(matches.error as Error | null)?.message}
              onRetry={() => matches.refetch()}
            />
          ) : matches.isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-40 rounded-3xl" />
              ))}
            </div>
          ) : (matches.data?.opportunities.length ?? 0) === 0 ? (
            <EmptyState
              icon={Sparkles}
              title={q ? 'لا نتائج مطابقة للبحث' : 'لا توجد فرص مناسبة لك حالياً'}
              note={
                q
                  ? 'جرّب كلمات بحث أخرى أو امسح البحث'
                  : 'أول ما تُنشر فرصة مطابقة لملفك المهني ستظهر هنا فوراً — تأكد من اكتمال مستنداتك وبياناتك'
              }
            />
          ) : (
            matches.data!.opportunities.map((o) => (
              <OpportunityCard
                key={o.id}
                opportunity={o}
                myStatus={o.applications?.[0]?.status ?? null}
                onOpen={() => setDetailId(o.id)}
              />
            ))
          )}
        </section>
      )}

      {/* ---------- فرصي ---------- */}
      {tab === 'mine' && (
        <section className="space-y-3">
          {mine.isError ? (
            <ForsahErrorState
              message={(mine.error as Error | null)?.message}
              onRetry={() => mine.refetch()}
            />
          ) : mine.isLoading ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-32 rounded-3xl" />
              ))}
            </div>
          ) : (mine.data?.applications.length ?? 0) === 0 ? (
            <EmptyState
              icon={Inbox}
              title="لم تقدم على أي فرصة بعد"
              note="تصفح تبويب «المناسبة لك» وقدّم على الفرص المطابقة لملفك"
            />
          ) : (
            mine.data!.applications.map((a) => (
              <MyApplicationCard
                key={a.id}
                application={a}
                onRespond={(response) => {
                  const pending = a.interviews.find((i) => i.response === 'PENDING')
                  if (pending) respondMutation.mutate({ interviewId: pending.id, response })
                }}
                onOpen={() => setDetailId(a.opportunity.id)}
              />
            ))
          )}
        </section>
      )}

      {/* ---------- حوار تفاصيل الفرصة ---------- */}
      <Dialog open={!!detailId} onOpenChange={(open) => !open && setDetailId(null)}>
        <DialogContent className="max-h-[88vh] overflow-y-auto rounded-3xl p-0 sm:max-w-lg" dir="rtl">
          {detail.isLoading || !detail.data ? (
            <div className="space-y-3 p-6">
              <Skeleton className="h-8 w-3/4 rounded-xl" />
              <Skeleton className="h-40 rounded-2xl" />
              <Skeleton className="h-24 rounded-2xl" />
            </div>
          ) : (
            <DetailContent
              data={detail.data}
              applying={applyMutation.isPending}
              onApply={() => applyMutation.mutate(detail.data!.opportunity.id)}
              onClose={() => setDetailId(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ---------------- بطاقة فرصة ---------------- */

function OpportunityCard({
  opportunity: o,
  myStatus,
  onOpen,
}: {
  opportunity: OpportunityLite
  myStatus: string | null
  onOpen: () => void
}) {
  const salary = formatSalary(o.salaryAmount, o.salaryType, o.salaryCurrency)
  return (
    <article className="group relative overflow-hidden rounded-3xl border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-violet-500 via-sky-400 to-emerald-400" aria-hidden />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-200">
                فرصة رقم {o.number}
              </Badge>
              {myStatus && <ForsahBadge status={myStatus} kind="application" />}
            </div>
            <h3 className="mt-1.5 truncate text-base font-black" title={o.title}>
              {o.title}
            </h3>
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs font-bold text-muted-foreground">
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">{o.hospital.name}</span>
              {o.hospital.city && <span className="shrink-0 text-muted-foreground/60">— {o.hospital.city}</span>}
            </p>
          </div>
          <div className="shrink-0 text-end">
            <p className="text-lg font-black text-[var(--role-accent-strong)] dark:text-[var(--role-accent-glow)]">
              {salary.main}
            </p>
            {salary.suffix && <p className="text-[10px] font-bold text-muted-foreground">{salary.suffix}</p>}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {o.audience && (
            <InfoChip icon={o.audience === 'DOCTOR' ? Stethoscope : Users}>
              {o.audience === 'DOCTOR' ? 'طبيب' : 'كادر صحي'}
            </InfoChip>
          )}
          {o.specialty && <InfoChip icon={HeartPulse}>{o.specialty.name}</InfoChip>}
          {o.department && <InfoChip icon={Briefcase}>{o.department.name}</InfoChip>}
          {o.workStartTime && o.workEndTime && (
            <InfoChip icon={Clock}>
              {o.workStartTime} — {o.workEndTime}
            </InfoChip>
          )}
          <InfoChip icon={Users}>{GENDER_AR[o.gender] ?? 'الجنسان'}</InfoChip>
          {/* الجولة 70: شفافية الرسوم — تظهر قبل التقديم على كل بطاقة */}
          {o.feePreview && o.feePreview.hasSalary && o.feePreview.feeAmount > 0 && (
            <InfoChip icon={Banknote}>رسوم الخدمة: {feeText(o.feePreview)}</InfoChip>
          )}
          {o.vacations && <InfoChip icon={CalendarClock}>{o.vacations.slice(0, 40)}</InfoChip>}
          {o.procedureSharePercent != null && (
            <InfoChip icon={Coins}>{o.procedureSharePercent}٪ من الإجراءات</InfoChip>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold text-muted-foreground/70">
            نُشرت {o.publishedAt ? formatDate(o.publishedAt) : formatDate(o.createdAt)}
          </p>
          <Button size="sm" className="rounded-xl bg-gradient-to-l from-violet-600 to-violet-500 text-white shadow-sm hover:from-violet-700 hover:to-violet-600" onClick={onOpen}>
            عرض التفاصيل
            <ChevronLeft className="size-4" />
          </Button>
        </div>
      </div>
    </article>
  )
}

/* ---------------- محتوى التفاصيل ---------------- */

function DetailContent({
  data,
  applying,
  onApply,
  onClose,
}: {
  data: DetailPayload
  applying: boolean
  onApply: () => void
  onClose: () => void
}) {
  const o = data.opportunity
  const salary = formatSalary(o.salaryAmount, o.salaryType, o.salaryCurrency)
  const closed = o.status === 'CLOSED' || o.status === 'ARCHIVED' || o.status === 'PAUSED'

  return (
    <div className="space-y-4 p-6" dir="rtl">
      <DialogHeader className="space-y-1 text-start">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-200">
            فرصة رقم {o.number}
          </Badge>
          <ForsahBadge status={o.status} />
        </div>
        <DialogTitle className="text-lg font-black leading-snug">{o.title}</DialogTitle>
        <DialogDescription className="flex items-center gap-1 text-xs font-bold">
          <MapPin className="size-3" />
          {o.hospital.name}
          {o.hospital.location ? ` — ${o.hospital.location}` : ''}
        </DialogDescription>
      </DialogHeader>

      {/* شبكة البيانات */}
      <div className="grid grid-cols-2 gap-2.5 text-xs">
        <DetailField label="الراتب" value={salary.suffix ? `${salary.main} ${salary.suffix}` : salary.main} strong />
        <DetailField label="الجنس المطلوب" value={GENDER_AR[o.gender] ?? 'الجنسان'} />
        <DetailField label="نوع الكادر" value={o.audience === 'DOCTOR' ? 'طبيب' : 'كادر صحي'} />
        <DetailField label="عدد الموظفين المطلوب" value={String(o.positionsNeeded)} />
        {o.specialty && <DetailField label="التخصص" value={o.specialty.name} />}
        {o.department && <DetailField label="القسم" value={o.department.name} />}
        {o.qualification && <DetailField label="المؤهل" value={o.qualification.name} />}
        {o.minYearsExperience != null && o.minYearsExperience > 0 && (
          <DetailField label="الخبرة الدنيا" value={`${o.minYearsExperience} سنوات`} />
        )}
        {o.workStartTime && o.workEndTime && (
          <DetailField label="ساعات الدوام" value={`${o.workStartTime} — ${o.workEndTime}`} />
        )}
        {o.procedureSharePercent != null && (
          <DetailField label="نسبة الإجراءات" value={`${o.procedureSharePercent}٪`} />
        )}
        {o.vacations && <DetailField label="الإجازات" value={o.vacations} />}
      </div>

      {(o.description || o.responsibilities || o.benefits || o.notes) && (
        <div className="space-y-2.5 rounded-2xl bg-muted/50 p-4">
          {o.description && <DetailParagraph title="وصف الفرصة" text={o.description} />}
          {o.responsibilities && <DetailParagraph title="المهام والمسؤوليات" text={o.responsibilities} />}
          {o.benefits && <DetailParagraph title="المزايا" text={o.benefits} />}
          {o.notes && <DetailParagraph title="ملاحظات" text={o.notes} />}
          {o.requiredDocuments.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-black text-muted-foreground">المستندات المطلوبة</p>
              <div className="flex flex-wrap gap-1.5">
                {o.requiredDocuments.map((d) => (
                  <Badge key={d} variant="outline" className="text-[10px] font-bold">
                    {d}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* أهلية المستخدم */}
      <EligibilityPanel checks={data.eligibility.checks} eligible={data.eligibility.eligible} />

      {/* الجولة 70: شفافية الرسوم قبل التقديم — صندوق مخصص واضح */}
      {data.feePreview && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-800/60 dark:bg-amber-950/20">
          <p className="flex items-center gap-1.5 text-xs font-black text-amber-800 dark:text-amber-200">
            <Banknote className="size-4" />
            رسوم الخدمة — شفافية كاملة قبل التقديم
          </p>
          {data.feePreview.hasSalary && data.feePreview.feeAmount > 0 ? (
            <div className="mt-2 space-y-1 text-xs font-bold text-muted-foreground">
              <p>
                نوع الرسوم:{' '}
                <span className="font-black text-foreground">
                  {data.feePreview.feeType === 'PERCENTAGE' ? `نسبة من الراتب (${data.feePreview.feePercent}٪)` : 'مبلغ ثابت'}
                </span>
              </p>
              <p>
                المبلغ المطلوب منك لهذه الفرصة:{' '}
                <span className="font-black text-foreground">{feeText(data.feePreview)}</span>
              </p>
              <p>
                تُستحق الرسوم فقط عند اختيارك للفرصة، وتسدّد وفق التوقيت الذي تختاره بعد الاختيار:
                أول 10 أيام من الدوام، أو دفع مباشر، أو بعد 3 أيام — من صفحة «فرصي».
              </p>
            </div>
          ) : (
            <p className="mt-1.5 text-xs font-bold text-muted-foreground">
              الراتب غير محدد (حسب الاتفاق) — تُحدد رسوم الخدمة وقت الاختيار وفق سياسة المنصة المعلنة.
            </p>
          )}
        </div>
      )}

      {/* حالة التقديم السابق / زر التقديم */}
      {data.myApplication ? (
        <div className="flex items-center justify-between gap-2 rounded-2xl border bg-emerald-50/50 p-4 dark:bg-emerald-950/20">
          <div>
            <p className="text-sm font-black">لقد قدمت على هذه الفرصة مسبقاً</p>
            <p className="mt-0.5 text-xs font-bold text-muted-foreground">
              بتاريخ {formatDate(data.myApplication.createdAt)}
            </p>
          </div>
          <ForsahBadge status={data.myApplication.status} kind="application" />
        </div>
      ) : closed ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 text-center text-sm font-black text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
          {o.status === 'PAUSED' ? 'الفرصة متوقفة مؤقتاً — لا تقديم حالياً' : 'هذه الفرصة مغلقة ولم تعد متاحة للتقديم.'}
        </div>
      ) : data.canApply ? (
        <div className="space-y-1.5">
          <Button
            className="h-12 w-full rounded-2xl bg-gradient-to-l from-violet-600 to-violet-500 text-base font-black text-white shadow-md hover:from-violet-700 hover:to-violet-600"
            onClick={onApply}
            disabled={applying}
          >
            <Send className="size-4.5" />
            {applying ? 'جارٍ إرسال الطلب...' : 'قدّم الآن'}
          </Button>
          <p className="text-center text-[10px] font-bold text-muted-foreground">
            بالضغط على «قدّم الآن» أنت توافق على رسوم الخدمة الموضحة أعلاه
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-center text-sm font-black text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          لا يمكنك التقديم على هذه الفرصة — راجع قائمة المطابقة أعلاه
        </div>
      )}
    </div>
  )
}

function DetailField({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl border bg-card p-2.5">
      <p className="text-[10px] font-bold text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 truncate font-bold', strong && 'text-sm text-[var(--role-accent-strong)] dark:text-[var(--role-accent-glow)]')} title={value}>
        {value}
      </p>
    </div>
  )
}

function DetailParagraph({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <p className="text-[11px] font-black text-muted-foreground">{title}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed" style={{ overflowWrap: 'anywhere' }}>
        {text}
      </p>
    </div>
  )
}

/* ---------------- بطاقة فرصي ---------------- */

function MyApplicationCard({
  application: a,
  onRespond,
  onOpen,
}: {
  application: MyApplication
  onRespond: (response: 'CONFIRMED' | 'DECLINED') => void
  onOpen: () => void
}) {
  const salary = formatSalary(a.opportunity.salaryAmount, a.opportunity.salaryType, a.opportunity.salaryCurrency)
  const pendingInterview = a.interviews.find((i) => i.response === 'PENDING')
  const latestInterview = a.interviews[a.interviews.length - 1]

  return (
    <article className="overflow-hidden rounded-3xl border bg-card shadow-sm">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-black" title={a.opportunity.title}>
              {a.opportunity.title}
            </h3>
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs font-bold text-muted-foreground">
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">{a.opportunity.hospitalName}</span>
            </p>
          </div>
          <div className="shrink-0 text-end">
            <ForsahBadge status={a.status} kind="application" />
            <p className="mt-1 text-xs font-black text-[var(--role-accent-strong)] dark:text-[var(--role-accent-glow)]">
              {salary.main}
            </p>
          </div>
        </div>

        {/* الجولة 70: بيانات الدفع بعد الاختيار + اختيار توقيت السداد */}
        {a.selected && <PaymentCard applicationId={a.id} payment={a.payment ?? null} />}

        {/* دعوة مقابلة بانتظار الرد */}
        {pendingInterview && (
          <div className="mt-3 rounded-2xl border border-violet-200 bg-violet-50/70 p-3.5 dark:border-violet-800 dark:bg-violet-950/30">
            <p className="flex items-center gap-1.5 text-xs font-black text-violet-800 dark:text-violet-200">
              <CalendarClock className="size-4" />
              دعوة مقابلة — بانتظار ردك
            </p>
            <div className="mt-2 space-y-1 text-xs font-bold text-muted-foreground">
              <p>
                {formatDate(pendingInterview.scheduledDate)} — الساعة {pendingInterview.scheduledTime} ({pendingInterview.modeLabel})
              </p>
              {pendingInterview.location && <p>المكان: {pendingInterview.location}</p>}
              {pendingInterview.address && <p style={{ overflowWrap: 'anywhere' }}>{pendingInterview.address}</p>}
              {pendingInterview.notes && <p style={{ overflowWrap: 'anywhere' }}>{pendingInterview.notes}</p>}
            </div>
            {pendingInterview.mapUrl && (
              <a
                href={pendingInterview.mapUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs font-black text-violet-700 underline-offset-2 hover:underline dark:text-violet-300"
              >
                فتح الخريطة
              </a>
            )}
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                className="flex-1 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => onRespond('CONFIRMED')}
              >
                <CheckCircle2 className="size-4" />
                تأكيد الحضور
              </Button>
              <Button size="sm" variant="outline" className="flex-1 rounded-xl" onClick={() => onRespond('DECLINED')}>
                <X className="size-4" />
                عدم الحضور
              </Button>
            </div>
          </div>
        )}

        {/* مقابلة مؤكدة */}
        {!pendingInterview && latestInterview && latestInterview.response === 'CONFIRMED' && (
          <div className="mt-3 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs font-black text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
            <CalendarClock className="size-4" />
            مقابلة مؤكدة: {formatDate(latestInterview.scheduledDate)} — الساعة {latestInterview.scheduledTime}
            {latestInterview.location ? ` — ${latestInterview.location}` : ''}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold text-muted-foreground/70">
            قُدّم بتاريخ {formatDate(a.createdAt)}
            {a.opportunityClosed && ' — الفرصة مغلقة (طلباتك محفوظة)'}
          </p>
          <Button size="sm" variant="outline" className="rounded-xl" onClick={onOpen}>
            الخط الزمني والتفاصيل
            <ChevronLeft className="size-4" />
          </Button>
        </div>
      </div>
    </article>
  )
}

/* ---------------- بطاقة الدفع بعد الاختيار (الجولة 70) ---------------- */

function PaymentCard({
  applicationId,
  payment,
}: {
  applicationId: string
  payment: MyApplication['payment']
}) {
  const queryClient = useQueryClient()
  const timingMutation = useMutation({
    mutationFn: (timing: string) =>
      apiPatch<{ message: string }>('/api/me/opportunity-payments', { applicationId, timing }),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['forsah-mine'] })
      // الجولة 71: تفعيل البوابة الإلزامية فوراً بعد اختيار التوقيت —
      // بيانات حساب الإدارة ثم البطاقة الحاجبة (لا إغلاق إلا برفع الإثبات وتأكيد الإدارة)
      queryClient.invalidateQueries({ queryKey: ['forsah-payment-gate'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-800 dark:bg-emerald-950/25">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-black text-emerald-800 dark:text-emerald-200">
          <Wallet className="size-4" />
          بيانات الدفع — رسوم الخدمة
        </p>
        <Badge
          variant="secondary"
          className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200"
        >
          {payment ? payment.statusLabel : 'بلا رسوم'}
        </Badge>
      </div>

      {!payment ? (
        <p className="mt-1.5 text-xs font-bold text-muted-foreground">
          تم اختيارك لهذه الفرصة — لا توجد رسوم مسجلة عليك (راتب حسب الاتفاق).
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm font-black">
            <span className="text-xs font-bold text-muted-foreground">المبلغ المطلوب: </span>
            {payment.feeAmount.toLocaleString('ar-YE')}{' '}
            {FORSAH_CURRENCY_SYMBOLS[payment.currency] ?? payment.currency}
          </p>
          {payment.paymentTimingLabel ? (
            <div className="mt-1 space-y-1.5">
              <p className="text-xs font-bold text-muted-foreground">
                توقيت السداد المعتمد:{' '}
                <span className="font-black text-emerald-700 dark:text-emerald-300">
                  {payment.paymentTimingLabel}
                </span>
                {payment.paymentDueAt ? ` — يستحق ${formatDate(payment.paymentDueAt)}` : ''}
              </p>
              {/* الجولة 71: حالة بوابة السداد الإلزامية بعد اختيار التوقيت */}
              {payment.status === 'PAID' || payment.status === 'COMPLETED' ? (
                <p className="flex items-center gap-1.5 rounded-xl bg-emerald-100/80 px-3 py-2 text-[11px] font-black text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                  <CheckCircle2 className="size-3.5" />
                  تأكدت إدارة المنصة استلام الرسوم — سُددت كامل التزاماتك لهذه الفرصة
                </p>
              ) : payment.paymentProofUrl ? (
                <p className="flex items-center gap-1.5 rounded-xl bg-amber-100/80 px-3 py-2 text-[11px] font-black text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                  <Hourglass className="size-3.5" />
                  رُفع إثبات الدفع {payment.paymentProofUploadedAt ? `(${formatDate(payment.paymentProofUploadedAt)})` : ''} — بانتظار تأكيد إدارة المنصة
                </p>
              ) : payment.paymentProofRejectionNote ? (
                <p className="flex items-start gap-1.5 rounded-xl bg-red-100/80 px-3 py-2 text-[11px] font-black text-red-800 dark:bg-red-900/40 dark:text-red-200">
                  <Ban className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    رُفض إثبات الدفع — السبب: {payment.paymentProofRejectionNote} — أعد الدفع إن لم يصل وارفع إثباتاً جديداً من البطاقة الإلزامية
                  </span>
                </p>
              ) : (
                <p className="flex items-center gap-1.5 rounded-xl bg-amber-100/80 px-3 py-2 text-[11px] font-black text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                  <ImagePlus className="size-3.5" />
                  البطاقة الإلزامية مفعّلة — سدد المبلغ عبر حساب إدارة المنصة وأرفق إثبات الدفع منها (لا تُغلق إلا بتأكيد الإدارة)
                </p>
              )}
            </div>
          ) : (
            <div className="mt-2.5 space-y-1.5">
              <p className="text-xs font-black text-amber-700 dark:text-amber-300">
                اختر توقيت سداد رسومك — قرارك يُسجل ويُعتمد للجهة:
              </p>
              <div className="grid gap-1.5">
                {PAYMENT_TIMING_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={timingMutation.isPending}
                    onClick={() => timingMutation.mutate(opt.value)}
                    className="flex items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2 text-start transition-colors hover:border-emerald-400 hover:bg-emerald-50/60 disabled:opacity-50 dark:hover:bg-emerald-950/30"
                  >
                    <span>
                      <span className="block text-xs font-black">{opt.label}</span>
                      <span className="block text-[10px] font-bold text-muted-foreground">{opt.hint}</span>
                    </span>
                    <ChevronLeft className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ---------------- حالة فراغ موحدة ---------------- */

function EmptyState({
  icon: Icon,
  title,
  note,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  note: string
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed bg-card/60 px-6 py-14 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-violet-100 dark:bg-violet-950/50">
        <Icon className="size-7 text-violet-600 dark:text-violet-300" />
      </span>
      <p className="text-sm font-black">{title}</p>
      <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">{note}</p>
    </div>
  )
}
