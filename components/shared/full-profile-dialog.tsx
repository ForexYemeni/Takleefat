'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Award,
  BadgeCheck,
  Briefcase,
  Building2,
  CalendarClock,
  Clock,
  FileText,
  GraduationCap,
  IdCard,
  Loader2,
  Lock,
  Phone as PhoneIcon,
  ShieldCheck,
  Star,
  Stethoscope,
  UserRound,
  XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DocumentViewer, type ViewableDocument } from '@/components/shared/document-viewer'
import { StatusBadge } from '@/components/shared/status-badge'
import { Stars } from '@/components/shared/star-rating'
import { EmptyState } from '@/components/shared/empty-state'
import { StaffPhone } from '@/components/shared/staff-phone'
import { AFFILIATION_STATUS_LABELS } from '@/lib/network'
import { DOCUMENT_TYPE_LABELS, GENDER_LABELS, cn, formatDate, formatDateTime } from '@/lib/utils'

/**
 * السيرة الذاتية الكاملة — إعادة بناء الجولة 33 بمستوى سيرة مهنية احترافية
 * -----------------------------------------------------------------------
 * حوار بتصميم سيرة ذاتية حقيقية:
 *  - ترويسة متدرجة: صورة رمزية بالحرف الأول + الاسم + شارة الاعتماد + الدور
 *    والتخصص + الحالة + متوسط التقييم
 *  - شريط إحصاءات سريع (خبرة/تكليفات/تقييم/مستندات)
 *  - بطاقة هوية مدمجة + «التحصيل العلمي» بحجم أنيق مضغوط
 *  - أقسام/تخصصات العمل + السجل المهني كخط زمني + المستندات بحالاتها
 *  - عمود التقييمات: متوسط كبير + أشرطة تقدم للمحاور + أحدث التعليقات
 * يظهر حصراً لمن مُنحه حساب الإدارة إذن «رؤية البيانات الكاملة» (User.fullProfileAccess)
 * — المستلم الإداري يرى الكوادر ومشرف الأطباء يرى الأطباء — بالإضافة إلى الإدارة نفسها.
 */

interface ProfileDocument {
  id: string
  type: string
  title: string
  fileUrl: string
  fileName: string
  fileSize: number | null
  mimeType: string | null
  status: string
  createdAt: string
}

export interface FullProfile {
  id: string
  name: string
  /** الجولة 34: الرقم الكامل يصل فقط لمن تحقق شرط السداد — وإلا null */
  phone: string | null
  phoneMasked: string
  phoneLocked: boolean
  gender: string | null
  role: string
  status: string
  specialty: string | null
  qualification: string | null
  yearsOfExperience: number | null
  createdAt: string
  workDepartments: string[]
  workSpecialties: string[]
  assignmentsCount: number
  affiliations: Array<{
    status: string
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
}

const AXIS_LABELS: Record<keyof FullProfile['ratings']['axes'], string> = {
  punctuality: 'الالتزام بالمواعيد',
  quality: 'جودة الأداء',
  communication: 'التعامل والتواصل',
  discipline: 'الانضباط المهني',
}

const STATUS_CV_LABELS = {
  APPROVED: 'معتمد',
  PENDING: 'قيد المراجعة',
  REJECTED: 'مرفوض',
  SUSPENDED: 'موقوف',
} as const

export function FullProfileDialog({
  userId,
  open,
  onOpenChange,
}: {
  userId: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [viewerDoc, setViewerDoc] = useState<ViewableDocument | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['workforce-profile', userId],
    queryFn: () => apiFetchProfile(userId!),
    enabled: !!userId && open,
    retry: false,
  })

