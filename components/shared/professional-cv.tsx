'use client'

import {
  Award,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  FileCheck2,
  GraduationCap,
  HeartPulse,
  Printer,
  Quote,
  Star,
  Stethoscope,
  UserRound,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Stars } from '@/components/shared/star-rating'
import { printCv } from '@/lib/cv-print'
import { formatDate } from '@/lib/utils'

/**
 * السيرة الذاتية الاحترافية الموحّدة — الجولة 74
 * =================================================
 * عرض واحد فاخر للسيرة يُستخدم من كل الجهات:
 *  - صاحب السيرة نفسه: من بطاقته المهنية (/nurse/card و /doctor/card)
 *    عبر /api/me/cv — «تظهر للمستخدم السيرة الذاتية الخاصة به بشكل
 *    احترافي جداً في بطاقته المهنية».
 *  - المستلم الإداري ومشرف الأطباء: عبر زر الطباعة في حوار السيرة الكاملة.
 * المكوّن عرضٌ صافٍ (بيانات جاهزة من الأب) — والطباعة عبر مولّد HTML نظيف
 * (lib/cv-print.ts) يفتح حوار «حفظ كـ PDF» في أي متصفح.
 */

export interface CvData {
  name: string
  role: string
  status: string
  gender: string | null
  specialty: string | null
  qualification: string | null
  yearsOfExperience: number | null
  photoUrl: string | null
  memberSince: string
  generatedAt: string
  workDepartments: string[]
  workSpecialties: string[]
  affiliations: Array<{
    status: string
    statusLabel: string
    workYears: number | null
    createdAt: string
    hospital: { name: string; type: string; city: string | null }
  }>
  ratings: {
    average: number | null
    count: number
    axes: {
      punctuality: number | null
      quality: number | null
      communication: number | null
      discipline: number | null
    }
    latest: Array<{
      overall: number
      comment: string | null
      createdAt: string
      receiverName: string
      assignmentTitle: string
    }>
  }
  stats: {
    totalAssignments: number
    completedAssignments: number
    completionRate: number | null
    totalApplications: number
    acceptanceRate: number | null
    isAvailable: boolean
    busyWith: string | null
  }
}

const AXIS_LABELS: Array<{ key: keyof CvData['ratings']['axes']; label: string }> = [
  { key: 'punctuality', label: 'الالتزام بالمواعيد' },
  { key: 'quality', label: 'جودة الأداء' },
  { key: 'communication', label: 'التعامل والتواصل' },
  { key: 'discipline', label: 'الانضباط المهني' },
]

const STATUS_LABELS: Record<string, string> = {
  APPROVED: 'حساب معتمد',
  PENDING: 'قيد المراجعة',
  REJECTED: 'مرفوض',
  SUSPENDED: 'موقوف',
  CURRENT: 'ارتباط حالي',
  FORMER: 'ارتباط سابق',
}

