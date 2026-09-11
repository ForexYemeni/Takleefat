'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BadgeCheck,
  Briefcase,
  CalendarClock,
  FileText,
  GraduationCap,
  IdCard,
  Loader2,
  Phone as PhoneIcon,
  Stethoscope,
  UserRound,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DocumentViewer, type ViewableDocument } from '@/components/shared/document-viewer'
import { StatusBadge } from '@/components/shared/status-badge'
import { Stars } from '@/components/shared/star-rating'
import { EmptyState } from '@/components/shared/empty-state'
import { AFFILIATION_STATUS_LABELS } from '@/lib/network'
import { DOCUMENT_TYPE_LABELS, GENDER_LABELS, formatDate } from '@/lib/utils'

/**
 * السيرة الذاتية الكاملة — الجولة 32
 * حوار احترافي يعرض الملف الكامل لكادر تمريضي أو طبيب (المستندات + كل البيانات
 * + السجل المهني + التقييمات). يظهر حصراً لمن مُنحه حساب الإدارة إذن
 * «رؤية البيانات الكاملة» (User.fullProfileAccess) — المستلم الإداري يرى الكوادر
 * ومشرف الأطباء يرى الأطباء — بالإضافة إلى الإدارة نفسها.
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
  phone: string
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
    queryFn: () =>
      apiFetchProfile(userId!),
    enabled: !!userId && open,
    retry: false,
  })

  const profile = data?.profile
  const documents = data?.documents ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <IdCard className="size-5 text-primary" />
            السيرة الذاتية الكاملة
          </DialogTitle>
          <DialogDescription>
            بيانات ومستندات محمية بإذن من حساب الإدارة — لا تُشارك خارج المنصة
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            جارٍ تحميل السيرة الذاتية...
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
            {/* ---------- الترويسة ---------- */}
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-gradient-to-l from-primary/5 to-transparent p-4">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
                <UserRound className="size-6 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-lg font-extrabold">
                  {profile.name}
                  {profile.status === 'APPROVED' && (
                    <BadgeCheck className="size-4 shrink-0 text-emerald-600" />
                  )}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Stethoscope className="size-3.5" />
                  {profile.role === 'DOCTOR' ? 'طبيب' : 'كادر تمريضي'}
                  {profile.specialty ? ` — ${profile.specialty}` : ''}
                </p>
              </div>
              <StatusBadge status={profile.status} labels={{
                APPROVED: 'معتمد',
                PENDING: 'قيد المراجعة',
                REJECTED: 'مرفوض',
                SUSPENDED: 'موقوف',
              }} />
            </div>

            {/* ---------- البيانات الأساسية ---------- */}
            <div className="grid grid-cols-2 gap-3 rounded-2xl border p-4 sm:grid-cols-3">
              <InfoItem icon={PhoneIcon} label="الهاتف" value={profile.phone} ltr />
              <InfoItem
                icon={UserRound}
                label="الجنس"
                value={profile.gender ? GENDER_LABELS[profile.gender] ?? profile.gender : '—'}
              />
              <InfoItem
                icon={GraduationCap}
                label="المؤهل العلمي"
                value={profile.qualification ?? '—'}
              />
              <InfoItem
                icon={Briefcase}
                label="سنوات الخبرة"
                value={profile.yearsOfExperience != null ? `${profile.yearsOfExperience} سنة` : '—'}
              />
              <InfoItem
                icon={CalendarClock}
                label="تاريخ التسجيل"
                value={formatDate(profile.createdAt)}
              />
              <InfoItem
                icon={FileText}
                label="التكليفات المنجزة"
                value={String(profile.assignmentsCount)}
              />
            </div>

            {/* ---------- أقسام/تخصصات العمل ---------- */}
            {(profile.workDepartments.length > 0 || profile.workSpecialties.length > 0) && (
              <div className="rounded-2xl border p-4">
                <p className="mb-2 text-xs font-bold text-muted-foreground">
                  {profile.role === 'DOCTOR' ? 'تخصصات العمل' : 'أقسام العمل'}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(profile.role === 'DOCTOR' ? profile.workSpecialties : profile.workDepartments).map(
                    (d) => (
                      <Badge key={d} variant="secondary" className="gap-1">
                        <Stethoscope className="size-3" />
                        {d}
                      </Badge>
                    )
                  )}
                </div>
              </div>
            )}

            {/* ---------- السجل المهني ---------- */}
            {profile.affiliations.length > 0 && (
              <div className="rounded-2xl border p-4">
                <p className="mb-2 text-xs font-bold text-muted-foreground">السجل المهني — الجهات</p>
                <div className="space-y-2">
                  {profile.affiliations.map((a, i) => (
                    <div
                      key={i}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-secondary/30 px-3 py-2 text-sm"
                    >
                      <span className="font-bold">{a.hospital.name}</span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        {a.workYears != null && <span>{a.workYears} سنة عمل</span>}
                        <Badge variant="outline">
                          {AFFILIATION_STATUS_LABELS[a.status] ?? a.status}
                        </Badge>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ---------- التقييمات ---------- */}
            {profile.ratings.count > 0 && (
              <div className="rounded-2xl border p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-bold text-muted-foreground">
                    التقييمات الاحترافية ({profile.ratings.count})
                  </p>
                  {profile.ratings.average != null && (
                    <span className="flex items-center gap-1.5">
                      <Stars value={profile.ratings.average} />
                      <span className="text-sm font-extrabold">{profile.ratings.average}</span>
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  {(Object.keys(AXIS_LABELS) as Array<keyof typeof AXIS_LABELS>).map((k) => (
                    <div key={k} className="rounded-xl border bg-secondary/30 px-2.5 py-2">
                      <p className="text-muted-foreground">{AXIS_LABELS[k]}</p>
                      <p className="mt-0.5 font-extrabold">
                        {profile.ratings.axes[k] != null ? `${profile.ratings.axes[k]}/5` : '—'}
                      </p>
                    </div>
                  ))}
                </div>
                {profile.ratings.latest.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {profile.ratings.latest.map((r, i) => (
                      <div key={i} className="rounded-xl border bg-card px-3 py-2 text-xs">
                        <p className="flex items-center justify-between gap-2">
                          <span className="font-bold">{r.receiverName}</span>
                          <Stars value={r.overall} />
                        </p>
                        {r.comment && <p className="mt-1 text-muted-foreground">«{r.comment}»</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ---------- المستندات ---------- */}
            <div className="rounded-2xl border p-4">
              <p className="mb-2 text-xs font-bold text-muted-foreground">
                المستندات المرفوعة ({documents.length})
              </p>
              {documents.length === 0 ? (
                <p className="py-3 text-center text-sm text-muted-foreground">
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
                      className="flex items-center gap-2.5 rounded-xl border p-3 text-start transition-colors hover:bg-accent"
                    >
                      <span className="rounded-lg bg-secondary p-2">
                        <FileText className="size-4 text-primary" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">{doc.title}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          {DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type} — {formatDate(doc.createdAt)}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
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
    <div className="min-w-0">
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
}> {
  const { apiFetcher } = await import('@/lib/api-client')
  return apiFetcher(`/api/workforce/${userId}`)
}
