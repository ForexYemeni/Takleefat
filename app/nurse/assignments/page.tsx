'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Banknote,
  Briefcase,
  CalendarDays,
  ClipboardList,
  Clock,
  MapPin,
  Search,
  Send,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetcher, apiPost } from '@/lib/api-client'
import {
  formatDate,
  formatDateTime,
  formatCurrency,
  ASSIGNMENT_STATUS_LABELS,
  APPLICATION_STATUS_LABELS,
} from '@/lib/utils'
import { StatusBadge } from '@/components/shared/status-badge'
import { EmptyState, DashboardSkeleton } from '@/components/shared/empty-state'
import { PaymentCard } from '@/components/shared/payment-card'
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

interface OpenPost {
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
  receiver: { id: string; name: string }
  _count: { applications: number }
  applications: Array<{ id: string; status: string; reviewNote: string | null; createdAt: string }>
}

interface PlatformSettings {
  applicationFee: number
  adminPercentage: number
  paymentMethod: string
  paymentAccountNumber: string
  paymentAccountName: string
  paymentNotes: string
}

interface FeeBreakdown {
  value: number
  adminFee: number
  applicationFee: number
  dueToAdmin: number
  netForNurse: number
}

interface MyApplication {
  id: string
  status: string
  coverNote: string | null
  reviewNote: string | null
  createdAt: string
  post: {
    id: string
    title: string
    facility: string
    department: string | null
    value: number
    status: string
    receiver: { id: string; name: string; phone: string }
  }
  fees: FeeBreakdown
}

interface MyAssignment {
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
  receiver: { name: string }
}

function computeFees(value: number, settings: PlatformSettings): FeeBreakdown {
  const adminFee = Math.round((value * settings.adminPercentage) / 100)
  return {
    value,
    adminFee,
    applicationFee: settings.applicationFee,
    dueToAdmin: adminFee + settings.applicationFee,
    netForNurse: value - adminFee - settings.applicationFee,
  }
}

export default function NurseAssignmentsPage() {
  const [tab, setTab] = useState('available')

  const { data, isLoading } = useQuery({
    queryKey: ['open-posts'],
    queryFn: () => apiFetcher<{ posts: OpenPost[]; settings: PlatformSettings }>('/api/posts'),
  })

  const { data: appsData, isLoading: appsLoading } = useQuery({
    queryKey: ['my-applications'],
    queryFn: () =>
      apiFetcher<{ applications: MyApplication[]; settings: PlatformSettings }>(
        '/api/me/applications'
      ),
  })

  const { data: assignmentsData, isLoading: assignmentsLoading } = useQuery({
    queryKey: ['my-assignments'],
    queryFn: () =>
      apiFetcher<{ assignments: MyAssignment[]; settings: PlatformSettings }>('/api/me/assignments'),
  })

  if (isLoading || appsLoading || assignmentsLoading) return <DashboardSkeleton />

  const posts = data?.posts ?? []
  const settings = data?.settings ?? appsData?.settings ?? assignmentsData?.settings
  const applications = appsData?.applications ?? []
  const assignments = assignmentsData?.assignments ?? []

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">التكليفات</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          قدّم على التكليفات المتاحة مع عرض واضح للرسوم ونسبة الإدارة — وتابع تقديماتك وتكليفاتك المؤكدة
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="available" className="gap-1.5">
            التكليفات المتاحة
            <span className="text-xs text-muted-foreground">{posts.length}</span>
          </TabsTrigger>
          <TabsTrigger value="applications" className="gap-1.5">
            تقديماتي
            <span className="text-xs text-muted-foreground">{applications.length}</span>
          </TabsTrigger>
          <TabsTrigger value="confirmed" className="gap-1.5">
            تكليفاتي المؤكدة
            <span className="text-xs text-muted-foreground">{assignments.length}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'available' && <AvailablePosts posts={posts} settings={settings} />}

      {tab === 'applications' && (
        <MyApplications applications={applications} settings={settings} />
      )}

      {tab === 'confirmed' && <ConfirmedAssignments assignments={assignments} />}
    </div>
  )
}

// ---------- التكليفات المتاحة ----------