export function ProfessionalCv({ cv, printLabel = 'طباعة / حفظ PDF' }: { cv: CvData; printLabel?: string }) {
  const isDoctor = cv.role === 'DOCTOR'
  const roleLabel = isDoctor ? 'طبيب' : 'كادر صحي'
  const departments = [...cv.workDepartments, ...cv.workSpecialties]

  const summary = [
    `${roleLabel}${cv.specialty ? ` في ${cv.specialty}` : ''}`,
    cv.yearsOfExperience != null && cv.yearsOfExperience > 0 ? `بخبرة ${cv.yearsOfExperience} سنة` : '',
    cv.qualification ? `حاصل على ${cv.qualification}` : '',
    cv.stats.completedAssignments > 0 ? `أتم ${cv.stats.completedAssignments} تكليفاً عبر المنصة` : '',
    cv.ratings.average != null ? `بمتوسط تقييم ${cv.ratings.average.toFixed(1)} من 5` : '',
  ]
    .filter(Boolean)
    .join('، ')

  return (
    <div className="space-y-4">
      {/* ============ ترويسة الغلاف ============ */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-bl from-[#2563EB] to-[#8B5CF6] p-5 text-white">
        <div className="absolute -left-10 -top-10 size-36 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-12 -right-8 size-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-wrap items-start gap-4">
          {cv.photoUrl ? (
            <img
              src={cv.photoUrl}
              alt={`صورة ${cv.name}`}
              className="size-20 shrink-0 rounded-2xl border-2 border-white/50 object-cover shadow-lg"
            />
          ) : (
            <div className="flex size-20 shrink-0 items-center justify-center rounded-2xl border-2 border-white/40 bg-white/15 text-3xl font-black shadow-lg">
              {cv.name.trim().charAt(0)}
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide opacity-90">
              <BadgeCheck className="size-4" />
              سيرة ذاتية — موثقة من منصة تكليفات | Takleefat
            </p>
            <h2 className="text-2xl font-black leading-snug">{cv.name}</h2>
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
              <span className="rounded-full bg-white/20 px-2.5 py-0.5">{roleLabel}</span>
              {cv.gender && (
                <span className="rounded-full bg-white/20 px-2.5 py-0.5">
                  {cv.gender === 'MALE' ? 'ذكر' : 'أنثى'}
                </span>
              )}
              {cv.specialty && (
                <span className="flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5">
                  <Stethoscope className="size-3" />
                  {cv.specialty}
                </span>
              )}
              {cv.yearsOfExperience != null && (
                <span className="flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5">
                  <BriefcaseBusiness className="size-3" />
                  {cv.yearsOfExperience} سنة خبرة
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span
              className={`rounded-full px-3 py-1 text-[11px] font-extrabold ${
                cv.status === 'APPROVED' ? 'bg-emerald-500 text-white' : 'bg-white/25 text-white'
              }`}
            >
              {STATUS_LABELS[cv.status] ?? cv.status}
            </span>
            {cv.ratings.average != null && (
              <span className="flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-extrabold text-[#1E293B]">
                <Star className="size-3.5 fill-amber-400 text-amber-400" />
                {cv.ratings.average.toFixed(1)} من 5
                <span className="font-bold text-muted-foreground">({cv.ratings.count})</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ============ الملخص المهني + حالة التوفر ============ */}
      <div className="rounded-2xl border bg-gradient-to-l from-secondary/60 to-transparent p-4">
        <p className="flex items-center gap-2 text-xs font-extrabold text-muted-foreground">
          <UserRound className="size-4 text-primary" />
          الملخص المهني
        </p>
        <p className="mt-1.5 text-sm leading-relaxed">
          {summary || 'سيرة مهنية على منصة تكليفات — تُحدَّث تلقائياً من بيانات التكليفات والتقييمات.'}
        </p>
        <p
          className={`mt-2.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${
            cv.stats.isAvailable
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
              : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
          }`}
        >
          <span className={`size-1.5 rounded-full ${cv.stats.isAvailable ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          {cv.stats.isAvailable ? 'متاح للتكليفات الجديدة' : `حالياً في تكليف: ${cv.stats.busyWith ?? 'جارٍ'}`}
        </p>
      </div>

      {/* ============ شريط الإحصاءات ============ */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile
          icon={BriefcaseBusiness}
          value={cv.yearsOfExperience != null ? String(cv.yearsOfExperience) : '—'}
          label="سنة خبرة"
        />
        <StatTile icon={FileCheck2} value={String(cv.stats.completedAssignments)} label="تكليف مكتمل" />
        <StatTile
          icon={Award}
          value={cv.stats.completionRate != null ? `${cv.stats.completionRate}%` : '—'}
          label="معدل الإنجاز"
        />
        <StatTile
          icon={Star}
          value={cv.ratings.average != null ? cv.ratings.average.toFixed(1) : '—'}
          label={cv.ratings.count > 0 ? `تقييم (${cv.ratings.count})` : 'بلا تقييمات'}
        />
      </div>

      {/* ============ التحصيل العلمي + أقسام العمل ============ */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border p-4">
          <p className="flex items-center gap-2 text-xs font-extrabold text-muted-foreground">
            <GraduationCap className="size-4 text-primary" />
            التحصيل العلمي
          </p>
          <p className="mt-2 text-base font-extrabold leading-relaxed">
            {cv.qualification ?? 'بدون مؤهل مسجل'}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            المؤهل العلمي مُتحقق منه من كتالوج المنصة المعتمد
          </p>
        </div>
        <div className="rounded-2xl border p-4">
          <p className="flex items-center gap-2 text-xs font-extrabold text-muted-foreground">
            <HeartPulse className="size-4 text-primary" />
            {isDoctor ? 'تخصصات العمل' : 'أقسام العمل'}
          </p>
          {departments.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {departments.map((d) => (
                <span
                  key={d}
                  className="rounded-full border border-primary/25 bg-primary/5 px-2.5 py-0.5 text-[11px] font-bold text-primary"
                >
                  {d}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">لم تُضف أقسام عمل بعد</p>
          )}
        </div>
      </div>

      {/* ============ السجل المهني — خط زمني لجهات العمل ============ */}
      <div className="rounded-2xl border p-4">
        <p className="flex items-center gap-2 text-xs font-extrabold text-muted-foreground">
          <Building2 className="size-4 text-primary" />
          السجل المهني — جهات العمل
        </p>
        {cv.affiliations.length > 0 ? (
          <div className="mt-3 space-y-0">
            {cv.affiliations.map((a, i) => (
              <div key={`${a.hospital.name}-${i}`} className="relative flex gap-3 pb-4 last:pb-0">
                {/* خط الزمن */}
                <div className="relative flex flex-col items-center">
                  <span
                    className={`mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ${
                      a.status === 'CURRENT'
                        ? 'bg-emerald-500 ring-emerald-100 dark:ring-emerald-950'
                        : 'bg-slate-300 ring-slate-100 dark:bg-slate-600 dark:ring-slate-900'
                    }`}
                  />
                  {i < cv.affiliations.length - 1 && <span className="w-px flex-1 bg-border" />}
                </div>
                <div className="flex-1 rounded-xl border bg-secondary/30 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <p className="text-sm font-extrabold">{a.hospital.name}</p>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        a.status === 'CURRENT'
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {a.statusLabel ?? STATUS_LABELS[a.status] ?? a.status}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {a.hospital.type}
                    {a.hospital.city ? ` — ${a.hospital.city}` : ''}
                    {a.workYears != null ? ` · ${a.workYears} سنة عمل` : ''}
                    {` · منذ ${formatDate(a.createdAt)}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            لا يوجد سجل مهني مسجل بعد — يُبنى تلقائياً من جهات العمل المرتبطة بالحساب
          </p>
        )}
      </div>

      {/* ============ التقييمات المهنية ============ */}
      {(cv.ratings.axes.punctuality != null ||
        cv.ratings.axes.quality != null ||
        cv.ratings.axes.communication != null ||
        cv.ratings.axes.discipline != null ||
        cv.ratings.latest.length > 0) && (
        <div className="rounded-2xl border p-4">
          <p className="flex flex-wrap items-center justify-between gap-2 text-xs font-extrabold text-muted-foreground">
            <span className="flex items-center gap-2">
              <Star className="size-4 text-amber-500" />
              التقييمات المهنية من الجهات
            </span>
            {cv.ratings.average != null && (
              <span className="flex items-center gap-1.5 text-foreground">
                <Stars value={cv.ratings.average} />
                <span className="text-sm font-black">{cv.ratings.average.toFixed(1)}/5</span>
              </span>
            )}
          </p>

          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {/* الأبعاد الأربعة بأشرطة تقدم */}
            <div className="space-y-2.5">
              {AXIS_LABELS.map(({ key, label }) => {
                const v = cv.ratings.axes[key]
                if (v == null) return null
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span className="text-muted-foreground">{label}</span>
                      <span>{v.toFixed(1)}/5</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-gradient-to-l from-[#2563EB] to-[#8B5CF6]"
                        style={{ width: `${(v / 5) * 100}%` }}
                      />
                    </div>
                  </div>
                )
              })}
              {AXIS_LABELS.every(({ key }) => cv.ratings.axes[key] == null) && (
                <p className="text-xs text-muted-foreground">لا أبعاد تقييم مفصلة بعد</p>
              )}
            </div>

            {/* أحدث التعليقات */}
            <div className="space-y-2">
              {cv.ratings.latest.slice(0, 3).map((r, i) => (
                <div key={i} className="rounded-xl border bg-secondary/30 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-extrabold">{r.assignmentTitle}</p>
                    <Stars value={r.overall} size="sm" />
                  </div>
                  {r.comment && (
                    <p className="mt-1.5 flex gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                      <Quote className="size-3 shrink-0 text-amber-500" />
                      «{r.comment}»
                    </p>
                  )}
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {r.receiverName} — {formatDate(r.createdAt)}
                  </p>
                </div>
              ))}
              {cv.ratings.latest.length === 0 && (
                <p className="text-xs text-muted-foreground">لا تعليقات بعد</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============ التذييل + الطباعة ============ */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-secondary/30 p-3">
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <CalendarDays className="size-3.5" />
          عضو في المنصة منذ {formatDate(cv.memberSince)} — تُولّد السيرة من البيانات الحية تلقائياً
        </p>
        <Button size="sm" variant="outline" className="gap-2" onClick={() => printCv(cv)}>
          <Printer className="size-4" />
          {printLabel}
        </Button>
      </div>
    </div>
  )
}

function StatTile({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>
  value: string
  label: string
}) {
  return (
    <div className="rounded-2xl border bg-secondary/30 p-3 text-center">
      <Icon className="mx-auto size-4 text-primary" />
      <p className="mt-1 text-lg font-black">{value}</p>
      <p className="text-[10px] font-bold text-muted-foreground">{label}</p>
    </div>
  )
}
