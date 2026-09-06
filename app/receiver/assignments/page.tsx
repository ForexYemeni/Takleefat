'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BadgeCheck,
  Banknote,
  CalendarDays,
  Inbox,
  PackageCheck,
  Plus,
  Users,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { apiFetcher, apiPost, apiPatch } from '@/lib/api-client'
import {
  formatDate,
  formatDateTime,
  formatCurrency,
  ASSIGNMENT_STATUS_LABELS,
  POST_STATUS_LABELS,
} from '@/lib/utils'
import { createPostSchema, type CreatePostInput } from '@/lib/validations/post'
import { StatusBadge } from '@/components/shared/status-badge'
import { EmptyState, DashboardSkeleton } from '@/components/shared/empty-state'
import { PaymentCard } from '@/components/shared/payment-card'
import { ApplicantCV, type ApplicantData } from '@/components/receiver/applicant-cv'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  title: string
  description: string | null
  facility: string
  department: string | null
  location: string | null
  startDate: string
  endDate: string | null
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
  adminFee: number | null
  paymentStatus: string | null
  nurse: { id: string; name: string; specialty: string | null }
}

interface PlatformSettings {
  applicationFee: number
  adminPercentage: number
  paymentMethod: string
  paymentAccountNumber: string
  paymentAccountName: string
  paymentNotes: string
}