function AvailablePosts({
  posts,
  settings,
}: {
  posts: OpenPost[]
  settings?: PlatformSettings
}) {
  const [search, setSearch] = useState('')
  const [applyPost, setApplyPost] = useState<OpenPost | null>(null)

  const filtered = posts.filter(
    (p) =>
      !search ||
      p.title.includes(search) ||
      p.facility.includes(search) ||
      (p.department ?? '').includes(search) ||
      (p.location ?? '').includes(search)
  )

  return (
    <div className="space-y-4">
      <div className="relative w-full sm:w-72">
        <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="ابحث بعنوان التكليف أو الجهة..."
          className="ps-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="لا توجد تكليفات متاحة حالياً"
          description="سيصلك إشعار فور نشر أي تكليف جديد — تابع إشعارات المنصة."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((post) => {
            const myApp = post.applications?.[0]
            const fees = settings ? computeFees(post.value, settings) : null
            return (
              <Card key={post.id} className="border-teal-200 bg-teal-50/30">
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold">{post.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {post.facility}
                        {post.department ? ` — ${post.department}` : ''}
                      </p>
                    </div>
                    <Badge className="bg-teal-600">متاح للتقديم</Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <InfoCell icon={Banknote} label="قيمة التكليف" value={formatCurrency(post.value)} strong />
                    <InfoCell
                      icon={Banknote}
                      label="حصة الإدارة"
                      value={fees ? `${formatCurrency(fees.adminFee)} (${settings!.adminPercentage}٪)` : '—'}
                    />
                    <InfoCell icon={CalendarDays} label="تاريخ البدء" value={formatDate(post.startDate)} />
                    <InfoCell
                      icon={CalendarDays}
                      label="تاريخ الانتهاء"
                      value={post.endDate ? formatDate(post.endDate) : 'غير محدد'}
                    />
                    <InfoCell icon={MapPin} label="الموقع" value={post.location ?? 'غير محدد'} />
                    <InfoCell
                      icon={Users}
                      label="الكادر المطلوب"
                      value={`${post.nursesNeeded} — متقدمون: ${post._count?.applications ?? 0}`}
                    />
                  </div>

                  {post.description && (
                    <p className="rounded-lg border border-dashed bg-white/60 p-3 text-xs leading-relaxed text-muted-foreground">
                      {post.description}
                    </p>
                  )}

                  {fees && settings && (
                    <div className="rounded-xl border bg-white/70 p-3 text-xs dark:bg-black/20">
                      <p className="mb-1.5 font-bold">تفاصيل الرسوم</p>
                      <div className="space-y-1">
                        <FeeRow label="قيمة التكليف" amount={formatCurrency(fees.value)} />
                        <FeeRow label={`نسبة الإدارة (${settings.adminPercentage}٪)`} amount={formatCurrency(fees.adminFee)} />
                        <FeeRow label="رسوم التقديم" amount={formatCurrency(fees.applicationFee)} />
                        <div className="flex justify-between border-t pt-1 font-extrabold text-emerald-700">
                          <span>الصافي المستحق لك</span>
                          <span dir="ltr">{formatCurrency(fees.netForNurse)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {myApp ? (
                    <div className="space-y-1.5">
                      <p className="flex items-center justify-between gap-2 rounded-xl bg-secondary/70 px-3 py-2 text-xs">
                        <span className="font-bold">تقديمك على هذا التكليف</span>
                        <StatusBadge status={myApp.status} labels={APPLICATION_STATUS_LABELS} />
                      </p>
                      {myApp.reviewNote && (
                        <p className="rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700">
                          ملاحظة المراجعة: {myApp.reviewNote}
                        </p>
                      )}
                    </div>
                  ) : (
                    <Button className="w-full gap-2" onClick={() => setApplyPost(post)}>
                      <Send className="size-4" />
                      التقديم على التكليف
                    </Button>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <ApplyDialog post={applyPost} onClose={() => setApplyPost(null)} settings={settings} />
    </div>
  )
}

function InfoCell({
  icon: Icon,
  label,
  value,
  strong,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div className="rounded-lg bg-secondary/60 p-2.5">
      <p className="flex items-center gap-1 text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </p>
      <p className={`mt-0.5 ${strong ? 'font-extrabold text-primary' : 'font-bold'}`} dir={strong ? 'ltr' : undefined}>
        {value}
      </p>
    </div>
  )
}

function FeeRow({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span dir="ltr">{amount}</span>
    </div>
  )
}

// ---------- حوار التقديم ----------

function ApplyDialog({
  post,
  onClose,
  settings,
}: {
  post: OpenPost | null
  onClose: () => void
  settings?: PlatformSettings
}) {
  const queryClient = useQueryClient()
  const [coverNote, setCoverNote] = useState('')

  const applyMutation = useMutation({
    mutationFn: (postId: string) =>
      apiPost<{ message: string }>(`/api/posts/${postId}/apply`, { coverNote }),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['open-posts'] })
      queryClient.invalidateQueries({ queryKey: ['my-applications'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      setCoverNote('')
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (!post) return null
  const fees = settings ? computeFees(post.value, settings) : null

  return (
    <Dialog open={!!post} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>التقديم على: {post.title}</DialogTitle>
          <DialogDescription>
            راجع تفاصيل الرسوم قبل إرسال التقديم — تُدفع الرسوم للإدارة بعد اعتماد تقديمك
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {fees && settings && (
            <div className="rounded-xl border bg-secondary/40 p-3 text-sm">
              <div className="space-y-1.5">
                <FeeRow label="قيمة التكليف" amount={formatCurrency(fees.value)} />
                <FeeRow label={`نسبة الإدارة (${settings.adminPercentage}٪)`} amount={formatCurrency(fees.adminFee)} />
                <FeeRow label="رسوم التقديم" amount={formatCurrency(fees.applicationFee)} />
                <div className="flex justify-between border-t pt-1.5 font-extrabold text-emerald-700">
                  <span>الصافي المستحق لك</span>
                  <span dir="ltr">{formatCurrency(fees.netForNurse)}</span>
                </div>
                <div className="flex justify-between font-bold text-amber-700">
                  <span>يُدفع للإدارة بعد الاعتماد</span>
                  <span dir="ltr">{formatCurrency(fees.dueToAdmin)}</span>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="cover-note">رسالة تقديم (اختياري)</Label>
            <Textarea
              id="cover-note"
              rows={3}
              placeholder="عرّف عن نفسك وخبرتك بإيجاز..."
              value={coverNote}
              onChange={(e) => setCoverNote(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              إلغاء
            </Button>
            <Button
              className="gap-2"
              disabled={applyMutation.isPending}
              onClick={() => applyMutation.mutate(post.id)}
            >
              <Send className="size-4" />
              {applyMutation.isPending ? 'جارٍ الإرسال...' : 'إرسال التقديم'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------- تقديماتي ----------

function MyApplications({
  applications,
  settings,
}: {
  applications: MyApplication[]
  settings?: PlatformSettings
}) {
  if (applications.length === 0) {
    return (
      <EmptyState
        icon={Briefcase}
        title="لم تقدّم على أي تكليف بعد"
        description="تصفح التكليفات المتاحة وقدّم على ما يناسب تخصصك — التفاصيل والرسوم معروضة بكل شفافية."
      />
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {applications.map((app) => (
        <Card key={app.id}>
          <CardContent className="space-y-3 p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold">{app.post.title}</p>
                <p className="text-sm text-muted-foreground">
                  {app.post.facility}
                  {app.post.department ? ` — ${app.post.department}` : ''}
                </p>
              </div>
              <StatusBadge status={app.status} labels={APPLICATION_STATUS_LABELS} />
            </div>

            <p className="text-xs text-muted-foreground">
              الجهة المُعلنة: <span className="font-bold text-foreground">{app.post.receiver.name}</span> —
              قيمة التكليف: <span className="font-bold" dir="ltr">{formatCurrency(app.fees.value)}</span>
            </p>

            {app.status === 'PENDING' && (
              <p className="flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                <Clock className="size-3.5" />
                بانتظار مراجعة السيرة الذاتية من الجهة المُعلنة
              </p>
            )}

            {app.status === 'APPROVED' && settings && (
              <PaymentCard
                settings={settings}
                breakdown={[
                  { label: 'قيمة التكليف', amount: app.fees.value },
                  { label: `نسبة الإدارة (${settings.adminPercentage}٪)`, amount: app.fees.adminFee, negative: true },
                  { label: 'رسوم التقديم', amount: app.fees.applicationFee, negative: true },
                ]}
                dueAmount={app.fees.dueToAdmin}
              />
            )}

            {app.status === 'REJECTED' && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
                {app.reviewNote ?? 'لم يتم اعتماد التقديم'}
              </p>
            )}

            <p className="text-[11px] text-muted-foreground">
              تاريخ التقديم: {formatDateTime(app.createdAt)}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ---------- تكليفاتي المؤكدة ----------

function ConfirmedAssignments({ assignments }: { assignments: MyAssignment[] }) {
  if (assignments.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="لا توجد تكليفات مؤكدة بعد"
        description="تظهر هنا تكليفاتك بعد اعتماد تقديمك من الجهة المُعلنة أو الإسناد المباشر من إدارة المنصة."
      />
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {assignments.map((a) => (
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

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-secondary/60 p-2.5">
                <p className="text-muted-foreground">تاريخ البدء</p>
                <p className="mt-0.5 font-bold">{formatDate(a.startDate)}</p>
              </div>
              <div className="rounded-lg bg-secondary/60 p-2.5">
                <p className="text-muted-foreground">تاريخ الانتهاء</p>
                <p className="mt-0.5 font-bold">{a.endDate ? formatDate(a.endDate) : 'غير محدد'}</p>
              </div>
              {a.value != null && (
                <div className="rounded-lg bg-secondary/60 p-2.5">
                  <p className="text-muted-foreground">قيمة التكليف</p>
                  <p className="mt-0.5 font-extrabold text-primary" dir="ltr">
                    {formatCurrency(a.value)}
                  </p>
                </div>
              )}
              {a.adminFee != null && (
                <div className="rounded-lg bg-secondary/60 p-2.5">
                  <p className="text-muted-foreground">حصة الإدارة</p>
                  <p className="mt-0.5 font-bold" dir="ltr">
                    {formatCurrency(a.adminFee)}
                  </p>
                </div>
              )}
            </div>

            <div className="text-xs text-muted-foreground">
              <p>
                المستلم الإداري: <span className="font-bold text-foreground">{a.receiver.name}</span>
              </p>
              {a.receivedAt && <p>تم الاستلام من الجهة المستقبِلة ✓</p>}
            </div>

            {a.description && (
              <p className="rounded-lg border border-dashed p-3 text-xs leading-relaxed text-muted-foreground">
                {a.description}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