  const profile = data?.profile
  const documents = data?.documents ?? []
  // الجولة 45: المستندات مخفية عن غير نفس الجهة — شارات الحالة بدل المحتوى
  const documentsHidden = data?.documentsHidden ?? false
  const documentsVerified = data?.documentsVerified ?? false
  const approvedDocuments = data?.approvedDocuments ?? 0
  const documentStatuses = data?.documentStatuses ?? []
  const isDoctor = profile?.role === 'DOCTOR'
  const approvedDocs = documents.filter((d) => d.status === 'APPROVED').length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader className="sr-only">
          <DialogTitle>السيرة الذاتية الكاملة</DialogTitle>
          <DialogDescription>بيانات محمية بإذن من حساب الإدارة</DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
            <Loader2 className="size-7 animate-spin text-primary" />
            <p className="text-sm font-bold">جارٍ تجهيز السيرة الذاتية...</p>
          </div>
        )}

        {!isLoading && (error || !profile) && (
          <EmptyState
            icon={IdCard}
            title="لا يمكن عرض السيرة الذاتية"
            description={(error as Error)?.message ?? 'تعذر تحميل بيانات هذا الحساب.'}
          />
        )}

        {!isLoading && profile && (
          <div className="space-y-4">
            {/* ============ الترويسة — غلاف السيرة ============ */}
            <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-l from-primary/10 via-primary/5 to-transparent p-5">
              <div className="absolute -left-8 -top-8 size-28 rounded-full bg-primary/10 blur-2xl" />
              <div className="relative flex flex-wrap items-center gap-4">
                <div className="relative">
                  <span
                    className={`flex size-16 items-center justify-center rounded-2xl text-2xl font-extrabold shadow-sm ${
                      isDoctor
                        ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                        : 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
                    }`}
                  >
                    {profile.name.slice(0, 1)}
                  </span>
                  {profile.status === 'APPROVED' && (
                    <span className="absolute -bottom-1.5 -start-1.5 rounded-full bg-emerald-500 p-0.5 shadow-sm" title="حساب معتمد">
                      <BadgeCheck className="size-4 text-white" />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-xl font-black">
                    {profile.name}
                    <Badge
                      className={`border-transparent text-[10px] ${
                        isDoctor
                          ? 'bg-indigo-600 text-white'
                          : 'bg-teal-600 text-white'
                      }`}
                    >
                      {isDoctor ? 'طبيب' : 'كادر تمريضي'}
                    </Badge>
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Stethoscope className="size-3.5" />
                      {profile.specialty ?? 'بدون تخصص محدد'}
                    </span>
                    {profile.yearsOfExperience != null && profile.yearsOfExperience > 0 && (
                      <span className="flex items-center gap-1">
                        <Briefcase className="size-3.5" />
                        {profile.yearsOfExperience} سنة خبرة
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <StatusBadge status={profile.status} labels={STATUS_CV_LABELS} />
                  {profile.ratings.average != null && (
                    <span className="flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1">
                      <Stars value={profile.ratings.average} />
                      <span className="text-xs font-extrabold">{profile.ratings.average}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* ============ شريط الإحصاءات السريع ============ */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <StatTile
                icon={Briefcase}
                value={profile.yearsOfExperience != null ? String(profile.yearsOfExperience) : '—'}
                label="سنة خبرة"
              />
              <StatTile
                icon={Award}
                value={String(profile.assignmentsCount)}
                label="تكليف منجز"
              />
              <StatTile
                icon={Star}
                value={profile.ratings.average != null ? `${profile.ratings.average}/5` : '—'}
                label={`من ${profile.ratings.count} تقييم`}
              />
              <StatTile
                icon={documentsHidden ? ShieldCheck : FileText}
                value={documentsHidden ? (documentsVerified ? 'تم التحقق ✓' : 'خاصة') : String(documents.length)}
                label={
                  documentsHidden
                    ? documentsVerified
                      ? 'مستندات معتمدة من الإدارة'
                      : 'مستندات محفوظة وخاصة'
                    : `مستند (${approvedDocs} معتمد)`
                }
              />
            </div>

            {/* ============ الجسم: عمودان ============ */}
            <div className="grid gap-4 lg:grid-cols-5">
              {/* ---------- العمود الرئيسي ---------- */}
              <div className="space-y-4 lg:col-span-3">
                {/* بطاقة الهوية والتواصل */}
                <Section title="بطاقة الهوية والتواصل" icon={UserRound}>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="flex flex-col gap-1.5 rounded-xl border bg-muted/30 px-3 py-2.5">
                      <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                        <PhoneIcon className="size-3.5" />
                        رقم التواصل
                      </span>
                      <StaffPhone data={profile} personName={profile.name} withActions={false} />
                    </div>
                    <InfoItem
                      icon={UserRound}
                      label="الجنس"
                      value={profile.gender ? GENDER_LABELS[profile.gender] ?? profile.gender : '—'}
                    />
                    <InfoItem
                      icon={CalendarClock}
                      label="تاريخ التسجيل"
                      value={formatDate(profile.createdAt)}
                    />
                  </div>
                  {profile.phoneLocked && (
                    <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                      <Lock className="mt-0.5 size-3.5 shrink-0" />
                      <span>
                        خطوات فتح الرقم: اعتماد تكليف فعلي مع الكادر ← سداد نسبة الإدارة من قيمته ← يُفتح الرقم تلقائياً ويبقى متاحاً لهذا التكليف
                      </span>
                    </p>
                  )}
                </Section>

                {/* التحصيل العلمي — حجم أنيق مضغوط */}
                <Section title="التحصيل العلمي" icon={GraduationCap}>
                  <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-3">
                    <span className="rounded-lg bg-primary/10 p-2">
                      <GraduationCap className="size-4 text-primary" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-muted-foreground">
                        {isDoctor ? 'المؤهل العلمي — قائمة الأطباء' : 'المؤهل العلمي — قائمة الكادر التمريضي'}
                      </p>
                      <p className="truncate text-sm font-bold">
                        {profile.qualification ?? 'غير محدد بعد'}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-normal">
                      من كتالوج الإدارة
                    </Badge>
                  </div>
                </Section>

                {/* أقسام/تخصصات العمل */}
                {(profile.workDepartments.length > 0 || profile.workSpecialties.length > 0) && (
                  <Section
                    title={isDoctor ? 'تخصصات العمل الطبية' : 'أقسام العمل المصرّح بها'}
                    icon={Stethoscope}
                  >
                    <div className="flex flex-wrap gap-1.5">
                      {(isDoctor ? profile.workSpecialties : profile.workDepartments).map((d) => (
                        <Badge key={d} variant="secondary" className="gap-1 text-xs font-normal">
                          <Stethoscope className="size-3" />
                          {d}
                        </Badge>
                      ))}
                    </div>
                  </Section>
                )}

                {/* السجل المهني — خط زمني */}
                {profile.affiliations.length > 0 && (
                  <Section title="السجل المهني — الجهات الصحية" icon={Building2}>
                    <div className="relative space-y-3 ps-6">
                      <span className="absolute inset-y-1 start-[9px] w-px bg-border" />
                      {profile.affiliations.map((a, i) => (
                        <div key={i} className="relative">
                          <span
                            className={`absolute -start-6 top-1.5 size-2.5 rounded-full border-2 border-background ${
                              a.status === 'WORKING' ? 'bg-emerald-500' : 'bg-muted-foreground/40'
                            }`}
                          />
                          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-secondary/30 px-3 py-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold">{a.hospital.name}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {[
                                  a.hospital.city,
                                  a.workYears != null
                                    ? `${a.workYears} ${a.workYears === 1 ? 'سنة' : a.workYears === 2 ? 'سنتان' : 'سنوات'} عمل`
                                    : null,
                                  `منذ ${formatDate(a.createdAt)}`,
                                ]
                                  .filter(Boolean)
                                  .join(' — ')}
                              </p>
                            </div>
                            <Badge variant="outline" className="text-[11px] font-normal">
                              {AFFILIATION_STATUS_LABELS[a.status] ?? a.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {/* المستندات */}
                <Section
                  title={
                    documentsHidden
                      ? 'المستندات الرسمية — محفوظة وخاصة'
                      : `المستندات المرفوعة (${documents.length})`
                  }
                  icon={documentsHidden ? ShieldCheck : FileText}
                >
                  {documentsHidden ? (
                    // الجولة 45: المستندات مخفية عن غير نفس الجهة — تظهر شارات الحالة
                    // (معتمدة / مرفوضة / قيد المراجعة) بدل المحتوى (البلاغ الحرفي)
                    <div className="space-y-2.5">
                      <div className="flex items-start gap-3 rounded-xl border-2 border-emerald-200 bg-gradient-to-bl from-emerald-50 to-transparent p-3.5 dark:border-emerald-900 dark:from-emerald-950/20">
                        <span className="shrink-0 rounded-lg bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                          <ShieldCheck className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-extrabold text-emerald-800 dark:text-emerald-200">
                            {documentsVerified ? 'تم التحقق من مستندات الكادر' : 'مستندات الكادر محفوظة وخاصة'}
                            {documentsVerified && approvedDocuments > 0 && ` (${approvedDocuments} معتمدة)`}
                          </p>
                          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                            محتوى المستندات يُعرض فقط عندما يعمل الكادر في جهتك الصحية —
                            أما حالتها المراجعية فمعروضة أدناه.
                          </p>
                        </div>
                      </div>
                      {documentStatuses.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {documentStatuses.map((ds) => (
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
                    </div>
                  ) : documents.length === 0 ? (
                    <p className="rounded-xl border border-dashed py-4 text-center text-sm text-muted-foreground">
                      لا توجد مستندات مرفوعة لهذا الحساب بعد
                    </p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {documents.map((doc: ProfileDocument) => (
                        <button
                          key={doc.id}
                          onClick={() =>
                            setViewerDoc({
                              fileUrl: doc.fileUrl,
                              fileName: doc.fileName,
                              title: doc.title,
                              mimeType: doc.mimeType,
                            })
                          }
                          className="flex items-center gap-2.5 rounded-xl border p-2.5 text-start transition-colors hover:border-primary/40 hover:bg-accent"
                        >
                          <span className="rounded-lg bg-secondary p-2">
                            {doc.type === 'ID_CARD' ? (
                              <IdCard className="size-4 text-primary" />
                            ) : (
                              <FileText className="size-4 text-primary" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-bold">{doc.title}</span>
                            <span className="block text-[10px] text-muted-foreground">
                              {DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type} — {formatDate(doc.createdAt)}
                            </span>
                          </span>
                          <StatusBadge
                            status={doc.status}
                            labels={{ PENDING: 'قيد المراجعة', APPROVED: 'معتمد', REJECTED: 'مرفوض' }}
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </Section>
              </div>

              {/* ---------- عمود التقييمات ---------- */}
              <div className="space-y-4 lg:col-span-2">
                <Section title="التقييمات الاحترافية" icon={Star}>
                  {profile.ratings.count === 0 ? (
                    <p className="rounded-xl border border-dashed py-4 text-center text-sm text-muted-foreground">
                      لا توجد تقييمات بعد — تُضاف تلقائياً بعد كل تكليف مكتمل
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {/* المتوسط الكبير */}
                      <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-gradient-to-bl from-amber-50 to-transparent px-3.5 py-3 dark:border-amber-900 dark:from-amber-950/20">
                        <div>
                          <p className="text-2xl font-black text-amber-600 dark:text-amber-400">
                            {profile.ratings.average ?? '—'}
                            <span className="text-sm font-bold text-muted-foreground"> / 5</span>
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {profile.ratings.count} تقييم من تكليفات مكتملة
                          </p>
                        </div>
                        <Stars value={profile.ratings.average ?? 0} size="md" />
                      </div>

                      {/* أشرطة المحاور */}
                      <div className="space-y-2">
                        {(Object.keys(AXIS_LABELS) as Array<keyof typeof AXIS_LABELS>).map((k) => {
                          const v = profile.ratings.axes[k]
                          const pct = v != null ? Math.round((v / 5) * 100) : 0
                          return (
                            <div key={k}>
                              <p className="flex items-center justify-between text-[11px]">
                                <span className="text-muted-foreground">{AXIS_LABELS[k]}</span>
                                <span className="font-extrabold">{v != null ? `${v}/5` : '—'}</span>
                              </p>
                              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                                <div
                                  className="h-full rounded-full bg-gradient-to-l from-amber-400 to-amber-500"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </Section>

                {/* أحدث التعليقات */}
                {profile.ratings.latest.filter((r) => r.comment).length > 0 && (
                  <Section title="أحدث تعليقات المستلمين" icon={UserRound}>
                    <div className="space-y-2">
                      {profile.ratings.latest
                        .filter((r) => r.comment)
                        .map((r, i) => (
                          <div key={i} className="rounded-xl border bg-card px-3 py-2.5">
                            <p className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="font-bold">{r.receiverName}</span>
                              <Stars value={r.overall} size="sm" />
                            </p>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                              «{r.comment}»
                            </p>
                            <p className="mt-0.5 truncate text-[10px] text-muted-foreground/70">
                              من تكليف: {r.assignmentTitle}
                            </p>
                          </div>
                        ))}
                    </div>
                  </Section>
                )}
              </div>
            </div>

            {/* ============ تذييل السرية ============ */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-dashed bg-secondary/40 px-4 py-3">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
                <ShieldCheck className="size-3.5 text-emerald-600" />
                سيرة ذاتية محمية — تُعرض بإذن من حساب الإدارة — لا تُشارك خارج المنصة
              </p>
              <p className="text-[10px] text-muted-foreground">
                استُخرجت {formatDateTime(new Date().toISOString())} — منصة تكليفات
              </p>
            </div>
          </div>
        )}

        <DocumentViewer
          document={viewerDoc}
          open={!!viewerDoc}
          onOpenChange={(v) => !v && setViewerDoc(null)}
        />
      </DialogContent>
    </Dialog>
  )
}

/* ==================== عناصر مساعدة للتصميم ==================== */

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="mb-2.5 flex items-center gap-1.5 text-xs font-extrabold text-muted-foreground">
        <Icon className="size-3.5 text-primary" />
        {title}
      </p>
      {children}
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
    <div className="flex items-center gap-2.5 rounded-xl border bg-card px-3 py-2.5">
      <span className="rounded-lg bg-primary/10 p-2">
        <Icon className="size-4 text-primary" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-base font-extrabold leading-tight">{value}</p>
        <p className="truncate text-[10px] text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

function InfoItem({
  icon: Icon,
  label,
  value,
  ltr,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  ltr?: boolean
}) {
  return (
    <div className="rounded-xl border bg-secondary/30 px-3 py-2">
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-bold" dir={ltr ? 'ltr' : undefined}>
        <span className="text-start">{value}</span>
      </p>
    </div>
  )
}

/** جلب السيرة الكاملة — فاصل صغير فوق apiFetcher لتضييق الأنواع */
async function apiFetchProfile(userId: string): Promise<{
  profile: FullProfile
  documents: ProfileDocument[]
  documentsHidden?: boolean
  documentsVerified?: boolean
  approvedDocuments?: number
  /** الجولة 45: حالات المستندات (نوع + حالة) — تُعرض شاراتها عند إخفاء المحتوى */
  documentStatuses?: Array<{ type: string; status: string }>
}> {
  const { apiFetcher } = await import('@/lib/api-client')
  return apiFetcher(`/api/workforce/${userId}`)
}
