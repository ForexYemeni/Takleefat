'use client'

import { useQuery } from '@tanstack/react-query'
import {
  Award,
  BadgeCheck,
  Briefcase,
  Building2,
  CalendarClock,
  FileText,
  GraduationCap,
  HeartPulse,
  Lock,
  MapPin,
  Phone,
  Printer,
  Star,
  Stethoscope,
  UserRound,
} from 'lucide-react'
import { apiFetcher } from '@/lib/api-client'
import { cn, formatDate } from '@/lib/utils'
import { AFFILIATION_STATUS_LABELS } from '@/lib/network'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { EligibilityPanel, ForsahErrorState } from '@/components/forsah/opportunity-visuals'

/**
 * السيرة الذاتية الاحترافية للمتقدم — الجولة 67 | ميزة «فرصة»
 * ============================================================
 * عرض ملف مهني متكامل بأسلوب سيرة ذاتية (Resume Layout) من الملف الحي
 * حصراً (لا نسخ بيانات): الترويسة، التعليم والخبرة، أقسام وتخصصات العمل،
 * جهات العمل السابقة بخط زمني، التقييمات بأبعادها الأربعة، رسالة التقديم،
 * ومطابقة الأهلية لحظة التقديم — مع الخصوصية (الهاتف مقنّع + المستندات بمنح إداري).
 */

interface CvPayload {
  application: {
    id: string
    status: string
    coverNote: string | null
    createdAt: string
    matchSnapshot: { eligible?: boolean; checks?: Array<{ ok: boolean; blocking: boolean; text: string }> } | null
  }
  opportunity: { id: string; title: string; audience: string }
  candidate: {
    id: string
    name: string
    photoUrl: string | null
    gender: string | null
    qualification: string | null
    yearsOfExperience: number | null
    accountStatus: string
    memberSince: string
    workTags: { departments: string[]; specialties: string[] }
    affiliations: Array<{ hospital: string; status: string; workYears: number | null }>
    ratings: Array<{ overall: number; punctuality: number; quality: number; communication: number; discipline: number; comment: string | null; createdAt: string }>
    avgRating: number | null
    phone: { phone: string | null; phoneMasked: string; phoneLocked: boolean }
    documentsState: 'granted' | 'locked'
    documents: Array<{ id: string; title: string; type: string; status: string; fileUrl: string }>
    selected: boolean
  }
  viewer: string
}

const GENDER_AR: Record<string, string> = { MALE: 'ذكر', FEMALE: 'أنثى' }
const DOC_STATUS_AR: Record<string, string> = {
  APPROVED: 'معتمد',
  PENDING: 'بانتظار الاعتماد',
  REJECTED: 'مرفوض',
}

