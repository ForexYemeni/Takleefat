'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Ban,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  FilePenLine,
  GraduationCap,
  Hourglass,
  Inbox,
  Info,
  Loader2,
  MessageSquareText,
  Phone,
  UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetcher, apiPatch } from '@/lib/api-client'
import { formatDate, formatDateTime, ROLE_LABELS } from '@/lib/utils'
import { StaffAvatar } from '@/components/shared/staff-avatar'
import { StatusBadge } from '@/components/shared/status-badge'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState, DashboardSkeleton } from '@/components/shared/empty-state'

/**
 * واجهة مراجعة طلبات تعديل الملف المهني — الجولة 74 (إضافي بحت كلياً)
 * ======================================================================
 * للإدارة والموارد البشرية: مقارنة واضحة (القيمة الحالية → المطلوبة) مع
 * نبذة عن الطالب (تكليفاته/تقديماته)، اعتماد يطبّق القيم فوراً + إشعار،
 * ورفض بملاحظة تصل لصاحب الطلب. الطالب الراجَه يُحدَّث لحظياً بلا تحديث صفحة.
 */

interface ReviewRequest {
  id: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  requestedSpecialty: string | null
  requestedQualification: string | null
  requestedYearsOfExperience: number | null
  note: string | null
  reviewNote: string | null
  reviewedAt: string | null
  createdAt: string
  reviewerName: string | null
  applicant: {
    id: string
    name: string
    phoneMasked: string
    role: string
    gender: string | null
    accountStatus: string
    specialty: string | null
    qualification: string | null
    yearsOfExperience: number | null
    photoUrl: string | null
    memberSince: string
    assignmentsCount: number
    applicationsCount: number
  }
}

interface Payload {
  pendingCount: number
  requests: ReviewRequest[]
}

interface FieldDiff {
  label: string
  from: string
  to: string
}

const isDoctorRole = (role: string) => role === 'DOCTOR'

function buildDiffs(r: ReviewRequest): FieldDiff[] {
  const a = r.applicant
  const diffs: FieldDiff[] = []
  if (r.requestedSpecialty != null) {
    diffs.push({ label: 'التخصص', from: a.specialty ?? '—', to: r.requestedSpecialty })
  }
  if (r.requestedQualification != null) {
    diffs.push({ label: 'المؤهل العلمي', from: a.qualification ?? '—', to: r.requestedQualification })
  }
  if (r.requestedYearsOfExperience != null) {
    diffs.push({
      label: 'سنوات الخبرة',
      from: a.yearsOfExperience != null ? `${a.yearsOfExperience} سنة` : '—',
      to: `${r.requestedYearsOfExperience} سنة`,
    })
  }
  return diffs
}

