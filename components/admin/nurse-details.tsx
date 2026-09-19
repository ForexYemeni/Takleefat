'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileText,
  GraduationCap,
  Hash,
  HeartPulse,
  MessageCircle,
  PhoneIcon,
  ShieldCheck,
  UserRound,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetcher, apiPatch } from '@/lib/api-client'
import {
  formatDate,
  formatDateTime,
  USER_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_STATUS_LABELS,
} from '@/lib/utils'
import { StatusBadge } from '@/components/shared/status-badge'
import { DocumentViewer } from '@/components/shared/document-viewer'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { StaffAvatar, summarizeDocs, type DocLite } from '@/components/admin/nurse-docs'
import { WhatsAppNotificationModal } from '@/components/admin/whatsapp-notification'
import type { AdminDocument, AdminUser } from '@/components/admin/nurse-review'

/**
 * الجولة 63 — حوار «مراجعة الملف» الاحترافي لشاشة الكادر التمريضي/الأطباء:
 * بيانات الكادر كاملة + قائمة توثيق المستندات (المرفوع/الناقص/المرفوض بسببه)
 * + سجل التواصل الإداري عبر واتساب + الإجراءات النهائية
 * (اعتماد / طلب تعديل عبر واتساب / رفض بسبب مع إمكانية إبلاغ الكادر).
 * كل الوظائف عبر واجهات الإدارة القائمة — صفر تغيير في المنطق أو الصلاحيات.
 */

interface UserDetailsResponse {
  user: AdminUser & {
    walletAddress: string | null
    accountNumber: string | null
    updatedAt: string
    gender?: string | null
    profilePhotoBlobId?: string | null
    affiliations?: Array<{ hospital: { name: string; status: string } }>
  }
  nurse: {
    documents: AdminDocument[]
    ratings: {
      average: number | null
      count: number
    }
  }
}

interface ContactLogEntry {
  id: string
  title: string
  body: string | null
  createdAt: string
}

const GENDER_LABELS: Record<string, string> = { MALE: 'ذكر', FEMALE: 'أنثى' }

const REQUIRED_ORDER = ['ID_CARD', 'PRACTICE_LICENSE', 'EXPERIENCE_CERT'] as const