export function CandidateCvDialog({
  applicationId,
  onClose,
}: {
  applicationId: string
  onClose: () => void
}) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['forsah-candidate-cv', applicationId],
    queryFn: () => apiFetcher<CvPayload>(`/api/opportunities/applications/${applicationId}`),
    staleTime: 30_000,
    retry: 1,
  })

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl p-0 sm:max-w-2xl" dir="rtl" aria-describedby={undefined}>
        {/* الجولة 67: عنوان الحوار حاضر دائماً لقارئات الشاشة — بصرياً ضمن ترويسة السيرة */}
        <DialogTitle className="sr-only">السيرة الذاتية للمتقدم</DialogTitle>
        {isError ? (
          <div className="p-6">
            <ForsahErrorState message={(error as Error | null)?.message} onRetry={() => refetch()} />
          </div>
        ) : isLoading || !data ? (
          <div className="space-y-4 p-6">
            <div className="flex items-center gap-4">
              <Skeleton className="size-20 rounded-2xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-36" />
              </div>
            </div>
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
          </div>
        ) : (
          <CandidateCv data={data} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function CandidateCv({ data }: { data: CvPayload }) {
  const c = data.candidate
  const isDoctor = data.opportunity.audience === 'DOCTOR'
  const roleLabel = isDoctor ? 'طبيب' : 'كادر تمريضي'
  const workTags = [...c.workTags.specialties, ...c.workTags.departments]

  // متوسطات أبعاد التقييم الأربعة
  const dims =
    c.ratings.length > 0
      ? {
          punctuality: avg(c.ratings.map((r) => r.punctuality)),
          quality: avg(c.ratings.map((r) => r.quality)),
          communication: avg(c.ratings.map((r) => r.communication)),
          discipline: avg(c.ratings.map((r) => r.discipline)),
        }
      : null

  return (
    <div className="space-y-0">
      {/* ---------- ترويسة السيرة الذاتية ---------- */}
      <div className="relative overflow-hidden rounded-t-3xl bg-gradient-to-bl from-[#1e1b4b] via-[#312e81] to-[#4c1d95] p-6 text-white">
        <div className="pointer-events-none absolute -end-14 -top-14 size-40 rounded-full bg-violet-500/25 blur-3xl" aria-hidden />
        <div className="relative flex flex-wrap items-center gap-4">
          {c.photoUrl ? (
            <img src={c.photoUrl} alt={c.name} className="size-20 shrink-0 rounded-2xl object-cover ring-2 ring-white/30" />
          ) : (
            <span className="flex size-20 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-2xl font-black ring-2 ring-white/20">
              {c.name.slice(0, 1)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-1.5 text-xl font-black leading-snug">
              {c.name}
              {c.accountStatus === 'APPROVED' && <BadgeCheck className="size-5 shrink-0 text-emerald-300" />}
            </h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold text-violet-100/90">
              <span className="flex items-center gap-1">
                {isDoctor ? <Stethoscope className="size-3.5" /> : <HeartPulse className="size-3.5" />}
                {roleLabel}
              </span>
              {c.yearsOfExperience != null && (
                <span className="flex items-center gap-1">
                  <Award className="size-3.5" />
                  {c.yearsOfExperience} سنوات خبرة
                </span>
              )}
              {c.gender && <span>{GENDER_AR[c.gender] ?? ''}</span>}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-black">
              {c.avgRating != null && (
                <span className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 backdrop-blur">
                  <Star className="size-3.5 fill-amber-300 text-amber-300" />
                  {c.avgRating} من 5 — {c.ratings.length} تقييم
                </span>
              )}
              <span className="rounded-full bg-white/10 px-2.5 py-1 backdrop-blur">
                عضو منذ {formatDate(c.memberSince)}
              </span>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 rounded-xl border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white print:hidden"
            onClick={() => window.print()}
          >
            <Printer className="size-4" />
            طباعة
          </Button>
        </div>
      </div>

      {/* ---------- جسم السيرة الذاتية ---------- */}
      <div className="space-y-5 p-6">
        {/* التواصل */}
        <CvSection title="بيانات التواصل" icon={Phone}>
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              dir="ltr"
              className={cn(
                'rounded-xl border bg-card px-3.5 py-2 text-sm font-black tabular-nums',
                c.phone.phoneLocked && 'tracking-wider text-muted-foreground'
              )}
            >
              {c.phone.phoneLocked ? c.phone.phoneMasked : c.phone.phone}
            </span>
            {c.phone.phoneLocked ? (
              <span className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground">
                <Lock className="size-3" />
                الرقم الكامل يُفتح تلقائياً عند اختيار المتقدم (مع تسجيل المشاهدة)
              </span>
            ) : (
              <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                مفصول بعد اختيار المتقدم — مُسجّل في سجل التدقيق
              </span>
            )}
          </div>
        </CvSection>

        {/* التعليم والخبرة */}
        <CvSection title="المؤهل العلمي والخبرة" icon={GraduationCap}>
          <div className="grid grid-cols-2 gap-2.5">
            <CvStat label="المؤهل العلمي" value={c.qualification || 'غير مسجل'} strong />
            <CvStat label="سنوات الخبرة" value={c.yearsOfExperience != null ? `${c.yearsOfExperience} سنوات` : 'غير مسجلة'} strong />
            <CvStat label="حالة الحساب" value={c.accountStatus === 'APPROVED' ? 'معتمد من الإدارة' : 'قيد الاعتماد'} />
            <CvStat label="عدد التقييمات" value={String(c.ratings.length)} />
          </div>
        </CvSection>

        {/* أقسام وتخصصات العمل */}
        {workTags.length > 0 && (
          <CvSection title={isDoctor ? 'التخصصات الطبية' : 'أقسام العمل'} icon={Briefcase}>
            <div className="flex flex-wrap gap-1.5">
              {workTags.map((t) => (
                <Badge key={t} variant="secondary" className="bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-200">
                  {t}
                </Badge>
              ))}
            </div>
          </CvSection>
        )}

        {/* جهات العمل — خط زمني مهني */}
        {c.affiliations.length > 0 && (
          <CvSection title="الجهات الصحية والخبرة الميدانية" icon={Building2}>
            <ol className="relative space-y-3 border-s-2 border-dashed border-violet-200 ps-4 dark:border-violet-800">
              {c.affiliations.map((a, i) => (
                <li key={`${a.hospital}-${i}`} className="relative">
                  <span className="absolute -start-[1.42rem] top-1 size-3 rounded-full border-2 border-background bg-violet-500" aria-hidden />
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2">
                    <p className="flex items-center gap-1.5 text-xs font-black">
                      <MapPin className="size-3.5 text-muted-foreground" />
                      {a.hospital}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] font-bold text-muted-foreground">
                      {a.workYears != null && a.workYears > 0 && (
                        <span className="flex items-center gap-1">
                          <CalendarClock className="size-3" />
                          {a.workYears} سنوات
                        </span>
                      )}
                      <Badge variant="outline" className="text-[10px]">
                        {AFFILIATION_STATUS_LABELS[a.status] ?? a.status}
                      </Badge>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </CvSection>
        )}

        {/* التقييمات بأبعادها */}
        {dims && (
          <CvSection title={`التقييمات المهنية — ${c.avgRating} من 5`} icon={Star}>
            <div className="space-y-2.5">
              {[
                ['الالتزام بالمواعيد', dims.punctuality],
                ['جودة العمل', dims.quality],
                ['التواصل', dims.communication],
                ['الانضباط', dims.discipline],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <div className="mb-1 flex items-center justify-between text-[11px] font-black">
                    <span>{label as string}</span>
                    <span className="tabular-nums text-muted-foreground">{(value as number).toFixed(1)} / 5</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-to-l from-amber-400 to-amber-500"
                      style={{ width: `${Math.min(100, ((value as number) / 5) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
              {c.ratings.filter((r) => r.comment?.trim()).slice(0, 3).map((r, i) => (
                <blockquote key={i} className="rounded-xl border-s-4 border-amber-400 bg-amber-50/60 px-3 py-2 text-xs leading-relaxed dark:bg-amber-950/20">
                  <span className="font-black">{r.overall}★</span> — {r.comment}
                </blockquote>
              ))}
            </div>
          </CvSection>
        )}

        {/* رسالة التقديم */}
        {data.application.coverNote && (
          <CvSection title="رسالة التقديم" icon={FileText}>
            <p className="whitespace-pre-wrap rounded-xl bg-muted/60 p-3.5 text-xs leading-relaxed" style={{ overflowWrap: 'anywhere' }}>
              {data.application.coverNote}
            </p>
            <p className="mt-1.5 text-[10px] font-bold text-muted-foreground">
              قُدّم بتاريخ {formatDate(data.application.createdAt)}
            </p>
          </CvSection>
        )}

        {/* مطابقة الأهلية لحظة التقديم */}
        {data.application.matchSnapshot?.checks && data.application.matchSnapshot.checks.length > 0 && (
          <CvSection title="مطابقة الملف عند التقديم" icon={UserRound}>
            <EligibilityPanel
              checks={data.application.matchSnapshot.checks}
              eligible={data.application.matchSnapshot.eligible ?? true}
            />
          </CvSection>
        )}

        {/* المستندات — بمنح إداري حصراً (نظام ج61) */}
        <CvSection title="المستندات المهنية" icon={FileText}>
          {c.documentsState === 'granted' ? (
            c.documents.length > 0 ? (
              <div className="space-y-1.5">
                {c.documents.map((d) => (
                  <a
                    key={d.id}
                    href={d.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2 text-xs font-bold transition-colors hover:bg-accent"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <FileText className="size-4 shrink-0 text-violet-600 dark:text-violet-300" />
                      <span className="truncate">{d.title}</span>
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'shrink-0 text-[10px]',
                        d.status === 'APPROVED' && 'border-emerald-300 text-emerald-700 dark:text-emerald-400'
                      )}
                    >
                      {DOC_STATUS_AR[d.status] ?? d.status}
                    </Badge>
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-xs font-bold text-muted-foreground">لا مستندات مرفوعة على الملف</p>
            )
          ) : (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-800 dark:bg-amber-950/20">
              <Lock className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <p className="text-[11px] font-bold leading-relaxed text-amber-800 dark:text-amber-200">
                المستندات محمية — تُفتح حصراً بمنح صريح من الإدارة عبر نظام خصوصية المستندات،
                وكل مشاهدة تُسجّل في سجل التدقيق.
              </p>
            </div>
          )}
        </CvSection>
      </div>
    </div>
  )
}

/* ---------------- عناصر مساعدة ---------------- */

function CvSection({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <section className="print:break-inside-avoid">
      <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-violet-700 dark:text-violet-300">
        <span className="flex size-6 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-950/60">
          <Icon className="size-3.5" />
        </span>
        {title}
      </h3>
      {children}
    </section>
  )
}

function CvStat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl border bg-card p-3">
      <p className="text-[10px] font-bold text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 truncate font-bold', strong && 'text-sm font-black')} title={value}>
        {value}
      </p>
    </div>
  )
}

function avg(values: number[]): number {
  if (values.length === 0) return 0
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10
}
