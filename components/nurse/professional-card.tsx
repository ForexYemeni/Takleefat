import { BadgeCheck, Award, BriefcaseBusiness, GraduationCap, CalendarDays } from 'lucide-react'
import { Stars } from '@/components/shared/star-rating'

/**
 * البطاقة المهنية الرقمية — تكليفات | Takleefat (الجولة الرابعة عشرة)
 * مكوّن عرض صافٍ (بلا حالات أو أحداث) — يُستخدم في:
 *  - الصفحة العامة /n/[id] (تُصدر من الخادم مع QR مدمج)
 *  - صفحة الكادر /nurse/card (معروضة قبل المشاركة)
 *
 * الخصوصية: لا يعرض البطاقة رقم الهاتف ولا المستندات — الهوية المهنية فقط.
 */

export interface ProfessionalCardProps {
  name: string
  specialty: string | null
  qualification: string | null
  yearsOfExperience: number | null
  gender?: string | null
  /** أقسام العمل المصرّح بها (ممرض طوارئ/رقود/عناية...) — صف شرائح فاخر */
  departments?: string[]
  ratingAverage: number | null
  ratingCount: number
  completedAssignments: number
  memberSince: string
  qrSvg?: string | null
  publicUrl?: string | null
}

const GENDER_LABELS: Record<string, string> = { MALE: 'ذكر', FEMALE: 'أنثى' }

export function ProfessionalCard({
  name,
  specialty,
  qualification,
  yearsOfExperience,
  gender,
  departments,
  ratingAverage,
  ratingCount,
  completedAssignments,
  memberSince,
  qrSvg,
  publicUrl,
}: ProfessionalCardProps) {
  return (
    <div className="overflow-hidden rounded-3xl border shadow-lg">
      {/* رأس البطاقة — التدرج الرسمي للمنصة */}
      <div className="relative bg-gradient-to-bl from-[#2563EB] to-[#8B5CF6] p-5 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <BadgeCheck className="size-5 shrink-0" />
              <span className="text-xs font-bold tracking-wide opacity-90">
                كادر موثّق من منصة تكليفات
              </span>
            </div>
            <h2 className="text-2xl font-extrabold leading-snug">{name}</h2>
            <p className="text-sm font-bold opacity-90">
              {specialty || 'كادر تمريضي معتمد'}
              {gender && GENDER_LABELS[gender] ? ` — ${GENDER_LABELS[gender]}` : ''}
            </p>
          </div>
          {qrSvg && (
            <div className="shrink-0 rounded-2xl bg-white p-2 shadow-md" aria-label="رمز التحقق QR">
              <div
                className="size-24 [&>svg]:size-full"
                dir="ltr"
                // SVG مُولَّد محلياً بمكتبة qrcode من رابط الصفحة — لا يمرر أي إدخال خارجي
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            </div>
          )}
        </div>
      </div>

      {/* جسم البطاقة — البيانات المهنية */}
      <div className="space-y-4 bg-background p-5">
        {/* أقسام العمل — شريحة فاخرة أعلى البيانات */}
        {departments && departments.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-[#2563EB]/20 bg-[#2563EB]/5 p-3">
            <span className="flex items-center gap-1.5 text-[11px] font-extrabold text-[#2563EB]">
              <BriefcaseBusiness className="size-3.5" />
              أقسام العمل:
            </span>
            {departments.map((d) => (
              <span
                key={d}
                className="rounded-full border border-[#2563EB]/25 bg-white px-2.5 py-0.5 text-[11px] font-bold text-[#2563EB] dark:bg-white/10"
              >
                {d}
              </span>
            ))}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border bg-secondary/40 p-3">
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Award className="size-3.5 text-amber-500" />
              التقييم من الجهات
            </p>
            {ratingAverage != null ? (
              <div className="mt-1.5 flex items-center gap-2">
                <Stars value={ratingAverage} size="md" />
                <span className="text-sm font-extrabold">{ratingAverage.toFixed(1)}</span>
                <span className="text-[11px] text-muted-foreground">({ratingCount} تقييم)</span>
              </div>
            ) : (
              <p className="mt-1.5 text-sm font-bold text-muted-foreground">بلا تقييمات بعد</p>
            )}
          </div>
          <div className="rounded-2xl border bg-secondary/40 p-3">
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <BriefcaseBusiness className="size-3.5 text-primary" />
              تكليفات مكتملة
            </p>
            <p className="mt-1 text-2xl font-extrabold">{completedAssignments}</p>
          </div>
          <div className="rounded-2xl border bg-secondary/40 p-3">
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <GraduationCap className="size-3.5 text-primary" />
              المؤهل والخبرة
            </p>
            <p className="mt-1 text-sm font-extrabold leading-relaxed">
              {qualification ?? '—'}
              <span className="mx-1 text-muted-foreground">·</span>
              {yearsOfExperience != null ? `${yearsOfExperience} سنة خبرة` : '—'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-[11px] text-muted-foreground">
          <p className="flex items-center gap-1.5">
            <CalendarDays className="size-3.5" />
            عضو في المنصة منذ {memberSince}
          </p>
          {publicUrl && (
            <p dir="ltr" className="max-w-full truncate font-mono">
              {publicUrl}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