export function ProfileEditReview() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'PENDING' | 'DECIDED'>('PENDING')
  const [deciding, setDeciding] = useState<ReviewRequest | null>(null)
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED' | null>(null)
  const [note, setNote] = useState('')
  const [processing, setProcessing] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['profile-edit-requests-review'],
    queryFn: () => apiFetcher<Payload>('/api/profile-edit-requests'),
  })

  const closeDecision = () => {
    setDecision(null)
    setDeciding(null)
    setNote('')
  }

  const submitDecision = async () => {
    if (!deciding || !decision) return
    setProcessing(true)
    try {
      const res = await apiPatch<{ message: string }>(`/api/profile-edit-requests/${deciding.id}`, {
        decision,
        ...(note.trim() ? { reviewNote: note.trim() } : {}),
      })
      toast.success(res.message)
      qc.invalidateQueries({ queryKey: ['profile-edit-requests-review'] })
      closeDecision()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setProcessing(false)
    }
  }

  if (isLoading) return <DashboardSkeleton />
  if (error || !data) {
    return <EmptyState icon={Inbox} title="تعذر تحميل الطلبات" description={(error as Error)?.message} />
  }

  const pending = data.requests.filter((r) => r.status === 'PENDING')
  const decided = data.requests.filter((r) => r.status !== 'PENDING')
  const list = tab === 'PENDING' ? pending : decided

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'PENDING' | 'DECIDED')}>
        <TabsList>
          <TabsTrigger value="PENDING" className="gap-1.5">
            <Hourglass className="size-3.5" />
            قيد المراجعة
            {data.pendingCount > 0 && (
              <Badge className="ms-1 bg-amber-500 px-1.5 text-[10px] text-white">{data.pendingCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="DECIDED" className="gap-1.5">
            <CheckCircle2 className="size-3.5" />
            محسومة ({decided.length})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {list.length === 0 ? (
        <EmptyState
          icon={tab === 'PENDING' ? FilePenLine : CheckCircle2}
          title={tab === 'PENDING' ? 'لا طلبات قيد المراجعة' : 'لا طلبات محسومة بعد'}
          description={
            tab === 'PENDING'
              ? 'عند إرسال أي كادر أو طبيب طلب تعديل على ملفه المهني سيظهر هنا فوراً مع إشعار.'
              : 'الطلبات المعتمدة أو المرفوضة تُؤرشف هنا مع سجل المراجعة الكامل.'
          }
        />
      ) : (
        <div className="space-y-3">
          {list.map((r) => {
            const diffs = buildDiffs(r)
            const doctor = isDoctorRole(r.applicant.role)
            return (
              <Card key={r.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    {/* هوية الطالب */}
                    <div className="flex min-w-0 items-center gap-3">
                      <StaffAvatar
                        name={r.applicant.name}
                        photoUrl={r.applicant.photoUrl}
                        className={`size-12 rounded-2xl text-lg ${
                          doctor
                            ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                            : 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-1.5 text-sm font-black">
                          {r.applicant.name}
                          <Badge
                            className={`border-transparent text-[10px] ${
                              doctor ? 'bg-indigo-600 text-white' : 'bg-teal-600 text-white'
                            }`}
                          >
                            {doctor ? 'طبيب' : 'كادر صحي'}
                          </Badge>
                          <StatusBadge status={r.applicant.accountStatus} labels={{ APPROVED: 'معتمد', PENDING: 'قيد المراجعة', REJECTED: 'مرفوض', SUSPENDED: 'موقوف' }} />
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <UserRound className="size-3" />
                            {ROLE_LABELS[r.applicant.role] ?? r.applicant.role}
                          </span>
                          <span className="flex items-center gap-1" dir="ltr">
                            <Phone className="size-3" />
                            {r.applicant.phoneMasked}
                          </span>
                          <span className="flex items-center gap-1">
                            <BriefcaseBusiness className="size-3" />
                            {r.applicant.assignmentsCount} تكليف · {r.applicant.applicationsCount} تقديم
                          </span>
                          <span className="flex items-center gap-1">
                            <CalendarDays className="size-3" />
                            منذ {formatDate(r.applicant.memberSince)}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {r.status === 'PENDING' ? (
                        <>
                          <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-[11px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                            <Hourglass className="size-3" />
                            بانتظار القرار
                          </Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 border-red-200 text-red-700 hover:bg-red-50 dark:text-red-300"
                            onClick={() => {
                              setDecision('REJECTED')
                              setDeciding(r)
                              setNote('')
                            }}
                          >
                            <Ban className="size-3.5" />
                            رفض
                          </Button>
                          <Button
                            size="sm"
                            className="gap-1.5"
                            onClick={() => {
                              setDecision('APPROVED')
                              setDeciding(r)
                              setNote('')
                            }}
                          >
                            <CheckCircle2 className="size-3.5" />
                            اعتماد
                          </Button>
                        </>
                      ) : (
                        <div className="flex flex-col items-end gap-1">
                          <Badge
                            variant="outline"
                            className={`gap-1 text-[11px] ${
                              r.status === 'APPROVED'
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                : 'border-red-300 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                            }`}
                          >
                            {r.status === 'APPROVED' ? (
                              <CheckCircle2 className="size-3" />
                            ) : (
                              <Ban className="size-3" />
                            )}
                            {r.status === 'APPROVED' ? 'معتمد — طُبِّقت القيم' : 'مرفوض'}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {r.reviewerName ? `راجعه ${r.reviewerName} — ` : ''}
                            {r.reviewedAt ? formatDateTime(r.reviewedAt) : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  {/* مقارنة القيم: الحالي → المطلوب */}
                  <div className="grid gap-2 sm:grid-cols-3">
                    {diffs.map((d) => (
                      <div key={d.label} className="rounded-2xl border p-3">
                        <p className="flex items-center gap-1.5 text-[11px] font-extrabold text-muted-foreground">
                          <Info className="size-3.5 text-primary" />
                          {d.label}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm">
                          <span className="font-bold text-muted-foreground line-through decoration-red-400/70">
                            {d.from}
                          </span>
                          <span className="text-muted-foreground">←</span>
                          <span className="rounded-lg bg-emerald-50 px-2 py-0.5 font-extrabold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                            {d.to}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {r.note && (
                    <p className="flex gap-2 rounded-2xl bg-secondary/50 p-3 text-[13px] leading-relaxed">
                      <MessageSquareText className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>
                        <span className="font-extrabold">ملاحظة الطالب: </span>
                        {r.note}
                      </span>
                    </p>
                  )}

                  {r.status !== 'PENDING' && r.reviewNote && (
                    <p className="rounded-2xl border border-primary/20 bg-primary/5 p-3 text-[13px] leading-relaxed">
                      <span className="font-extrabold">ملاحظة المراجعة: </span>
                      {r.reviewNote}
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ============ تأكيد الاعتماد ============ */}
      <ConfirmDialog
        open={decision === 'APPROVED' && !!deciding}
        onOpenChange={(v) => !v && closeDecision()}
        title="اعتماد طلب تعديل الملف المهني"
        description={
          deciding
            ? `سيتم تحديث بيانات ${deciding.applicant.name} فوراً: ${buildDiffs(deciding)
                .map((d) => `${d.label} → «${d.to}»`)
                .join('، ')} ويصله إشعار بالتطبيق. هل تريد المتابعة؟`
            : ''
        }
        confirmLabel="نعم، اعتمد وطَبِّق"
        tone="success"
        icon={CheckCircle2}
        processing={processing}
        onConfirm={submitDecision}
      />

      {/* ============ الرفض مع ملاحظة ============ */}
      <Dialog open={decision === 'REJECTED' && !!deciding} onOpenChange={(v) => !v && closeDecision()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="size-5 text-red-600" />
              رفض طلب التعديل
            </DialogTitle>
            <DialogDescription>
              {deciding?.applicant.name} — ستصله ملاحظتك ليعيد إرسال الطلب بصيغة صحيحة. الملاحظة
              اختيارية لكنها تساعد صاحب الطلب.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-note">ملاحظة الرفض (اختيارية)</Label>
            <Textarea
              id="reject-note"
              rows={3}
              maxLength={400}
              placeholder="مثال: سنوات الخبرة لا تطابق المستندات المرفقة — راجع مستند خبرتك وأعد الإرسال"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeDecision} disabled={processing}>
              إلغاء
            </Button>
            <Button
              variant="destructive"
              className="gap-2"
              disabled={processing}
              onClick={submitDecision}
            >
              {processing ? <Loader2 className="size-4 animate-spin" /> : <Ban className="size-4" />}
              تأكيد الرفض
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** ترويسة الصفحة المشتركة بين لوحتَي الإدارة والموارد البشرية */
export function ProfileEditReviewHeader({ subtitle }: { subtitle: string }) {
  return (
    <div>
      <h1 className="flex items-center gap-2 text-2xl font-extrabold">
        <FilePenLine className="size-6 text-primary" />
        طلبات تعديل الملفات المهنية
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <GraduationCap className="size-3.5" />
        المؤهل يُتحقق من كتالوج المنصة — الاعتماد يطبّق القيم على الحساب فوراً ويحدّث سيرته
        الذاتية وبطاقته المهنية
      </p>
    </div>
  )
}
