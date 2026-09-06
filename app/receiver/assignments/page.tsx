'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BadgeCheck,
  Banknote,
  CalendarDays,
  Clock,
  Inbox,
  MapPin,
  PackageCheck,
  Plus,
  Star,
  UserRound,
  Users,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { apiFetcher, apiPost, apiPatch } from '@/lib/api-client'
import {
  cn,
  formatDate,
  formatDateTime,
  formatCurrency,
  ASSIGNMENT_STATUS_LABELS,
  POST_STATUS_LABELS,
  POST_GENDER_LABELS,
} from '@/lib/utils'
import {
  createPostSchema,
  type CreatePostInput,
  type CreatePostFormValues,
} from '@/lib/validations/post'
import { StatusBadge } from '@/components/shared/status-badge'
import { EmptyState, DashboardSkeleton } from '@/components/shared/empty-state'
import { ApplicantCV, type ApplicantData } from '@/components/receiver/applicant-cv'
import { Stars, StarRatingInput } from '@/components/shared/star-rating'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// ---------- الأنواع ----------

interface ReceiverPost {
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
  _count: { applications: number }
  assignments?: Array<{ id: string; nurse: { id: string; name: string } }>
}

interface ReceiverAssignment {
  id: string
  title: string
  description: string | null
  facility: string
  department: string | null
  startDate: string
  endDate: string | null
  status: string
  receivedAt: string | null
  value: number | null
  nurseDoneAt: string | null
  nurseConfirmedReceipt: boolean
  receiverDoneAt: string | null
  nursePaid: boolean | null
  nurse: { id: string; name: string; specialty: string | null }
  rating?: { overall: number; comment: string | null; createdAt: string } | null
  earning?: { amount: number; percent: number } | null
}

interface PlatformSettings {
  feeMode: 'APPLICATION' | 'ADMIN'
  applicationFee: number
  adminFeeType: 'PERCENTAGE' | 'FIXED'
  adminPercentage: number
  adminFeeFixed: number
  paymentMethod: string
  paymentAccountNumber: string
  paymentAccountName: string
  paymentNotes: string
}

interface Hospital {
  id: string
  name: string
  location: string | null
}

interface Department {
  id: string
  name: string
}

