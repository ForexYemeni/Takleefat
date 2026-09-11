'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Banknote,
  CalendarDays,
  ClipboardList,
  Coins,
  CheckCircle2,
  History,
  ImagePlus,
  Landmark,
  Pencil,
  Plus,
  RefreshCw,
  Star,
  Trash2,
  UserRound,
  Wallet,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { apiFetcher, apiPost, apiPatch, apiDelete } from '@/lib/api-client'
import {
  formatDateTime,
  formatDate,
  formatCurrency,
  cn,
  ASSIGNMENT_STATUS_LABELS,
  POST_STATUS_LABELS,
  POST_GENDER_LABELS,
  PAYMENT_STATUS_LABELS,
} from '@/lib/utils'
import {
  updatePostSchema,
  type UpdatePostInput,
  type UpdatePostFormValues,
} from '@/lib/validations/post'
import { createAssignmentSchema, type CreateAssignmentInput } from '@/lib/validations/assignment'
import { StatusBadge } from '@/components/shared/status-badge'
import { CreatePostDialog } from '@/components/shared/create-post-dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { DocumentViewer, type ViewableDocument } from '@/components/shared/document-viewer'
import { Stars } from '@/components/shared/star-rating'
import { EmptyState, DashboardSkeleton } from '@/components/shared/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface AdminAssignment {
  id: string
  title: string
  description: string | null
  facility: string
  department: string | null
  startDate: string
  endDate: string | null
  status: string
  receivedAt: string | null
  createdAt: string
  value: number | null
  adminFee: number | null
  paymentStatus: string
  nurseDoneAt: string | null
  nurseConfirmedReceipt: boolean
  receiverDoneAt: string | null
  nursePaid: boolean | null
  paymentScreenshotUrl: string | null
  paymentScreenshotName: string | null
  nurse: { id: string; name: string; specialty: string | null }
  receiver: { id: string; name: string }
  rating?: { overall: number; comment: string | null } | null
  earning?: { amount: number; percent: number } | null
  _count?: { logs: number }
}

export interface AdminPost {
  id: string
  number: number
  title: string
  description: string | null
  facility: string
  department: string | null
  location: string | null
  startDate: string
  hours: number | null
  gender: string
  nursesNeeded: number
  value: number
  status: string
  createdAt: string
  hospitalId?: string | null
  distribution?: string | null
  receiver: { id: string; name: string }
  _count: { applications: number }
}

interface AssignmentLogEntry {
  id: string
  action: string
  note: string | null
  createdAt: string
  user: { name: string }
}

const STATUS_TABS = [
  { value: 'ALL', label: 'الكل' },
  { value: 'ACTIVE', label: 'جاري' },
  { value: 'RECEIVED', label: 'تم الاستلام' },
  { value: 'COMPLETED', label: 'مكتمل' },
  { value: 'CANCELLED', label: 'ملغي' },
] as const

const WITHDRAWAL_STATUS: Record<string, { label: string; className: string }> = {
  PENDING: {
    label: 'قيد المعالجة',
    className:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900',
  },
  PAID: {
    label: 'تم الصرف',
    className:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900',
  },
  REJECTED: {
    label: 'مرفوض',
    className:
      'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900',
  },
}

