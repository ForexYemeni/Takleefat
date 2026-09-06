'use client'

import { useState } from 'react'
import {
  BadgeCheck,
  Briefcase,
  CalendarClock,
  FileText,
  GraduationCap,
  IdCard,
  Phone as PhoneIcon,
  Stethoscope,
  UserRound,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { DocumentViewer, type ViewableDocument } from '@/components/shared/document-viewer'
import { StatusBadge } from '@/components/shared/status-badge'
import { Stars } from '@/components/shared/star-rating'
import {
  APPLICATION_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  GENDER_LABELS,
  formatDate,
} from '@/lib/utils'

export interface ApplicantDocument {
  id: string
  type: string
  title: string
  fileUrl: string
  fileName: string
  fileSize: number | null
  mimeType: string | null
  status: string
}

export interface ApplicantRatings {
  average: number
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

export interface ApplicantData {
  applicationId: string
  status: string
  coverNote: string | null
  reviewNote: string | null
  createdAt: string
  nurse: {
    id: string
    name: string
    phone: string
    gender?: string | null
    specialty: string | null
    qualification: string | null
    yearsOfExperience: number | null
    documents: ApplicantDocument[]
    ratings?: ApplicantRatings
  }
}

/**
 * السيرة الذاتية الاحترافية للكادر المتقدم — تعرضها الجهة المُعلنة
 * قبل اعتماد التقديم أو رفضه: البيانات، التواصل، المستندات، ورسالة التقديم.
 */
export function ApplicantCV({
  applicant,
  onReview,
  reviewing,
}: {
  applicant: ApplicantData
  onReview?: (applicationId: string, action: 'APPROVE' | 'REJECT', note?: string) => void
  reviewing?: boolean
}) {
  const [viewerDoc, setViewerDoc] = useState<ViewableDocument | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [rejectNote, setRejectNote] = useState('')

  const { nurse } = applicant

  return (
    <div className="space-y-4">
      {/* رأس السيرة الذاتية */}
      <div className="flex items-start justify-between gap-3 rounded-2xl border bg-gradient-to-bl from-teal-50 to-transparent p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-full bg-teal-100 text-lg font-extrabold text-teal-800">
            {nurse.name.slice(0, 1)}
          </span>
          <div>
            <p className="text-lg font-extrabold">{nurse.name}</p>
            <p className="text-xs text-muted-foreground">
              قدّم بتاريخ {formatDate(applicant.createdAt)}
            </p>
          </div>
        </div>
        <StatusBadge status={applicant.status} labels={APPLICATION_STATUS_LABELS} />
      </div>

      {/* البيانات الأساسية */}
      <div className="grid gap-2 sm:grid-cols-2">
        <CVRow icon={PhoneIcon} label="رقم الهاتف (للتواصل)" value={nurse.phone} ltr />
        <CVRow
          icon={UserRound}
          label="الجنس"
          value={nurse.gender && nurse.gender !== 'ANY' ? GENDER_LABELS[nurse.gender] ?? '—' : 'غير محدد'}
        />
        <CVRow icon={Stethoscope} label="التخصص" value={nurse.specialty ?? '—'} />
        <CVRow icon={GraduationCap} label="المؤهل العلمي" value={nurse.qualification ?? '—'} />
        <CVRow
          icon={Briefcase}
          label="سنوات الخبرة"
          value={nurse.yearsOfExperience != null ? `${nurse.yearsOfExperience} سنة` : '—'}
        />
      </div>

      {/* التقييمات الاحترافية — تُضاف للسيرة الذاتية من المستلمين السابقين */}
      {nurse.ratings && nurse.ratings.count > 0 && (
        <div className="rounded-2xl border-2 border-amber-200 bg-gradient-to-bl from-amber-50 to-transparent p-4 dark:border-amber-900 dark:from-amber-950/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-extrabold">التقييمات من المستلمين الإداريين</p>
            <div className="flex items-center gap-2">
              <Stars value={nurse.ratings.average} size="md" />
              <Badge className="bg-amber-500 text-white">
                {nurse.ratings.average} من 5
              </Badge>
            </div>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {nurse.ratings.count} تقييم من تكليفات سابقة — تظهر تلقائياً في سيرته الذاتية عند التقديم
          </p>

          <div className="mt-3 grid gap-1.5 text-xs sm:grid-cols-2">
            {(
              [
                ['الالتزام بالمواعيد', nurse.ratings.axes.punctuality],
                ['جودة الأداء الطبي', nurse.ratings.axes.quality],
                ['التعامل والتواصل', nurse.ratings.axes.communication],
                ['الانضباط المهني', nurse.ratings.axes.discipline],
              ] as const
            )
              .filter(([, v]) => v != null)
              .map(([label, v]) => (
                <p
                  key={label}
                  className="flex items-center justify-between gap-2 rounded-lg bg-background/70 px-3 py-1.5"
                >
                  <span className="text-muted-foreground">{label}</span>
                  <span className="flex items-center gap-1.5 font-bold">
                    {v}/5 <Stars value={v!} size="sm" />
                  </span>
                </p>
              ))}
          </div>

          {nurse.ratings.latest.filter((r) => r.comment).length > 0 && (
            <div className="mt-3 space-y-2">
              {nurse.ratings.latest
                .filter((r) => r.comment)
                .map((r, i) => (
                  <div
                    key={i}
                    className="rounded-xl bg-background/70 p-3"
                  >
                    <p className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-bold">{r.receiverName}</span>
                      <Stars value={r.overall} size="sm" />
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      «{r.comment}»
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                      من تكليف: {r.assignmentTitle}
                    </p>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* رسالة التقديم */}
      {applicant.coverNote && (
        <div className="rounded-2xl border border-dashed p-3">
          <p className="mb-1 text-xs font-bold text-muted-foreground">رسالة التقديم</p>
          <p className="text-sm leading-relaxed">{applicant.coverNote}</p>
        </div>
      )}

      {/* المستندات — صور البطاقة والمزاولة */}
      <div className="space-y-2">
        <p className="text-sm font-bold">المستندات الرسمية</p>
        {nurse.documents.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
            لم يرفع الكادر مستندات بعد
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {nurse.documents.map((doc) => (
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
                  {doc.type === 'ID_CARD' ? (
                    <IdCard className="size-4 text-primary" />
                  ) : (
                    <FileText className="size-4 text-primary" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold">
                    {DOCUMENT_TYPE_LABELS[doc.type] ?? doc.title}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">اضغط للعرض</span>
                </span>
                <StatusBadge status={doc.status} labels={{ PENDING: 'قيد المراجعة', APPROVED: 'معتمد', REJECTED: 'مرفوض' }} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* قرار المراجعة */}
      {applicant.status === 'PENDING' && onReview && (
        <div className="space-y-3 border-t pt-4">
          {!rejecting ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                className="flex-1 gap-2"
                disabled={reviewing}
                onClick={() => onReview(applicant.applicationId, 'APPROVE')}
              >
                <BadgeCheck className="size-4" />
                {reviewing ? 'جارٍ الاعتماد...' : 'اعتماد التقديم'}
              </Button>
              <Button
                variant="outline"
                className="flex-1 gap-2 text-red-600 hover:text-red-700"
                disabled={reviewing}
                onClick={() => setRejecting(true)}
              >
                <XCircle className="size-4" />
                رفض التقديم
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor={`reject-${applicant.applicationId}`}>سبب الرفض (يُرسل للكادر)</Label>
              <Textarea
                id={`reject-${applicant.applicationId}`}
                rows={2}
                placeholder="مثال: المستندات غير مكتملة — يُرجى رفع صورة المزاولة"
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  className="flex-1"
                  disabled={!rejectNote.trim() || reviewing}
                  onClick={() => onReview(applicant.applicationId, 'REJECT', rejectNote)}
                >
                  تأكيد الرفض
                </Button>
                <Button variant="outline" onClick={() => setRejecting(false)}>
                  تراجع
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {applicant.status === 'REJECTED' && applicant.reviewNote && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
          سبب الرفض: {applicant.reviewNote}
        </p>
      )}
      {applicant.status === 'APPROVED' && (
        <p className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
          <CalendarClock className="size-3.5" />
          تم اعتماد هذا التقديم واختيار الكادر — أصبح التكليف مؤكداً وتتابع حالته من قائمة التكليفات المؤكدة
        </p>
      )}

      <DocumentViewer
        document={viewerDoc}
        open={!!viewerDoc}
        onOpenChange={(open) => !open && setViewerDoc(null)}
      />
    </div>
  )
}

function CVRow({
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
    <div className="flex items-center gap-3 rounded-xl border p-3">
      <span className="rounded-lg bg-secondary p-2">
        <Icon className="size-4 text-primary" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-bold" dir={ltr ? 'ltr' : undefined}>
          {value}
        </p>
      </div>
    </div>
  )
}