export default function ReceiverAssignmentsPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState('posts')
  const [createOpen, setCreateOpen] = useState(false)
  const [applicationsPost, setApplicationsPost] = useState<ReceiverPost | null>(null)

  const { data: postsData, isLoading: postsLoading } = useQuery({
    queryKey: ['my-posts'],
    queryFn: () =>
      apiFetcher<{ posts: ReceiverPost[]; nextNumber: number }>('/api/posts'),
  })

  const { data: assignmentsData, isLoading: assignmentsLoading } = useQuery({
    queryKey: ['my-assignments'],
    queryFn: () =>
      apiFetcher<{ assignments: ReceiverAssignment[]; settings: PlatformSettings }>(
        '/api/me/assignments'
      ),
  })

  const posts = postsData?.posts ?? []
  const nextNumber = postsData?.nextNumber ?? 1
  const assignments = assignmentsData?.assignments ?? []
  const settings = assignmentsData?.settings

  const pendingReceipt = assignments.filter((a) => a.status === 'ACTIVE')

  if (postsLoading || assignmentsLoading) return <DashboardSkeleton />

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-extrabold">التكليفات</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            أعلن عن تكليفاتك، راجع سير الكادر المتقدم، واعتمد الأنسب — أو تأكّد من التكليفات المؤكدة
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="shrink-0 gap-2">
          <Plus className="size-4" />
          إنشاء تكليف جديد
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="posts" className="gap-1.5">
            تكليفاتي المُعلنة
            <span className="text-xs text-muted-foreground">{posts.length}</span>
          </TabsTrigger>
          <TabsTrigger value="confirmed" className="gap-1.5">
            التكليفات المؤكدة
            <span className="text-xs text-muted-foreground">{assignments.length}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'posts' && (
        <MyPosts
          posts={posts}
          onOpenApplications={(post) => setApplicationsPost(post)}
          settings={settings}
        />
      )}

      {tab === 'confirmed' && <ConfirmedAssignments assignments={assignments} />}

      <CreatePostDialog open={createOpen} onOpenChange={setCreateOpen} nextNumber={nextNumber} />

      {/* حوار مراجعة التقديمات */}
      <Dialog
        open={!!applicationsPost}
        onOpenChange={(open) => !open && setApplicationsPost(null)}
      >
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>التقديمات — {applicationsPost?.title}</DialogTitle>
            <DialogDescription>
              راجع السيرة الذاتية لكل متقدم ثم اعتمد الأنسب أو ارفض مع ذكر السبب
            </DialogDescription>
          </DialogHeader>
          {applicationsPost && (
            <ApplicationsReview
              postId={applicationsPost.id}
              nursesNeeded={applicationsPost.nursesNeeded}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------- تكليفاتي المُعلنة ----------

function MyPosts({
  posts,
  onOpenApplications,
  settings,
}: {
  posts: ReceiverPost[]
  onOpenApplications: (post: ReceiverPost) => void
  settings?: PlatformSettings
}) {
  const queryClient = useQueryClient()

  const cancelMutation = useMutation({
    mutationFn: (id: string) => apiPatch<{ message: string }>(`/api/posts/${id}`, { status: 'CANCELLED' }),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['my-posts'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (posts.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="لا توجد تكليفات مُعلنة بعد"
        description="أنشئ أول تكليف ليظهر للكادر التمريضي ويقدّم عليه — ثم راجع سيرهم الذاتية واعتمد الأنسب."
      />
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {posts.map((post) => {
        const pendingCount = post._count?.applications ?? 0
        const approvedCount = post.assignments?.length ?? 0
        return (
          <Card key={post.id} className={post.status === 'OPEN' ? 'border-teal-200 bg-teal-50/30' : ''}>
            <CardContent className="space-y-3 p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold">{post.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {post.facility}
                    {post.department ? ` — ${post.department}` : ''}
                  </p>
                </div>
                <StatusBadge status={post.status} labels={POST_STATUS_LABELS} />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-secondary/60 p-2.5">
                  <p className="text-muted-foreground">قيمة التكليف</p>
                  <p className="mt-0.5 font-extrabold text-primary" dir="ltr">
                    {formatCurrency(post.value)}
                  </p>
                </div>
                <div className="rounded-lg bg-secondary/60 p-2.5">
                  <p className="text-muted-foreground">تاريخ البدء</p>
                  <p className="mt-0.5 font-bold">{formatDate(post.startDate)}</p>
                </div>
                <div className="rounded-lg bg-secondary/60 p-2.5">
                  <p className="text-muted-foreground">الموقع (تلقائي من الجهة)</p>
                  <p className="mt-0.5 font-bold">{post.location ?? 'غير محدد'}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="secondary" className="gap-1">
                  <Users className="size-3" />
                  {pendingCount} تقديم بانتظار المراجعة
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <BadgeCheck className="size-3" />
                  {approvedCount} / {post.nursesNeeded} كادر معتمد
                </Badge>
                {post.hours ? (
                  <Badge variant="outline" className="gap-1">
                    <Clock className="size-3" />
                    {post.hours} ساعة
                  </Badge>
                ) : null}
                <Badge variant="outline" className="gap-1">
                  <UserRound className="size-3" />
                  {POST_GENDER_LABELS[post.gender] ?? 'أي جنس'}
                </Badge>
              </div>

              {post.status === 'OPEN' ? (
                <Button className="w-full gap-2" onClick={() => onOpenApplications(post)}>
                  <Users className="size-4" />
                  مراجعة التقديمات والسيرة الذاتية
                </Button>
              ) : (
                <p className="flex items-center gap-1.5 rounded-xl bg-cyan-50 px-3 py-2 text-xs font-bold text-cyan-700">
                  <BadgeCheck className="size-3.5" />
                  اكتمل اختيار الكادر لهذا التكليف — تابع التكليف المؤكد من تبويب «التكليفات المؤكدة»
                </p>
              )}

              {post.status === 'OPEN' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground hover:text-destructive"
                  disabled={cancelMutation.isPending}
                  onClick={() => cancelMutation.mutate(post.id)}
                >
                  <XCircle className="size-3.5" />
                  إلغاء الإعلان
                </Button>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// ---------- مراجعة التقديمات ----------

function ApplicationsReview({ postId, nursesNeeded }: { postId: string; nursesNeeded: number }) {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['post-applications', postId],
    queryFn: () => apiFetcher<{ applications: ApplicantData[] }>(`/api/posts/${postId}/applications`),
  })

  const reviewMutation = useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: 'APPROVE' | 'REJECT'; note?: string }) =>
      apiPatch<{ message: string }>(`/api/applications/${id}`, { action, note: note ?? '' }),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['post-applications', postId] })
      queryClient.invalidateQueries({ queryKey: ['my-posts'] })
      queryClient.invalidateQueries({ queryKey: ['my-assignments'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (isLoading) return <p className="py-8 text-center text-sm text-muted-foreground">جارٍ تحميل التقديمات...</p>

  const applications = data?.applications ?? []
  if (applications.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        لا توجد تقديمات بعد — سيصلك إشعار فور تقديم أي كادر على هذا التكليف
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
        المطلوب: {nursesNeeded} كادر — عند اكتمال العدد يُغلق التكليف تلقائياً وتُرفض بقية التقديمات
      </p>
      {applications.map((applicant) => (
        <ApplicantCV
          key={applicant.applicationId}
          applicant={applicant}
          reviewing={reviewMutation.isPending}
          onReview={(id, action, note) => reviewMutation.mutate({ id, action, note })}
        />
      ))}
    </div>
  )
}

// ---------- التكليفات المؤكدة ----------

function ConfirmedAssignments({ assignments }: { assignments: ReceiverAssignment[] }) {
  const queryClient = useQueryClient()
  const [completing, setCompleting] = useState<ReceiverAssignment | null>(null)

  const receiveMutation = useMutation({
    mutationFn: (id: string) => apiPost<{ message: string }>(`/api/me/assignments/${id}/receive`, {}),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['my-assignments'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (assignments.length === 0) {
    return (
      <EmptyState
        icon={PackageCheck}
        title="لا توجد تكليفات مؤكدة"
        description="تظهر هنا التكليفات المؤكدة بعد اعتماد تقديمات الكادر أو الإسناد المباشر من الإدارة."
      />
    )
  }

  const pendingReceipt = assignments.filter((a) => a.status === 'ACTIVE')
  const working = assignments.filter((a) => a.status === 'RECEIVED')
  const finished = assignments.filter((a) => a.status === 'COMPLETED' || a.status === 'CANCELLED')

  return (
    <div className="space-y-5">
      {/* بانتظار تأكيد الاستلام — تكليفات الإسناد المباشر */}
      {pendingReceipt.length > 0 && (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-bold text-amber-700">
            <Inbox className="size-4" />
            بانتظار تأكيد الاستلام ({pendingReceipt.length})
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {pendingReceipt.map((a) => (
              <Card key={a.id} className="border-amber-200 bg-amber-50/40">
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold">{a.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {a.facility}
                        {a.department ? ` — ${a.department}` : ''}
                      </p>
                    </div>
                    <StatusBadge status={a.status} labels={ASSIGNMENT_STATUS_LABELS} />
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="secondary" className="gap-1">
                      الكادر: {a.nurse.name}
                    </Badge>
                    {a.nurse.specialty && <Badge variant="outline">{a.nurse.specialty}</Badge>}
                    {a.value != null && (
                      <Badge variant="outline" className="gap-1">
                        <Banknote className="size-3" />
                        {formatCurrency(a.value)}
                      </Badge>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    تاريخ البدء: {formatDate(a.startDate)}
                  </p>

                  <Button
                    className="w-full gap-2"
                    onClick={() => receiveMutation.mutate(a.id)}
                    disabled={receiveMutation.isPending}
                  >
                    <PackageCheck className="size-4" />
                    {receiveMutation.isPending ? 'جارٍ التأكيد...' : 'تأكيد استلام التكليف'}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* تكليفات جارية — تم اختيار الكادر */}
      {working.length > 0 && (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-bold text-cyan-700">
            <PackageCheck className="size-4" />
            تكليفات جارية ({working.length})
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {working.map((a) => (
              <Card key={a.id} className="border-cyan-200 bg-cyan-50/30">
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold">{a.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {a.facility}
                        {a.department ? ` — ${a.department}` : ''}
                      </p>
                    </div>
                    <StatusBadge status={a.status} labels={ASSIGNMENT_STATUS_LABELS} />
                  </div>

                  <p className="flex items-center gap-1.5 rounded-xl bg-cyan-50 px-3 py-2 text-xs font-bold text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300">
                    <BadgeCheck className="size-4" />
                    تم اختيار الكادر: {a.nurse.name}
                    {a.nurse.specialty ? ` — ${a.nurse.specialty}` : ''}
                  </p>

                  <div className="flex flex-wrap gap-2 text-xs">
                    {a.value != null && (
                      <Badge variant="outline" className="gap-1">
                        <Banknote className="size-3" />
                        قيمة التكليف {formatCurrency(a.value)}
                      </Badge>
                    )}
                    <Badge variant="outline" className="gap-1">
                      <CalendarDays className="size-3" />
                      {formatDate(a.startDate)}
                    </Badge>
                  </div>

                  {a.nurseDoneAt ? (
                    <p className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                      <BadgeCheck className="size-3.5" />
                      أكد الكادر انتهاء التكليف واستلام المبلغ — {formatDateTime(a.nurseDoneAt)}
                    </p>
                  ) : (
                    <p className="rounded-xl bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
                      الكادر يعمل على التكليف حالياً — عند الانتهاء اضغط «تم انتهاء التكليف» لتأكيد
                      الدفع وتقييم الكادر
                    </p>
                  )}

                  <Button className="w-full gap-2" onClick={() => setCompleting(a)}>
                    <BadgeCheck className="size-4" />
                    تم انتهاء التكليف
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* تكليفات منتهية */}
      {finished.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-bold">تكليفات منتهية ({finished.length})</p>
          <div className="grid gap-4 md:grid-cols-2">
            {finished.map((a) => (
              <Card key={a.id}>
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold">{a.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {a.facility}
                        {a.department ? ` — ${a.department}` : ''}
                      </p>
                    </div>
                    <StatusBadge status={a.status} labels={ASSIGNMENT_STATUS_LABELS} />
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="secondary" className="gap-1">
                      الكادر: {a.nurse.name}
                    </Badge>
                    {a.status === 'COMPLETED' && a.nursePaid != null && (
                      <Badge
                        className={
                          a.nursePaid
                            ? 'gap-1 bg-emerald-600'
                            : 'gap-1 bg-red-600'
                        }
                      >
                        {a.nursePaid ? 'تم الدفع للممرض' : 'لم يتم الدفع للممرض'}
                      </Badge>
                    )}
                    {a.earning && (
                      <Badge variant="outline" className="gap-1">
                        <Banknote className="size-3" />
                        ربحك: {formatCurrency(a.earning.amount)} ({a.earning.percent}٪)
                      </Badge>
                    )}
                  </div>

                  {a.rating && (
                    <div className="rounded-xl border bg-secondary/40 p-3">
                      <p className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-bold">تقييمك للكادر</span>
                        <Stars value={a.rating.overall} />
                      </p>
                      {a.rating.comment && (
                        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                          «{a.rating.comment}»
                        </p>
                      )}
                    </div>
                  )}

                  {a.receiverDoneAt && (
                    <p className="text-xs text-muted-foreground">
                      تم الإنهاء بتاريخ {formatDateTime(a.receiverDoneAt)}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* بطاقة الإنهاء والتقييم الاحترافية */}
      <CompleteAssignmentDialog
        assignment={completing}
        onClose={() => setCompleting(null)}
      />
    </div>
  )
}

// ---------- بطاقة إنهاء التكليف + التقييم الاحترافي ----------

const RATING_AXES = [
  { key: 'punctuality', label: 'الالتزام بالمواعيد' },
  { key: 'quality', label: 'جودة الأداء الطبي' },
  { key: 'communication', label: 'التعامل والتواصل' },
  { key: 'discipline', label: 'الانضباط المهني' },
] as const

function CompleteAssignmentDialog({
  assignment,
  onClose,
}: {
  assignment: ReceiverAssignment | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [nursePaid, setNursePaid] = useState<boolean | null>(null)
  const [overall, setOverall] = useState(0)
  const [axes, setAxes] = useState<Record<string, number>>({})
  const [comment, setComment] = useState('')

  const mutation = useMutation({
    mutationFn: (id: string) =>
      apiPost<{ message: string }>(`/api/me/assignments/${id}/receiver-complete`, {
        nursePaid,
        rating: {
          overall,
          punctuality: axes.punctuality || undefined,
          quality: axes.quality || undefined,
          communication: axes.communication || undefined,
          discipline: axes.discipline || undefined,
          comment,
        },
      }),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['my-assignments'] })
      queryClient.invalidateQueries({ queryKey: ['my-posts'] })
      queryClient.invalidateQueries({ queryKey: ['receiver-earnings'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (!assignment) return null

  const canSubmit = nursePaid !== null && overall > 0

  const submit = () => {
    if (!canSubmit) {
      toast.error('حدد هل تم الدفع للممرض وقيّم الكادر أولاً')
      return
    }
    mutation.mutate(assignment.id)
  }

  return (
    <Dialog open={!!assignment} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <BadgeCheck className="size-4.5" />
            </span>
            تم انتهاء التكليف — {assignment.title}
          </DialogTitle>
          <DialogDescription>
            خطوتان أخيرتان: تأكيد الدفع للكادر، ثم تقييمه بشكل احترافي — يظهر تقييمك في ملف
            الكادر ويُضاف إلى سيرته الذاتية عند التقديم لأي تكليف آخر
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* السؤال الأول: هل تم الدفع للممرض؟ */}
          <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
            <p className="flex items-center gap-2 text-sm font-extrabold text-amber-800 dark:text-amber-200">
              <Banknote className="size-4" />
              هل تم الدفع للممرض ({assignment.nurse.name})؟
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setNursePaid(true)}
                className={cn(
                  'rounded-xl border-2 px-4 py-3 text-sm font-extrabold transition-all',
                  nursePaid === true
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'border-border bg-background hover:border-emerald-300'
                )}
              >
                نعم، تم الدفع
              </button>
              <button
                type="button"
                onClick={() => setNursePaid(false)}
                className={cn(
                  'rounded-xl border-2 px-4 py-3 text-sm font-extrabold transition-all',
                  nursePaid === false
                    ? 'border-red-500 bg-red-50 text-red-700 shadow-sm dark:bg-red-950/40 dark:text-red-300'
                    : 'border-border bg-background hover:border-red-300'
                )}
              >
                لا، لم يتم الدفع
              </button>
            </div>
          </div>

          {/* السؤال الثاني: التقييم الاحترافي */}
          <div className="rounded-2xl border bg-gradient-to-bl from-amber-50 to-transparent p-4 dark:from-amber-950/20">
            <p className="flex items-center gap-2 text-sm font-extrabold">
              <Star className="size-4 fill-amber-400 text-amber-400" />
              تقييم الكادر — {assignment.nurse.name}
            </p>

            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-bold">التقييم العام</span>
                <StarRatingInput value={overall} onChange={setOverall} />
              </div>

              {RATING_AXES.map((axis) => (
                <div key={axis.key} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{axis.label}</span>
                  <StarRatingInput
                    size="sm"
                    value={axes[axis.key] ?? 0}
                    onChange={(v) => setAxes((prev) => ({ ...prev, [axis.key]: v }))}
                  />
                </div>
              ))}

              <div className="space-y-1.5">
                <Label htmlFor="rating-comment">تعليق على أداء الكادر (يظهر في سيرته الذاتية)</Label>
                <Textarea
                  id="rating-comment"
                  rows={3}
                  placeholder="مثال: أداء متميز والتزام عالٍ بالمسؤولية — أنصح بالتعامل معه"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={onClose}>
              تراجع
            </Button>
            <Button
              className="gap-2"
              disabled={!canSubmit || mutation.isPending}
              onClick={submit}
            >
              <BadgeCheck className="size-4" />
              {mutation.isPending ? 'جارٍ الإنهاء...' : 'إنهاء التكليف وإرسال التقييم'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------- إنشاء تكليف مُعلن ----------

function CreatePostDialog({
  open,
  onOpenChange,
  nextNumber,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  nextNumber: number
}) {
  const queryClient = useQueryClient()
  const [selectedHospital, setSelectedHospital] = useState<Hospital | null>(null)

  const form = useForm<CreatePostFormValues, unknown, CreatePostInput>({
    resolver: zodResolver(createPostSchema),
    defaultValues: {
      title: '',
      description: '',
      hospitalId: '',
      department: '',
      location: '',
      startDate: '',
      nursesNeeded: '1',
      hours: '',
      gender: 'ANY',
      value: '',
    },
  })

  // الجهات الصحية والأقسام — تُدار من حساب الإدارة
  const { data: hospitalsData } = useQuery({
    queryKey: ['hospitals'],
    queryFn: () => apiFetcher<{ hospitals: Hospital[] }>('/api/hospitals'),
    enabled: open,
  })
  const { data: departmentsData } = useQuery({
    queryKey: ['departments'],
    queryFn: () => apiFetcher<{ departments: Department[] }>('/api/departments'),
    enabled: open,
  })
  const hospitals = hospitalsData?.hospitals ?? []
  const departments = departmentsData?.departments ?? []

  const createMutation = useMutation({
    mutationFn: (values: CreatePostInput) => apiPost<{ message: string }>('/api/posts', values),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['my-posts'] })
      queryClient.invalidateQueries({ queryKey: ['open-posts'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      onOpenChange(false)
      form.reset()
      setSelectedHospital(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const onSubmit = (values: CreatePostInput) => {
    createMutation.mutate(values)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>إنشاء تكليف جديد — التكليف رقم {nextNumber}</DialogTitle>
          <DialogDescription>
            سيظهر العنوان تلقائياً «التكليف رقم {nextNumber}» (ويمكن الإدارة تعديله لاحقاً) — الجهة
            الصحية تُختار من مستشفيات الإدارة والموقع يُعبأ تلقائياً — بدون تاريخ انتهاء
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="p-title">عنوان التكليف (اختياري)</Label>
            <Input
              id="p-title"
              placeholder={`اتركه فارغاً ليكون: التكليف رقم ${nextNumber}`}
              {...form.register('title')}
            />
            {form.formState.errors.title && (
              <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>الجهة الصحية (من مستشفيات الإدارة)</Label>
              <Select
                onValueChange={(v) => {
                  const h = hospitals.find((x) => x.id === v) ?? null
                  setSelectedHospital(h)
                  form.setValue('hospitalId', v, { shouldValidate: true })
                  // الموقع الفعلي يُعبأ تلقائياً بحسب الجهة الصحية
                  form.setValue('location', h?.location ?? '')
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر المستشفى" />
                </SelectTrigger>
                <SelectContent>
                  {hospitals.map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.name}
                      {h.location ? ` — ${h.location}` : ''}
                    </SelectItem>
                  ))}
                  {hospitals.length === 0 && (
                    <SelectItem value="none" disabled>
                      لا توجد مستشفيات — تُضاف من حساب الإدارة
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {form.formState.errors.hospitalId && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.hospitalId.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>القسم (من قوائم الإدارة)</Label>
              <Select onValueChange={(v) => form.setValue('department', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر القسم" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.name}>
                      {d.name}
                    </SelectItem>
                  ))}
                  {departments.length === 0 && (
                    <SelectItem value="none" disabled>
                      لا توجد أقسام — تُضاف من حساب الإدارة
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedHospital?.location && (
            <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
              <MapPin className="size-3.5" />
              الموقع الفعلي (تلقائي): {selectedHospital.location}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="p-value">قيمة التكليف (ريال)</Label>
              <Input
                id="p-value"
                type="number"
                min={1}
                placeholder="مثال: 120000"
                {...form.register('value')}
              />
              {form.formState.errors.value && (
                <p className="text-xs text-destructive">{form.formState.errors.value.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-hours">عدد الساعات</Label>
              <Input
                id="p-hours"
                type="number"
                min={1}
                max={999}
                placeholder="مثال: 8"
                {...form.register('hours')}
              />
              {form.formState.errors.hours && (
                <p className="text-xs text-destructive">{form.formState.errors.hours.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-needed">عدد الكادر المطلوب</Label>
              <Input id="p-needed" type="number" min={1} max={50} {...form.register('nursesNeeded')} />
              {form.formState.errors.nursesNeeded && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.nursesNeeded.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>الجنس المطلوب</Label>
              <Select onValueChange={(v) => form.setValue('gender', v as CreatePostInput['gender'])}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر الجنس" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ANY">أي جنس</SelectItem>
                  <SelectItem value="MALE">ذكر</SelectItem>
                  <SelectItem value="FEMALE">أنثى</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-start">تاريخ البدء</Label>
              <Input id="p-start" type="date" {...form.register('startDate')} />
              {form.formState.errors.startDate && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.startDate.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="p-desc">وصف التكليف (اختياري)</Label>
            <Textarea
              id="p-desc"
              rows={3}
              placeholder="تفاصيل المهام والمسؤوليات والوردية..."
              {...form.register('description')}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={createMutation.isPending} className="gap-2">
              <CalendarDays className="size-4" />
              {createMutation.isPending ? 'جارٍ النشر...' : 'نشر التكليف'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