export default function AdminAssignmentsPage() {
  const queryClient = useQueryClient()
  const [view, setView] = useState('posts')
  const [status, setStatus] = useState('ALL')
  const [createOpen, setCreateOpen] = useState(false)
  const [details, setDetails] = useState<AdminAssignment | null>(null)
  const [pendingDeleteAssignment, setPendingDeleteAssignment] = useState<AdminAssignment | null>(null)
  const [viewScreenshot, setViewScreenshot] = useState<ViewableDocument | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-assignments'],
    queryFn: () => apiFetcher<{ assignments: AdminAssignment[] }>('/api/admin/assignments'),
  })

  const { data: postsData, isLoading: postsLoading } = useQuery({
    queryKey: ['admin-posts'],
    queryFn: () => apiFetcher<{ posts: AdminPost[] }>('/api/posts'),
  })

  const assignments = (data?.assignments ?? []).filter(
    (a) => status === 'ALL' || a.status === status
  )

  const statusMutation = useMutation({
    mutationFn: ({ id, newStatus, note }: { id: string; newStatus: string; note?: string }) =>
      apiPatch<{ message: string }>(`/api/admin/assignments/${id}`, {
        status: newStatus,
        note: note ?? '',
      }),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['admin-assignments'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      setDetails(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteAssignmentMutation = useMutation({
    mutationFn: (id: string) => apiDelete<{ message: string }>(`/api/admin/assignments/${id}`),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['admin-assignments'] })
      queryClient.invalidateQueries({ queryKey: ['admin-posts'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      setDetails(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // تأكيد/إلغاء دفع رسوم التكليف للإدارة — يوزع رسوم التكليف (ربح المستلم) فور التأكيد
  const paymentMutation = useMutation({
    mutationFn: ({ id, paymentStatus }: { id: string; paymentStatus: 'PAID' | 'UNPAID' }) =>
      apiPatch<{ message: string }>(`/api/admin/assignments/${id}`, { paymentStatus }),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['admin-assignments'] })
      queryClient.invalidateQueries({ queryKey: ['my-assignments'] })
      queryClient.invalidateQueries({ queryKey: ['receiver-earnings'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // إعادة احتساب وتوزيع رسوم التكليف — لمعالجة التكليفات القديمة التي أُنهيت دون توزيع
  const redistributeMutation = useMutation({
    mutationFn: (id: string) =>
      apiPatch<{ message: string }>(`/api/admin/assignments/${id}`, { redistributeFees: true }),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['admin-assignments'] })
      queryClient.invalidateQueries({ queryKey: ['receiver-earnings'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (isLoading || postsLoading) return <DashboardSkeleton />

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-extrabold">التكليفات</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            إنشاء التكليفات الطبية والتمريضية ومتابعتها حتى الإنجاز
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="size-4" />
          إنشاء تكليف جديد
        </Button>
      </div>

      <Tabs value={view} onValueChange={setView}>
        <TabsList className="h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="posts" className="gap-1.5">
            التكليفات المُعلنة
            <span className="text-xs text-muted-foreground">{postsData?.posts.length ?? 0}</span>
          </TabsTrigger>
          <TabsTrigger value="assignments" className="gap-1.5">
            التكليفات المؤكدة
            <span className="text-xs text-muted-foreground">{data?.assignments.length ?? 0}</span>
          </TabsTrigger>
          <TabsTrigger value="withdrawals" className="gap-1.5">
            <Coins className="size-3.5" />
            طلبات سحب الأرباح
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {view === 'posts' && <AdminPostsTab />}

      {view === 'withdrawals' && <WithdrawalsTab />}

      {view === 'assignments' && (
      <>
      <Tabs value={status} onValueChange={setStatus}>
        <TabsList className="h-auto flex-wrap justify-start gap-1">
          {STATUS_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {assignments.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="لا توجد تكليفات"
          description="ابدأ بإنشاء أول تكليف وإسناده للكادر التمريضي."
          action={
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="size-4" />
              إنشاء تكليف جديد
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/60 hover:bg-secondary/60">
                  <TableHead>التكليف</TableHead>
                  <TableHead className="hidden md:table-cell">الكادر</TableHead>
                  <TableHead className="hidden lg:table-cell">المستلم</TableHead>
                  <TableHead className="hidden lg:table-cell">المدة</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="text-start">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <p className="font-bold">{a.title}</p>
                      <p className="text-xs text-muted-foreground">{a.facility}</p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{a.nurse.name}</TableCell>
                    <TableCell className="hidden lg:table-cell">{a.receiver.name}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <p className="text-xs">{formatDate(a.startDate)}</p>
                      {a.endDate && <p className="text-xs text-muted-foreground">حتى {formatDate(a.endDate)}</p>}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={a.status} labels={ASSIGNMENT_STATUS_LABELS} />
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => setDetails(a)}>
                        التفاصيل
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      </>

      )}

      <CreateAssignmentDialog open={createOpen} onOpenChange={setCreateOpen} />

      {/* تفاصيل التكليف */}
      <Dialog open={!!details} onOpenChange={(open) => !open && setDetails(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{details?.title}</DialogTitle>
            <DialogDescription>{details?.facility}</DialogDescription>
          </DialogHeader>
          {details && (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-xl border bg-secondary/40 p-4 sm:grid-cols-2">
                <InfoRow label="الكادر التمريضي" value={details.nurse.name} />
                <InfoRow label="التخصص" value={details.nurse.specialty ?? '—'} />
                <InfoRow label="المستلم الإداري" value={details.receiver.name} />
                <InfoRow label="القسم" value={details.department ?? '—'} />
                <InfoRow label="تاريخ البدء" value={formatDate(details.startDate)} />
                <InfoRow
                  label="تاريخ الانتهاء"
                  value={details.endDate ? formatDate(details.endDate) : 'غير محدد'}
                />
                <InfoRow
                  label="وقت الاستلام"
                  value={details.receivedAt ? formatDateTime(details.receivedAt) : 'لم يُستلم بعد'}
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">الحالة:</span>
                  <StatusBadge status={details.status} labels={ASSIGNMENT_STATUS_LABELS} />
                </div>
              </div>

              {/* ---------- اللوحة المالية والإشراف ---------- */}
              <div className="space-y-3 rounded-2xl border-2 border-teal-100 bg-teal-50/40 p-4 dark:border-teal-900 dark:bg-teal-950/20">
                <p className="flex items-center gap-2 text-sm font-extrabold text-teal-800 dark:text-teal-300">
                  <Wallet className="size-4" />
                  اللوحة المالية — رسوم الإدارة والدفع
                </p>

                <div className="grid gap-3 sm:grid-cols-3">
                  <InfoRow label="قيمة التكليف" value={formatCurrency(details.value)} />
                  <InfoRow label="حصة الإدارة" value={formatCurrency(details.adminFee)} />
                  <div>
                    <p className="text-xs text-muted-foreground">حالة الدفع للإدارة</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <StatusBadge status={details.paymentStatus} labels={PAYMENT_STATUS_LABELS} />
                    </div>
                  </div>
                </div>

                <div className="grid gap-2 text-xs sm:grid-cols-2">
                  <p className="flex items-center gap-1.5 rounded-lg bg-background/70 px-3 py-2">
                    {details.nurseDoneAt ? (
                      <>
                        <CheckCircle2 className="size-3.5 text-emerald-600" />
                        <span className="font-bold">
                          الكادر أكد إنهاء التكليف واستلام المبلغ — {formatDateTime(details.nurseDoneAt)}
                        </span>
                      </>
                    ) : (
                      <>
                        <History className="size-3.5 text-muted-foreground" />
                        الكادر لم يكد إنهاء التكليف بعد
                      </>
                    )}
                  </p>
                  <p className="flex items-center gap-1.5 rounded-lg bg-background/70 px-3 py-2">
                    {details.nursePaid != null ? (
                      <>
                        <CheckCircle2 className={cn('size-3.5', details.nursePaid ? 'text-emerald-600' : 'text-red-500')} />
                        <span className="font-bold">
                          تم الدفع للممرض: {details.nursePaid ? 'نعم' : 'لا'} (تأكيد المستلم الإداري)
                        </span>
                      </>
                    ) : (
                      <>
                        <History className="size-3.5 text-muted-foreground" />
                        المستلم الإداري لم ينهِ التكليف بعد
                      </>
                    )}
                  </p>
                </div>

                {/* إثبات دفع الكادر — عرض احترافي مع التكبير */}
                <div className="rounded-xl border bg-background/70 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-extrabold">
                    <ImagePlus className="size-3.5 text-primary" />
                    إثبات دفع الكادر (لقطة الشاشة)
                  </p>
                  {details.paymentScreenshotUrl ? (
                    <button
                      type="button"
                      onClick={() =>
                        setViewScreenshot({
                          fileUrl: details.paymentScreenshotUrl!,
                          fileName: details.paymentScreenshotName ?? 'إثبات الدفع',
                          title: 'لقطة شاشة إثبات الدفع',
                          mimeType: 'image/*',
                        })
                      }
                      className="mt-2 flex items-center gap-3 rounded-lg border p-2 text-start transition-colors hover:bg-accent"
                    >
                      <img
                        src={details.paymentScreenshotUrl}
                        alt="إثبات الدفع"
                        className="size-16 rounded-md border object-cover"
                      />
                      <span>
                        <span className="block text-xs font-bold">اضغط للتكبير والمراجعة</span>
                        <span className="block text-[11px] text-muted-foreground">
                          {details.paymentScreenshotName ?? 'لقطة الشاشة'}
                        </span>
                      </span>
                    </button>
                  ) : (
                    <p className="mt-2 rounded-lg border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
                      لم يرفع الكادر إثبات دفع بعد
                    </p>
                  )}
                </div>

                {/* تقييم الكادر من المستلم */}
                {details.rating && (
                  <div className="rounded-xl border bg-background/70 p-3">
                    <p className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-1.5 font-extrabold">
                        <Star className="size-3.5 fill-amber-400 text-amber-400" />
                        تقييم المستلم للكادر
                      </span>
                      <Stars value={details.rating.overall} />
                    </p>
                    {details.rating.comment && (
                      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                        «{details.rating.comment}»
                      </p>
                    )}
                  </div>
                )}

                {/* أزرار تأكيد/إلغاء الدفع */}
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  {details.paymentStatus === 'UNPAID' ? (
                    <Button
                      size="sm"
                      className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                      disabled={paymentMutation.isPending}
                      onClick={() => paymentMutation.mutate({ id: details.id, paymentStatus: 'PAID' })}
                    >
                      <CheckCircle2 className="size-4" />
                      تأكيد دفع الرسوم للإدارة
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      disabled={paymentMutation.isPending}
                      onClick={() => paymentMutation.mutate({ id: details.id, paymentStatus: 'UNPAID' })}
                    >
                      <History className="size-4" />
                      إلغاء تأكيد الدفع
                    </Button>
                  )}
                  {details.paymentStatus === 'UNPAID' && (
                    <p className="text-[11px] leading-snug text-amber-700">
                      لن يتمكن الكادر من التقديم على تكليفات جديدة قبل تأكيد الدفع — والتأكيد يوزع رسوم
                      التكليف (ربح المستلم الإداري) فوراً حتى لو لم يُنهِ الكادر أو المستلم التكليف
                    </p>
                  )}
                  {details.status !== 'CANCELLED' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      disabled={redistributeMutation.isPending}
                      onClick={() => redistributeMutation.mutate(details.id)}
                    >
                      <RefreshCw className="size-3.5" />
                      إعادة احتساب وتوزيع الرسوم
                    </Button>
                  )}
                </div>
              </div>

              {details.description && (
                <div>
                  <p className="mb-1 text-sm font-bold">وصف التكليف</p>
                  <p className="rounded-xl border p-3 text-sm leading-relaxed text-muted-foreground">
                    {details.description}
                  </p>
                </div>
              )}

              <div className="rounded-xl border border-dashed p-3">
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <History className="size-3.5" />
                  آخر تحديث: {formatDateTime(details.createdAt)} — بواسطة إدارة منصة تكليفات
                </p>
              </div>

              <div className="flex flex-wrap gap-2 border-t pt-4">
                {details.status === 'RECEIVED' && (
                  <Button
                    className="gap-2"
                    disabled={statusMutation.isPending}
                    onClick={() =>
                      statusMutation.mutate({ id: details.id, newStatus: 'COMPLETED' })
                    }
                  >
                    <CheckCircle2 className="size-4" />
                    إنهاء التكليف (مكتمل)
                  </Button>
                )}
                {details.status === 'COMPLETED' && (
                  <Button
                    variant="outline"
                    className="gap-2"
                    disabled={statusMutation.isPending}
                    onClick={() => statusMutation.mutate({ id: details.id, newStatus: 'RECEIVED' })}
                  >
                    <History className="size-4" />
                    إعادة إلى «تم الاستلام»
                  </Button>
                )}
                {details.status !== 'CANCELLED' && details.status !== 'COMPLETED' && (
                  <Button
                    variant="destructive"
                    className="gap-2"
                    disabled={statusMutation.isPending}
                    onClick={() => statusMutation.mutate({ id: details.id, newStatus: 'CANCELLED' })}
                  >
                    <XCircle className="size-4" />
                    إلغاء التكليف
                  </Button>
                )}
                {details.status === 'CANCELLED' && (
                  <Button
                    variant="outline"
                    className="gap-2"
                    disabled={statusMutation.isPending}
                    onClick={() => statusMutation.mutate({ id: details.id, newStatus: 'ACTIVE' })}
                  >
                    <History className="size-4" />
                    إعادة تنشيط التكليف
                  </Button>
                )}
                <Button
                  variant="destructive"
                  className="gap-2"
                  disabled={deleteAssignmentMutation.isPending}
                  onClick={() => setPendingDeleteAssignment(details)}
                >
                  <Trash2 className="size-4" />
                  حذف التكليف نهائياً
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* بطاقة تأكيد حذف التكليف المؤكد */}
      <ConfirmDialog
        open={!!pendingDeleteAssignment}
        onOpenChange={(v) => !v && setPendingDeleteAssignment(null)}
        tone="danger"
        title="حذف التكليف المؤكد"
        description={
          pendingDeleteAssignment
            ? `سيتم حذف «${pendingDeleteAssignment.title}» نهائياً من سجلات المنصة مع سجل أحداثه، ويُشعر الكادر والجهة بالحذف.`
            : ''
        }
        confirmLabel="نعم، احذف نهائياً"
        processing={deleteAssignmentMutation.isPending}
        onConfirm={() => {
          if (!pendingDeleteAssignment) return
          deleteAssignmentMutation.mutate(pendingDeleteAssignment.id, {
            onSuccess: () => setPendingDeleteAssignment(null),
          })
        }}
      />

      {/* عارض لقطة شاشة إثبات الدفع — تكبير احترافي */}
      <DocumentViewer
        document={viewScreenshot}
        open={!!viewScreenshot}
        onOpenChange={(open) => !open && setViewScreenshot(null)}
      />
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-bold">{value}</p>
    </div>
  )
}

// ---------- تبويب طلبات سحب الأرباح ----------

interface AdminWithdrawal {
  id: string
  amount: number
  walletAddress: string
  accountNumber: string
  status: string
  note: string | null
  createdAt: string
  processedAt: string | null
  receiver: { id: string; name: string; phone: string }
}

function WithdrawalsTab() {
  const queryClient = useQueryClient()
  const [processing, setProcessing] = useState<AdminWithdrawal | null>(null)
  const [rejecting, setRejecting] = useState<AdminWithdrawal | null>(null)
  const [rejectNote, setRejectNote] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-withdrawals'],
    queryFn: () => apiFetcher<{ withdrawals: AdminWithdrawal[] }>('/api/admin/withdrawals'),
  })

  const processMutation = useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: 'PAID' | 'REJECTED'; note?: string }) =>
      apiPatch<{ message: string }>(`/api/admin/withdrawals/${id}`, { status, note: note ?? '' }),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['admin-withdrawals'] })
      setProcessing(null)
      setRejecting(null)
      setRejectNote('')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (isLoading) return <DashboardSkeleton />

  const withdrawals = data?.withdrawals ?? []
  const pendingCount = withdrawals.filter((w) => w.status === 'PENDING').length

  if (withdrawals.length === 0) {
    return (
      <EmptyState
        icon={Landmark}
        title="لا توجد طلبات سحب"
        description="عندما يطلب المستلم الإداري سحب أرباحه سيظهر الطلب هنا مع المبلغ ورقم الحساب وعنوان المحفظة."
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="gap-1">
          <Landmark className="size-3" />
          {withdrawals.length} طلب
        </Badge>
        {pendingCount > 0 && (
          <Badge className="gap-1 bg-amber-600">
            <Coins className="size-3" />
            {pendingCount} بانتظار المعالجة
          </Badge>
        )}
      </div>

      <div className="space-y-3">
        {withdrawals.map((w) => {
          const st = WITHDRAWAL_STATUS[w.status] ?? WITHDRAWAL_STATUS.PENDING
          return (
            <div key={w.id} className="rounded-2xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-extrabold">
                    <UserRound className="size-4 text-primary" />
                    {w.receiver.name}
                    <Badge variant="outline" className={cn('border text-[10px]', st.className)}>
                      {st.label}
                    </Badge>
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <PhoneLabel phone={w.receiver.phone} />
                  </p>
                  <div className="grid gap-1.5 text-xs sm:grid-cols-2">
                    <p className="flex items-center gap-1.5 rounded-lg bg-secondary/60 px-3 py-1.5">
                      <Banknote className="size-3.5 text-amber-600" />
                      <span className="text-muted-foreground">المبلغ المطلوب سحبه:</span>
                      <span className="font-extrabold" dir="ltr">{formatCurrency(w.amount)}</span>
                    </p>
                    <p className="flex items-center gap-1.5 rounded-lg bg-secondary/60 px-3 py-1.5">
                      <Wallet className="size-3.5 text-primary" />
                      <span className="text-muted-foreground">عنوان المحفظة:</span>
                      <span className="font-bold" dir="auto">{w.walletAddress}</span>
                    </p>
                    <p className="flex items-center gap-1.5 rounded-lg bg-secondary/60 px-3 py-1.5 sm:col-span-2">
                      <Landmark className="size-3.5 text-primary" />
                      <span className="text-muted-foreground">رقم الحساب:</span>
                      <span className="font-bold" dir="ltr">{w.accountNumber}</span>
                    </p>
                  </div>
                  <p className="text-[11px] text-muted-foreground/80">
                    طُلب بتاريخ {formatDateTime(w.createdAt)}
                    {w.processedAt ? ` — عولج بتاريخ ${formatDateTime(w.processedAt)}` : ''}
                  </p>
                  {w.note && (
                    <p className="rounded-lg bg-secondary/60 px-2.5 py-1 text-[11px] text-muted-foreground">
                      ملاحظة: {w.note}
                    </p>
                  )}
                </div>

                {w.status === 'PENDING' && (
                  <div className="flex shrink-0 flex-col gap-2">
                    <Button
                      size="sm"
                      className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                      disabled={processMutation.isPending}
                      onClick={() => setProcessing(w)}
                    >
                      <CheckCircle2 className="size-4" />
                      تم الدفع للمستلم
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2 text-red-600 hover:text-red-700"
                      disabled={processMutation.isPending}
                      onClick={() => setRejecting(w)}
                    >
                      <XCircle className="size-4" />
                      رفض الطلب
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* تأكيد صرف الأرباح */}
      <ConfirmDialog
        open={!!processing}
        onOpenChange={(v) => !v && setProcessing(null)}
        tone="success"
        icon={CheckCircle2}
        title="تأكيد صرف أرباح المستلم"
        description={
          processing
            ? `سيتم تأكيد صرف ${formatCurrency(processing.amount)} إلى المستلم «${processing.receiver.name}» — الحساب: ${processing.accountNumber} — المحفظة: ${processing.walletAddress} ويُشعَر المستلم بالصرف.`
            : ''
        }
        confirmLabel="نعم، تم الصرف"
        processing={processMutation.isPending}
        onConfirm={() => {
          if (!processing) return
          processMutation.mutate({ id: processing.id, status: 'PAID' })
        }}
      />

      {/* رفض طلب السحب */}
      <Dialog open={!!rejecting} onOpenChange={(open) => !open && setRejecting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>رفض طلب السحب</DialogTitle>
            <DialogDescription>
              سيتم رفض طلب {rejecting?.receiver.name} بمبلغ{' '}
              {rejecting ? formatCurrency(rejecting.amount) : ''} وإشعاره بالسبب.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="withdrawal-reject">سبب الرفض (يُرسل للمستلم)</Label>
            <Textarea
              id="withdrawal-reject"
              rows={2}
              placeholder="مثال: بيانات المحفظة غير صحيحة — يُرجى تحديثها وإعادة الطلب"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>
              تراجع
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectNote.trim() || processMutation.isPending}
              onClick={() => {
                if (!rejecting) return
                processMutation.mutate({ id: rejecting.id, status: 'REJECTED', note: rejectNote })
              }}
            >
              تأكيد الرفض
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function PhoneLabel({ phone }: { phone: string }) {
  return (
    <>
      <span>هاتف المستلم:</span>
      <span className="font-bold" dir="ltr">{phone}</span>
    </>
  )
}

/**
 * حوار إنشاء تكليف جديد
 */
function CreateAssignmentDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()

  const form = useForm<CreateAssignmentInput>({
    resolver: zodResolver(createAssignmentSchema),
    defaultValues: {
      title: '',
      description: '',
      facility: '',
      department: '',
      startDate: '',
      endDate: '',
      nurseId: '',
      receiverId: '',
    },
  })

  const { data: nursesData } = useQuery({
    queryKey: ['approved-nurses'],
    queryFn: () => apiFetcher<{ users: Array<{ id: string; name: string; specialty: string | null }> }>(
      '/api/admin/users?role=NURSE&status=APPROVED'
    ),
    enabled: open,
  })

  const { data: receiversData } = useQuery({
    queryKey: ['approved-receivers'],
    queryFn: () => apiFetcher<{ users: Array<{ id: string; name: string }> }>(
      '/api/admin/users?role=RECEIVER&status=APPROVED'
    ),
    enabled: open,
  })

  const createMutation = useMutation({
    mutationFn: (values: CreateAssignmentInput) =>
      apiPost<{ message: string }>('/api/admin/assignments', values),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['admin-assignments'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      onOpenChange(false)
      form.reset()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const onSubmit = (values: CreateAssignmentInput) => {
    createMutation.mutate({ ...values, endDate: '' })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>إنشاء تكليف جديد</DialogTitle>
          <DialogDescription>
            إسناد تكليف طبي/تمريضي لكادر معتمد مع تحديد الجهة المستقبِلة
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="a-title">عنوان التكليف</Label>
            <Input id="a-title" placeholder="مثال: تكليف تمريضي — قسم الطوارئ" {...form.register('title')} />
            {form.formState.errors.title && (
              <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="a-facility">الجهة الصحية</Label>
              <Input id="a-facility" placeholder="مثال: مستشفى الملكية" {...form.register('facility')} />
              {form.formState.errors.facility && (
                <p className="text-xs text-destructive">{form.formState.errors.facility.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="a-department">القسم (اختياري)</Label>
              <Input id="a-department" placeholder="مثال: العناية المركزة" {...form.register('department')} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="a-start">تاريخ البدء</Label>
              <Input
                id="a-start"
                type="date"
                {...form.register('startDate')}
              />
              {form.formState.errors.startDate && (
                <p className="text-xs text-destructive">{form.formState.errors.startDate.message}</p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>الكادر التمريضي (معتمد)</Label>
              <Select onValueChange={(v) => form.setValue('nurseId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر الكادر" />
                </SelectTrigger>
                <SelectContent>
                  {(nursesData?.users ?? []).map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.name} {n.specialty ? `— ${n.specialty}` : ''}
                    </SelectItem>
                  ))}
                  {(nursesData?.users ?? []).length === 0 && (
                    <SelectItem value="none" disabled>
                      لا يوجد كادر معتمد
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {form.formState.errors.nurseId && (
                <p className="text-xs text-destructive">{form.formState.errors.nurseId.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>المستلم الإداري (معتمد)</Label>
              <Select onValueChange={(v) => form.setValue('receiverId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر المستلم" />
                </SelectTrigger>
                <SelectContent>
                  {(receiversData?.users ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                  {(receiversData?.users ?? []).length === 0 && (
                    <SelectItem value="none" disabled>
                      لا يوجد مستلمون معتمدون
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {form.formState.errors.receiverId && (
                <p className="text-xs text-destructive">{form.formState.errors.receiverId.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="a-desc">وصف التكليف (اختياري)</Label>
            <Textarea id="a-desc" rows={3} placeholder="تفاصيل المهام والمسؤوليات..." {...form.register('description')} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={createMutation.isPending} className="gap-2">
              <CalendarDays className="size-4" />
              {createMutation.isPending ? 'جارٍ الإنشاء...' : 'إنشاء التكليف'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------- تبويب التكليفات المُعلنة (الإدارة) ----------

function AdminPostsTab() {
  const queryClient = useQueryClient()
  const [editPost, setEditPost] = useState<AdminPost | null>(null)
  const [createPostOpen, setCreatePostOpen] = useState(false)
  const [repostMode, setRepostMode] = useState(false)
  const [pendingDeletePost, setPendingDeletePost] = useState<AdminPost | null>(null)

  const { data } = useQuery({
    queryKey: ['admin-posts'],
    queryFn: () => apiFetcher<{ posts: AdminPost[] }>('/api/posts'),
  })
  const posts = data?.posts ?? []

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-posts'] })
    queryClient.invalidateQueries({ queryKey: ['admin-assignments'] })
    queryClient.invalidateQueries({ queryKey: ['my-posts'] })
    queryClient.invalidateQueries({ queryKey: ['open-posts'] })
    queryClient.invalidateQueries({ queryKey: ['stats'] })
  }

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete<{ message: string }>(`/api/posts/${id}`),
    onSuccess: (res) => {
      toast.success(res.message)
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (posts.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="لا توجد تكليفات مُعلنة"
        description="أضف تكليفاً مُعلناً يقدّم عليه الكادر التمريضي — الجهات والأقسام من قوائم الإدارة."
        action={
          <Button onClick={() => setCreatePostOpen(true)} className="gap-2">
            <Plus className="size-4" />
            إضافة تكليف مُعلن
          </Button>
        }
      />
    )
  }

  return (
    <>
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => {
            setRepostMode(true)
            setCreatePostOpen(true)
          }}
          disabled={posts.length === 0}
          title={
            posts.length === 0
              ? 'لا يوجد تكليف سابق لإعادة نشره'
              : 'أنشئ تكليفاً جديداً بنفس بيانات آخر تكليف — عدّل ما يلزم وانشر'
          }
          className="gap-2"
        >
          <History className="size-4" />
          أعد نشر آخر تكليف
        </Button>
        <Button onClick={() => setCreatePostOpen(true)} className="gap-2">
          <Plus className="size-4" />
          إضافة تكليف مُعلن
        </Button>
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/60 hover:bg-secondary/60">
                <TableHead>التكليف</TableHead>
                <TableHead className="hidden md:table-cell">الجهة / القسم</TableHead>
                <TableHead className="hidden lg:table-cell">القيمة</TableHead>
                <TableHead className="hidden lg:table-cell">الجنس / الساعات</TableHead>
                <TableHead className="hidden md:table-cell">المُعلن</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead className="text-start">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {posts.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <p className="font-bold">{p.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {p._count?.applications ?? 0} تقديم — {p.nursesNeeded} كادر مطلوب
                    </p>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <p>{p.facility}</p>
                    <p className="text-xs text-muted-foreground">{p.department ?? '—'}</p>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell" dir="ltr">
                    <span className="text-start">{formatCurrency(p.value)}</span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <p>{POST_GENDER_LABELS[p.gender] ?? 'أي جنس'}</p>
                    <p className="text-xs text-muted-foreground">{p.hours ? `${p.hours} ساعة` : '—'}</p>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{p.receiver?.name ?? '—'}</TableCell>
                  <TableCell>
                    <StatusBadge status={p.status} labels={POST_STATUS_LABELS} />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1.5">
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditPost(p)}>
                        <Pencil className="size-3.5" />
                        تعديل
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="حذف التكليف المُعلن"
                        className="text-muted-foreground hover:text-destructive"
                        disabled={deleteMutation.isPending}
                        onClick={() => setPendingDeletePost(p)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <EditPostDialog post={editPost} onOpenChange={(open) => !open && setEditPost(null)} />

      {/* إضافة تكليف مُعلن من حساب الإدارة — الجهات والأقسام من قوائم الإدارة */}
      <CreatePostDialog
        open={createPostOpen}
        onOpenChange={(open) => {
          setCreatePostOpen(open)
          if (!open) setRepostMode(false)
        }}
        repostSource={repostMode ? posts[0] ?? null : null}
        allowAudienceChoice
        onCreated={() => invalidate()}
      />

      {/* بطاقة تأكيد الحذف الاحترافية */}
      <ConfirmDialog
        open={!!pendingDeletePost}
        onOpenChange={(v) => !v && setPendingDeletePost(null)}
        tone="danger"
        title="حذف التكليف المُعلن"
        description={
          pendingDeletePost
            ? `سيتم حذف «${pendingDeletePost.title}» نهائياً وتُرفض تقديماته المعلقة بإشعار لأصحابها. لا يمكن التراجع.`
            : ''
        }
        confirmLabel="نعم، احذف التكليف"
        processing={deleteMutation.isPending}
        onConfirm={() => pendingDeletePost && deleteMutation.mutate(pendingDeletePost.id)}
      />
    </>
  )
}

// ---------- حوار تعديل التكليف المُعلن (الإدارة) ----------

function EditPostDialog({
  post,
  onOpenChange,
}: {
  post: AdminPost | null
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()

  const form = useForm<UpdatePostFormValues, unknown, UpdatePostInput>({
    resolver: zodResolver(updatePostSchema),
    values: post
      ? {
          title: post.title,
          description: post.description ?? '',
          department: post.department ?? '',
          startDate: post.startDate.slice(0, 10),
          hours: post.hours != null ? String(post.hours) : '',
          gender: post.gender as 'MALE' | 'FEMALE' | 'ANY',
          nursesNeeded: String(post.nursesNeeded),
          value: String(post.value),
          status: post.status as 'OPEN' | 'CANCELLED',
        }
      : undefined,
  })

  const editMutation = useMutation({
    mutationFn: (values: UpdatePostInput) =>
      apiPatch<{ message: string }>(`/api/posts/${post!.id}`, values),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['admin-posts'] })
      queryClient.invalidateQueries({ queryKey: ['my-posts'] })
      queryClient.invalidateQueries({ queryKey: ['open-posts'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      onOpenChange(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (!post) return null

  return (
    <Dialog open={!!post} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>تعديل التكليف المُعلن</DialogTitle>
          <DialogDescription>
            يمكنك تعديل العنوان والبيانات المالية ومتطلبات التكليف — {post.facility}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((v) => editMutation.mutate(v))}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor="ep-title">عنوان التكليف</Label>
            <Input id="ep-title" {...form.register('title')} />
            {form.formState.errors.title && (
              <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ep-value">قيمة التكليف (ريال)</Label>
              <Input id="ep-value" type="number" min={1} {...form.register('value')} />
              {form.formState.errors.value && (
                <p className="text-xs text-destructive">{form.formState.errors.value.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="ep-needed">عدد الكادر المطلوب</Label>
              <Input id="ep-needed" type="number" min={1} max={50} {...form.register('nursesNeeded')} />
              {form.formState.errors.nursesNeeded && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.nursesNeeded.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="ep-hours">عدد الساعات</Label>
              <Input id="ep-hours" type="number" min={1} max={999} {...form.register('hours')} />
            </div>
            <div className="space-y-2">
              <Label>الجنس المطلوب</Label>
              <Select
                value={form.watch('gender')}
                onValueChange={(v) => form.setValue('gender', v as UpdatePostInput['gender'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ANY">أي جنس</SelectItem>
                  <SelectItem value="MALE">ذكر</SelectItem>
                  <SelectItem value="FEMALE">أنثى</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ep-start">تاريخ البدء</Label>
              <Input id="ep-start" type="date" {...form.register('startDate')} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ep-department">القسم</Label>
              <Input id="ep-department" {...form.register('department')} />
            </div>
            <div className="space-y-2">
              <Label>الحالة</Label>
              <Select
                value={form.watch('status')}
                onValueChange={(v) => form.setValue('status', v as 'OPEN' | 'CANCELLED')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OPEN">متاح للتقديم</SelectItem>
                  <SelectItem value="CANCELLED">ملغي</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ep-desc">الوصف (اختياري)</Label>
            <Textarea id="ep-desc" rows={3} {...form.register('description')} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={editMutation.isPending} className="gap-2">
              <Pencil className="size-4" />
              {editMutation.isPending ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