export default function ReceiverAssignmentsPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState('posts')
  const [createOpen, setCreateOpen] = useState(false)
  const [applicationsPost, setApplicationsPost] = useState<ReceiverPost | null>(null)

  const { data: postsData, isLoading: postsLoading } = useQuery({
    queryKey: ['my-posts'],
    queryFn: () => apiFetcher<{ posts: ReceiverPost[] }>('/api/posts'),
  })

  const { data: assignmentsData, isLoading: assignmentsLoading } = useQuery({
    queryKey: ['my-assignments'],
    queryFn: () =>
      apiFetcher<{ assignments: ReceiverAssignment[]; settings: PlatformSettings }>(
        '/api/me/assignments'
      ),
  })

  const posts = postsData?.posts ?? []
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

      <CreatePostDialog open={createOpen} onOpenChange={setCreateOpen} />

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
                  <p className="text-muted-foreground">حصة الإدارة</p>
                  <p className="mt-0.5 font-bold" dir="ltr">
                    {settings
                      ? formatCurrency(Math.round((post.value * settings.adminPercentage) / 100))
                      : '—'}{' '}
                    {settings ? `(${settings.adminPercentage}٪)` : ''}
                  </p>
                </div>
                <div className="rounded-lg bg-secondary/60 p-2.5">
                  <p className="text-muted-foreground">الفترة</p>
                  <p className="mt-0.5 font-bold">
                    {formatDate(post.startDate)}
                    {post.endDate ? ` — ${formatDate(post.endDate)}` : ''}
                  </p>
                </div>
                <div className="rounded-lg bg-secondary/60 p-2.5">
                  <p className="text-muted-foreground">الموقع</p>
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
              </div>

              {post.status === 'OPEN' ? (
                <Button className="w-full gap-2" onClick={() => onOpenApplications(post)}>
                  <Users className="size-4" />
                  مراجعة التقديمات والسيرة الذاتية
                </Button>
              ) : (
                <p className="flex items-center gap-1.5 rounded-xl bg-cyan-50 px-3 py-2 text-xs font-bold text-cyan-700">
                  <BadgeCheck className="size-3.5" />
                  اكتمل اختيار الكادر لهذا التكليف
                </p>
              )}

              {post.status !== 'OPEN' && post.status !== 'CANCELLED' && settings && (
                <PaymentCard
                  settings={settings}
                  breakdown={[
                    { label: `نسبة الإدارة (${settings.adminPercentage}٪)`, amount: Math.round((post.value * settings.adminPercentage) / 100) },
                    { label: 'رسوم التقديم (لكل كادر معتمد)', amount: settings.applicationFee * Math.max(1, approvedCount) },
                  ]}
                  dueAmount={
                    Math.round((post.value * settings.adminPercentage) / 100) +
                    settings.applicationFee * Math.max(1, approvedCount)
                  }
                />
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

  const pending = assignments.filter((a) => a.status === 'ACTIVE')
  const others = assignments.filter((a) => a.status !== 'ACTIVE')

  return (
    <div className="space-y-4">
      {pending.length > 0 && (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-bold text-amber-700">
            <Inbox className="size-4" />
            بانتظار تأكيد الاستلام ({pending.length})
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {pending.map((a) => (
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
                    {a.endDate ? ` — حتى ${formatDate(a.endDate)}` : ''}
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

      {others.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-bold">تكليفات سابقة</p>
          <div className="grid gap-4 md:grid-cols-2">
            {others.map((a) => (
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
                    {a.value != null && (
                      <Badge variant="outline" className="gap-1">
                        <Banknote className="size-3" />
                        {formatCurrency(a.value)}
                      </Badge>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    من {formatDate(a.startDate)}
                    {a.endDate ? ` حتى ${formatDate(a.endDate)}` : ''}
                  </p>
                  {a.receivedAt && (
                    <p className="flex items-center gap-1.5 text-xs text-emerald-700">
                      <PackageCheck className="size-3.5" />
                      تم الاستلام بتاريخ {formatDateTime(a.receivedAt)}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- إنشاء تكليف مُعلن ----------

function CreatePostDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [endDate, setEndDate] = useState('')

  const form = useForm<CreatePostInput>({
    resolver: zodResolver(createPostSchema),
    defaultValues: {
      title: '',
      description: '',
      facility: '',
      department: '',
      location: '',
      startDate: '',
      endDate: '',
      nursesNeeded: '1',
      value: '',
    },
  })

  const createMutation = useMutation({
    mutationFn: (values: CreatePostInput) => apiPost<{ message: string }>('/api/posts', values),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['my-posts'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      onOpenChange(false)
      form.reset()
      setEndDate('')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const onSubmit = (values: CreatePostInput) => {
    createMutation.mutate({ ...values, endDate })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>إنشاء تكليف مُعلن جديد</DialogTitle>
          <DialogDescription>
            يُنشر التكليف فوراً للكادر التمريضي المعتمد للتقديم — مع عرض قيمة التكليف وحصة الإدارة
            ورسوم التقديم بشكل شفاف
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="p-title">عنوان التكليف</Label>
            <Input
              id="p-title"
              placeholder="مثال: تكليف تمريضي — قسم الطوارئ"
              {...form.register('title')}
            />
            {form.formState.errors.title && (
              <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="p-facility">الجهة الصحية</Label>
              <Input id="p-facility" placeholder="مثال: مستشفى الملكية" {...form.register('facility')} />
              {form.formState.errors.facility && (
                <p className="text-xs text-destructive">{form.formState.errors.facility.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-department">القسم (اختياري)</Label>
              <Input id="p-department" placeholder="مثال: العناية المركزة" {...form.register('department')} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="p-location">الموقع (اختياري)</Label>
              <Input id="p-location" placeholder="مثال: صنعاء" {...form.register('location')} />
            </div>
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
              <Label htmlFor="p-needed">عدد الكادر المطلوب</Label>
              <Input id="p-needed" type="number" min={1} max={50} {...form.register('nursesNeeded')} />
              {form.formState.errors.nursesNeeded && (
                <p className="text-xs text-destructive">{form.formState.errors.nursesNeeded.message}</p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="p-start">تاريخ البدء</Label>
              <Input id="p-start" type="date" {...form.register('startDate')} />
              {form.formState.errors.startDate && (
                <p className="text-xs text-destructive">{form.formState.errors.startDate.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-end">تاريخ الانتهاء (اختياري)</Label>
              <Input
                id="p-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
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