export function NurseDetails({
  userId,
  isDoctor,
}: {
  userId: string
  isDoctor: boolean
}) {
  const queryClient = useQueryClient()
  const [viewerDoc, setViewerDoc] = useState<AdminDocument | null>(null)
  const [approveOpen, setApproveOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectNote, setRejectNote] = useState('')
  const [waOpen, setWaOpen] = useState(false)
  const [waNote, setWaNote] = useState('')
  const [waReason, setWaReason] = useState('missing_docs')

  const { data } = useQuery({
    queryKey: ['admin-user-details', userId],
    queryFn: () => apiFetcher<UserDetailsResponse>(`/api/admin/users/${userId}`),
  })

  const { data: logData } = useQuery({
    queryKey: ['contact-log', userId],
    queryFn: () => apiFetcher<{ entries: ContactLogEntry[] }>(`/api/admin/users/${userId}/contact-log`),
  })

  const user = data?.user
  const nurse = data?.nurse
  const docsLite: DocLite[] = (nurse?.documents ?? []).map((d) => ({ type: d.type, status: d.status }))
  const summary = summarizeDocs(docsLite)
  const logEntries = logData?.entries ?? []

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    queryClient.invalidateQueries({ queryKey: ['stats'] })
    queryClient.invalidateQueries({ queryKey: ['admin-user-details', userId] })
  }

  const approveMutation = useMutation({
    mutationFn: () => apiPatch<{ message?: string }>(`/api/admin/users/${userId}`, { status: 'APPROVED' }),
    onSuccess: () => {
      toast.success(isDoctor ? 'تم اعتماد حساب الطبيب' : 'تم اعتماد حساب الكادر التمريضي')
      setApproveOpen(false)
      refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const rejectMutation = useMutation({
    mutationFn: (note: string) =>
      apiPatch<{ message?: string }>(`/api/admin/users/${userId}`, { status: 'REJECTED', rejectNote: note }),
    onSuccess: () => {
      toast.success('تم رفض الحساب مع تسجيل السبب')
      setRejectOpen(false)
      refresh()
      // إمكانية إبلاغ الكادر بالسبب عبر واتساب مباشرة (طلب صاحب المنصة)
      setWaReason('other')
      setWaNote(rejectNote.trim())
      setWaOpen(true)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const waTarget =
    user
      ? {
          id: user.id,
          name: user.name,
          phone: user.phone,
          status: user.status,
          documents: docsLite,
        }
      : null

  const otherDocs = (nurse?.documents ?? []).filter((d) => d.type === 'OTHER')

  if (!data) {
    return (
      <div className="space-y-3 py-2">
        <div className="h-24 animate-pulse rounded-2xl bg-muted" />
        <div className="h-40 animate-pulse rounded-2xl bg-muted" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ---------- بطاقة الهوية ---------- */}
      {user && (
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-bl from-cyan-500/[0.07] via-card to-card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <StaffAvatar name={user.name} photoBlobId={user.profilePhotoBlobId} className="size-14" />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-base font-extrabold">
                {user.name}
                <StatusBadge status={user.status} labels={USER_STATUS_LABELS} />
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground" dir="ltr">
                <PhoneIcon className="size-3.5" />
                {user.phone}
              </p>
            </div>
            {nurse?.ratings.average != null && (
              <div className="rounded-xl border bg-background px-3 py-2 text-center">
                <p className="text-base font-extrabold text-amber-600">★ {nurse.ratings.average}</p>
                <p className="text-[10px] text-muted-foreground">{nurse.ratings.count} تقييم</p>
              </div>
            )}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-sm lg:grid-cols-4">
            <InfoCell icon={ClipboardList} label="التخصص" value={user.specialty ?? '—'} />
            <InfoCell icon={GraduationCap} label="المؤهل" value={user.qualification ?? '—'} />
            <InfoCell
              icon={Hash}
              label="سنوات الخبرة"
              value={user.yearsOfExperience != null ? `${user.yearsOfExperience} سنة` : '—'}
            />
            <InfoCell icon={UserRound} label="الجنس" value={user.gender ? GENDER_LABELS[user.gender] ?? user.gender : '—'} />
            <InfoCell icon={Building2} label="مكان العمل" value={user.hospitalName ?? '—'} />
            <InfoCell
              icon={HeartPulse}
              label={isDoctor ? 'جهة الانتماء' : 'جهة الكادر'}
              value={user.affiliations?.[0]?.hospital?.name ?? '—'}
            />
            <InfoCell icon={CalendarDays} label="تاريخ التسجيل" value={formatDate(user.createdAt)} />
            <InfoCell icon={Clock3} label="آخر تحديث" value={formatDateTime(user.updatedAt)} />
          </div>

          {user.status === 'REJECTED' && user.rejectNote && (
            <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
              سبب الرفض: {user.rejectNote}
            </p>
          )}
        </div>
      )}

      {/* ---------- حالة التوثيق ---------- */}
      <div className="rounded-2xl border p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-extrabold">
            <span className="flex size-7 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-700 dark:text-cyan-300">
              <ShieldCheck className="size-4" />
            </span>
            حالة التوثيق
          </p>
          {summary.complete ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
              <CheckCircle2 className="size-3.5" />
              جميع المستندات مكتملة — الملف جاهز للاعتماد
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
              <AlertTriangle className="size-3.5" />
              المستندات المرفوعة: {summary.uploadedCount} من 3 — المعتمد: {summary.approvedCount}
            </span>
          )}
        </div>

        <div className="space-y-2">
          {REQUIRED_ORDER.map((type) => {
            const doc = (nurse?.documents ?? []).find((d) => d.type === type)
            return doc ? (
              <div
                key={type}
                className="flex items-center gap-3 rounded-xl border bg-card p-2.5 transition-colors hover:bg-accent/50"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary">
                  <FileText className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{DOCUMENT_TYPE_LABELS[type] ?? doc.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{doc.fileName}</p>
                  {doc.status === 'REJECTED' && doc.reviewNote && (
                    <p className="mt-0.5 text-[11px] font-semibold text-red-600 dark:text-red-400">
                      سبب الرفض: {doc.reviewNote}
                    </p>
                  )}
                </div>
                <StatusBadge status={doc.status} labels={DOCUMENT_STATUS_LABELS} />
                <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1.5" onClick={() => setViewerDoc(doc)}>
                  <FileText className="size-3.5" />
                  عرض
                </Button>
              </div>
            ) : (
              <div
                key={type}
                className="flex items-center gap-3 rounded-xl border border-dashed p-2.5 text-muted-foreground"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted/60">
                  <FileText className="size-4" />
                </span>
                <p className="flex-1 text-sm font-semibold">{DOCUMENT_TYPE_LABELS[type] ?? type}</p>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                  ⚠ لم يُرفع
                </span>
              </div>
            )
          })}
        </div>

        {otherDocs.length > 0 && (
          <div className="mt-3 space-y-2 border-t pt-3">
            <p className="text-xs font-bold text-muted-foreground">مستندات أخرى</p>
            {otherDocs.map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 rounded-xl border bg-card p-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary">
                  <FileText className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{doc.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{doc.fileName}</p>
                </div>
                <StatusBadge status={doc.status} labels={DOCUMENT_STATUS_LABELS} />
                <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1.5" onClick={() => setViewerDoc(doc)}>
                  عرض
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---------- سجل التواصل الإداري عبر واتساب ---------- */}
      <div className="rounded-2xl border p-4">
        <p className="mb-3 flex items-center gap-2 text-sm font-extrabold">
          <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
            <MessageCircle className="size-4" />
          </span>
          سجل التواصل
          <span className="text-[10px] font-medium text-muted-foreground">(رسائل واتساب — للإدارة فقط)</span>
        </p>
        {logEntries.length === 0 ? (
          <p className="rounded-xl border border-dashed p-3 text-center text-xs text-muted-foreground">
            لا توجد رسائل واتساب مسجلة لهذا الحساب بعد
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              آخر إشعار: <span className="font-bold text-foreground">{logEntries[0].title}</span> —{' '}
              {formatDateTime(logEntries[0].createdAt)}
            </p>
            <div className="max-h-40 space-y-1.5 overflow-y-auto pe-1">
              {logEntries.map((e) => (
                <div key={e.id} className="rounded-xl border bg-secondary/30 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-bold">{e.title}</p>
                    <p className="shrink-0 text-[10px] text-muted-foreground">{formatDateTime(e.createdAt)}</p>
                  </div>
                  {e.body && (
                    <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">
                      {e.body}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ---------- الإجراءات النهائية ---------- */}
      {user && (
        <div className="rounded-2xl border p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-extrabold">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BadgeCheck className="size-4" />
            </span>
            الإجراءات النهائية
          </p>

          {user.status === 'PENDING' && (
            <div className="grid gap-2 sm:grid-cols-3">
              <Button
                onClick={() => setApproveOpen(true)}
                disabled={approveMutation.isPending}
                className="gap-2 bg-emerald-600 text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-700"
              >
                <CheckCircle2 className="size-4" />
                اعتماد الحساب
              </Button>
              <Button
                variant="outline"
                className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-900 dark:text-amber-300 dark:hover:bg-amber-950"
                onClick={() => {
                  setWaReason('missing_docs')
                  setWaNote('')
                  setWaOpen(true)
                }}
              >
                <MessageCircle className="size-4" />
                طلب تعديل
              </Button>
              <Button
                variant="outline"
                className="gap-2 border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                onClick={() => {
                  setRejectNote('')
                  setRejectOpen(true)
                }}
              >
                <XCircle className="size-4" />
                رفض الحساب
              </Button>
            </div>
          )}

          {user.status === 'REJECTED' && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                onClick={() => setApproveOpen(true)}
                disabled={approveMutation.isPending}
                className="gap-2 bg-emerald-600 text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-700"
              >
                <CheckCircle2 className="size-4" />
                اعتماد الحساب
              </Button>
              <Button
                variant="outline"
                className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-900 dark:text-amber-300 dark:hover:bg-amber-950"
                onClick={() => {
                  setWaReason('other')
                  setWaNote(user.rejectNote ?? '')
                  setWaOpen(true)
                }}
              >
                <MessageCircle className="size-4" />
                إبلاغ الكادر بالسبب عبر واتساب
              </Button>
            </div>
          )}

          {user.status === 'APPROVED' && (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-xs font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
              ✓ الحساب معتمد وموثق — الإجراءات الإدارية الأخرى (إيقاف/تنشيط/نقل دور...) من قائمة الإجراءات في القائمة.
            </p>
          )}

          {user.status === 'SUSPENDED' && (
            <p className="rounded-xl border p-2.5 text-xs font-semibold text-muted-foreground">
              ⚪ الحساب موقوف إدارياً — التفعيل من قائمة الإجراءات في القائمة.
            </p>
          )}
        </div>
      )}

      {/* عارض المستندات */}
      <DocumentViewer
        document={viewerDoc}
        open={!!viewerDoc}
        onOpenChange={(open) => !open && setViewerDoc(null)}
      />

      {/* واتساب — طلب تعديل / رفض / تواصل حر */}
      <WhatsAppNotificationModal
        open={waOpen}
        onOpenChange={setWaOpen}
        target={waTarget}
        initialNote={waNote}
        initialReason={waReason}
        onSent={() => queryClient.invalidateQueries({ queryKey: ['contact-log', userId] })}
      />

      {/* تأكيد الاعتماد */}
      <ConfirmDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title={isDoctor ? 'اعتماد حساب الطبيب' : 'اعتماد حساب الكادر التمريضي'}
        description={`سيصبح حساب «${user?.name ?? ''}» معتمداً ويستطيع استلام التكليفات فوراً في منصة تكليفات.`}
        confirmLabel="نعم، اعتمد الحساب"
        tone="success"
        icon={CheckCircle2}
        processing={approveMutation.isPending}
        onConfirm={() => approveMutation.mutate()}
      />

      {/* رفض بسبب — نافذة مستقلة بحقل السبب */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <XCircle className="size-5" />
              رفض الحساب
            </DialogTitle>
            <DialogDescription>
              سيُرفض حساب «{user?.name ?? ''}» ويظهر السبب في ملفه — يمكنك بعدها إبلاغه عبر واتساب مباشرة.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason" className="text-sm font-bold">
              سبب الرفض <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reject-reason"
              autoFocus
              rows={3}
              placeholder="مثال: صورة المزاولة غير واضحة — يرجى رفع صورة مقروءة"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              إلغاء
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={rejectMutation.isPending}
              onClick={() => {
                if (rejectNote.trim().length < 3) {
                  toast.error('اكتب سبب الرفض أولاً')
                  return
                }
                rejectMutation.mutate(rejectNote.trim())
              }}
            >
              <XCircle className="size-4" />
              {rejectMutation.isPending ? 'جارٍ التنفيذ...' : 'تأكيد الرفض'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function InfoCell({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="min-w-0 rounded-xl border bg-background p-2.5">
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-bold">{value}</p>
    </div>
  )
}
