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
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { DocumentViewer, type ViewableDocument } from '@/components/shared/document-viewer'
import { StatusBadge } from '@/components/shared/status-badge'
import { APPLICATION_STATUS_LABELS, DOCUMENT_TYPE_LABELS, formatDate } from '@/lib/utils'

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
    specialty: string | null
    qualification: string | null
    yearsOfExperience: number | null
    documents: ApplicantDocument[]
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
        <CVRow icon={Stethoscope} label="التخصص" value={nurse.specialty ?? '—'} />
        <CVRow icon={GraduationCap} label="المؤهل العلمي" value={nurse.qualification ?? '—'} />
        <CVRow
          icon={Briefcase}
          label="سنوات الخبرة"
          value={nurse.yearsOfExperience != null ? `${nurse.yearsOfExperience} سنة` : '—'}
        />
      </div>

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
          تم اعتماد هذا التقديم وإنشاء التكليف المؤكد — تظهر طرق الدفع في صفحة التكليفات
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
