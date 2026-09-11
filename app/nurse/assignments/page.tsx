'use client'

import { useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock,
  FileWarning,
  ImagePlus,
  MapPin,
  Search,
  Send,
  Sparkles,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { apiFetcher, apiPost } from '@/lib/api-client'
import { compressImage } from '@/lib/compress-image'
import {
  formatDate,
  formatDateTime,
  formatCurrency,
  cn,
  ASSIGNMENT_STATUS_LABELS,
  APPLICATION_STATUS_LABELS,
  POST_GENDER_LABELS,
} from '@/lib/utils'
import { StatusBadge } from '@/components/shared/status-badge'
import { EmptyState, DashboardSkeleton } from '@/components/shared/empty-state'
import { PaymentCard } from '@/components/shared/payment-card'
import { DocumentViewer, type ViewableDocument } from '@/components/shared/document-viewer'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { StaffPhone } from '@/components/shared/staff-phone'
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
  receiver: { id: string; name: string }
  _count: { applications: number }
  applications: Array<{ id: string; status: string; reviewNote: string | null; createdAt: string }>
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
    receiver: {
      id: string
      name: string
      phone: string | null
      phoneMasked: string
      phoneLocked: boolean
      /** الجولة 35 — قفل تبادلي: يُفتح رقم المستلم للكادر بعد تأكيد الإدارة سداد النسبة */
    }
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
  paymentStatus: string | null
  nurseDoneAt: string | null
  nurseConfirmedReceipt: boolean
  paymentScreenshotUrl: string | null
  paymentScreenshotName: string | null
  receiverDoneAt: string | null
  receiver: {
    id: string
    name: string
    phone: string | null
    phoneMasked: string
    phoneLocked: boolean
  }
}

function computeFees(value: number, settings: PlatformSettings): FeeBreakdown {
  // يُحصّل نوع واحد فقط حسب نمط الرسوم: حصة إدارة أو رسوم تقديم
  const adminFee =
    settings.feeMode === 'ADMIN'
      ? settings.adminFeeType === 'FIXED'
        ? Math.max(0, Math.round(settings.adminFeeFixed))
        : Math.round((value * settings.adminPercentage) / 100)
      : 0
  const applicationFee = settings.feeMode === 'APPLICATION' ? Math.max(0, settings.applicationFee) : 0
  return {
    value,
    adminFee,
    applicationFee,
    dueToAdmin: adminFee + applicationFee,
    netForNurse: value - adminFee - applicationFee,
  }
}

function feeLabel(settings: PlatformSettings): string {
  if (settings.feeMode === 'APPLICATION') {
    return `رسوم تقديم ${settings.applicationFee.toLocaleString('ar-YE')} ريال`
  }
  return settings.adminFeeType === 'FIXED'
    ? `حصة إدارة بمبلغ ثابت ${settings.adminFeeFixed.toLocaleString('ar-YE')} ريال`
    : `حصة إدارة ${settings.adminPercentage}٪ من قيمة التكليف`
}

const adminFeeLabel = feeLabel

export default function NurseAssignmentsPage() {
  const [tab, setTab] = useState('available')

  const { data, isLoading } = useQuery({
    queryKey: ['open-posts'],
    queryFn: () =>
      apiFetcher<{ posts: OpenPost[]; settings: PlatformSettings; documentsCount: number }>(
        '/api/posts'
      ),
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

  // لا تقديم على تكليفات جديدة قبل تأكيد الإدارة دفع رسوم/نسبة الإدارة
  const hasUnpaidFees = assignments.some(
    (a) => a.paymentStatus === 'UNPAID' && a.status !== 'CANCELLED'
  )

  // لا تقديم قبل رفع المستندات — شرط أساسي لتقديم أي طلب تكليف
  const needsDocuments = (data?.documentsCount ?? 0) === 0

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

      {tab === 'available' && (
        <AvailablePosts
          posts={posts}
          settings={settings}
          blocked={hasUnpaidFees}
          needsDocuments={needsDocuments}
        />
      )}

      {tab === 'applications' && (
        <MyApplications applications={applications} settings={settings} />
      )}

      {tab === 'confirmed' && (
        <ConfirmedAssignments assignments={assignments} settings={settings} />
      )}
    </div>
  )
}

// ---------- التكليفات المتاحة ----------

function AvailablePosts({
  posts,
  settings,
  blocked,
  needsDocuments,
}: {
  posts: OpenPost[]
  settings?: PlatformSettings
  blocked: boolean
  needsDocuments: boolean
}) {
  const [search, setSearch] = useState('')
  const [applyPost, setApplyPost] = useState<OpenPost | null>(null)

  // أقسام عمل الكادر — لإبراز التكليفات المطابقة لأقسامه بشارة فاخرة
  const { data: wdData } = useQuery({
    queryKey: ['my-work-departments'],
    queryFn: () =>
      apiFetcher<{ departments: Array<{ id: string; name: string }> }>('/api/me/work-departments'),
    staleTime: 60_000,
  })
  const myWorkDepartments = useMemo(
    () => new Set((wdData?.departments ?? []).map((d) => d.name)),
    [wdData]
  )

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
      {needsDocuments && (
        <div className="flex flex-col gap-3 rounded-2xl border-2 border-orange-300 bg-orange-50 p-4 sm:flex-row sm:items-center dark:border-orange-800 dark:bg-orange-950/30">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 dark:bg-orange-900">
            <FileWarning className="size-5 text-orange-600 dark:text-orange-300" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-extrabold text-orange-800 dark:text-orange-200">
              رفع المستندات مطلوب قبل التقديم
            </p>
            <p className="mt-1 text-xs leading-relaxed text-orange-700 dark:text-orange-300">
              لا يمكنك التقديم على أي تكليف قبل رفع مستنداتك (الهوية الشخصية وصورة المزاولة).
              ارفعها الآن من صفحة «مستنداتي» — وسيتم اعتماد حسابك من الإدارة بعد مراجعتها.
            </p>
          </div>
          <Button asChild className="shrink-0 gap-2 bg-orange-600 hover:bg-orange-700">
            <Link href="/nurse/documents">
              <FileWarning className="size-4" />
              رفع المستندات الآن
            </Link>
          </Button>
        </div>
      )}

      {blocked && (
        <div className="flex items-start gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900">
            <AlertTriangle className="size-5 text-amber-600 dark:text-amber-300" />
          </span>
          <div>
            <p className="text-sm font-extrabold text-amber-800 dark:text-amber-200">
              التقديم على التكليفات الجديدة موقوف مؤقتاً
            </p>
            <p className="mt-1 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
              لديك تكليف سابق لم يتم تأكيد دفع رسوم أو نسبة الإدارة له من إدارة المنصة — ارفع لقطة
              شاشة إثبات الدفع من تبويب «تكليفاتي المؤكدة» وتابع مع الإدارة حتى التأكيد، ثم ستُتاح
              لك التقديمات من جديد.
            </p>
          </div>
        </div>
      )}

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
            const deptMatch = !!post.department && myWorkDepartments.has(post.department)
            return (
              <Card key={post.id} className={deptMatch ? 'border-primary/50 bg-primary/5' : 'border-teal-200 bg-teal-50/30'}>
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold">{post.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {post.facility}
                        {post.department ? ` — ${post.department}` : ''}
                      </p>
                    </div>
                    {deptMatch ? (
                      <Badge className="gap-1 bg-primary shadow-sm">
                        <Sparkles className="size-3" />
                        يطابق قسم عملك
                      </Badge>
                    ) : (
                      <Badge className="bg-teal-600">متاح للتقديم</Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5 text-xs">
                    <Badge variant="outline" className="gap-1">
                      <UserRound className="size-3" />
                      الجنس المطلوب: {POST_GENDER_LABELS[post.gender] ?? 'أي جنس'}
                    </Badge>
                    {post.hours ? (
                      <Badge variant="outline" className="gap-1">
                        <Clock className="size-3" />
                        {post.hours} ساعة
                      </Badge>
                    ) : null}
                    <Badge variant="outline" className="gap-1">
                      <Users className="size-3" />
                      متقدمون: {post._count?.applications ?? 0}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <InfoCell icon={Banknote} label="قيمة التكليف" value={formatCurrency(post.value)} strong />
                    <InfoCell
                      icon={Banknote}
                      label="حصة الإدارة"
                      value={fees ? formatCurrency(fees.adminFee) : '—'}
                    />
                    <InfoCell icon={CalendarDays} label="تاريخ البدء" value={formatDate(post.startDate)} />
                    <InfoCell icon={MapPin} label="الموقع" value={post.location ?? 'غير محدد'} />
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
                        <FeeRow
                          label={`حصة الإدارة (${adminFeeLabel(settings)})`}
                          amount={formatCurrency(fees.adminFee)}
                        />
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
                    <Button
                      className="w-full gap-2"
                      disabled={blocked || needsDocuments}
                      onClick={() => setApplyPost(post)}
                    >
                      <Send className="size-4" />
                      {needsDocuments
                        ? 'ارفع مستنداتك أولاً للتقديم'
                        : blocked
                          ? 'التقديم موقوف — أكمل دفع الرسوم أولاً'
                          : 'التقديم على التكليف'}
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

/** شريحة معلومات مصغّرة — تُستخدم داخل البطاقات المصغّرة */
function MiniChip({
  icon: Icon,
  children,
  tone = 'default',
  ltr,
}: {
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
  tone?: 'default' | 'emerald' | 'primary'
  ltr?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 truncate rounded-lg px-2 py-1 font-bold',
        tone === 'emerald'
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
          : tone === 'primary'
            ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300'
            : 'bg-secondary/70 text-secondary-foreground'
      )}
      dir={ltr ? 'ltr' : undefined}
    >
      <Icon className="size-3 shrink-0" />
      <span className="truncate">{children}</span>
    </span>
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
                {settings.feeMode === 'ADMIN' && (
                  <FeeRow
                    label={
                      settings.adminFeeType === 'FIXED'
                        ? 'حصة الإدارة (مبلغ ثابت)'
                        : `حصة الإدارة (${settings.adminPercentage}٪)`
                    }
                    amount={formatCurrency(fees.adminFee)}
                  />
                )}
                {settings.feeMode === 'APPLICATION' && (
                  <FeeRow label="رسوم التقديم" amount={formatCurrency(fees.applicationFee)} />
                )}
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
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {applications.map((app) => (
        <ApplicationCard key={app.id} app={app} settings={settings} />
      ))}
    </div>
  )
}

/** بطاقة تقديم مصغّرة واحترافية — ملخص واضح فوق، وطرق الدفع قابلة للفتح */
function ApplicationCard({
  app,
  settings,
}: {
  app: MyApplication
  settings?: PlatformSettings
}) {
  const [showPayment, setShowPayment] = useState(false)

  return (
    <Card>
      <CardContent className="space-y-2.5 p-4">
        {/* العنوان والحالة */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold">{app.post.title}</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">
                {app.post.facility}
                {app.post.department ? ` — ${app.post.department}` : ''}
              </span>
            </p>
          </div>
          <StatusBadge status={app.status} labels={APPLICATION_STATUS_LABELS} />
        </div>

        {/* شرائح مصغّرة: الجهة + القيمة + التاريخ */}
        <div className="flex flex-wrap items-center gap-1.5">
          <MiniChip icon={UserRound}>{app.post.receiver.name}</MiniChip>
          {/* الجولة 35: تواصل المستلم — مقفل حتى يُسدّد تكليف مشترك ويؤكده الإدارة */}
          <StaffPhone data={app.post.receiver} personName={app.post.receiver.name} />
          <MiniChip icon={Banknote} ltr>
            {formatCurrency(app.fees.value)}
          </MiniChip>
          <MiniChip icon={CalendarDays}>{formatDate(app.createdAt)}</MiniChip>
        </div>

        {app.status === 'PENDING' && (
          <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-700">
            <Clock className="size-3 shrink-0" />
            بانتظار مراجعة السيرة الذاتية من الجهة المُعلنة
          </p>
        )}

        {app.status === 'APPROVED' && settings && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-2.5 dark:border-emerald-900 dark:bg-emerald-950/30">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-800 dark:text-emerald-300">
                <Wallet className="size-3.5 shrink-0" />
                <span className="shrink-0">المبلغ الواجب:</span>
                <span dir="ltr">{formatCurrency(app.fees.dueToAdmin)}</span>
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs text-emerald-800 hover:text-emerald-900 dark:text-emerald-300"
                onClick={() => setShowPayment((v) => !v)}
              >
                {showPayment ? 'إخفاء' : 'طرق الدفع'}
                <ChevronDown className={cn('size-3.5 transition-transform', showPayment && 'rotate-180')} />
              </Button>
            </div>
            {showPayment && (
              <div className="mt-2">
                <PaymentCard
                  settings={settings}
                  breakdown={[
                    { label: 'قيمة التكليف', amount: app.fees.value },
                    ...(settings.feeMode === 'ADMIN'
                      ? [
                          {
                            label:
                              settings.adminFeeType === 'FIXED'
                                ? 'حصة الإدارة (مبلغ ثابت)'
                                : `حصة الإدارة (${settings.adminPercentage}٪)`,
                            amount: app.fees.adminFee,
                            negative: true,
                          },
                        ]
                      : [
                          {
                            label: 'رسوم التقديم',
                            amount: app.fees.applicationFee,
                            negative: true,
                          },
                        ]),
                  ]}
                  dueAmount={app.fees.dueToAdmin}
                />
              </div>
            )}
          </div>
        )}

        {app.status === 'REJECTED' && (
          <p className="rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700">
            {app.reviewNote ?? 'لم يتم اعتماد التقديم'}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ---------- تكليفاتي المؤكدة ----------

function ConfirmedAssignments({
  assignments,
  settings,
}: {
  assignments: MyAssignment[]
  settings?: PlatformSettings
}) {
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
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {assignments.map((a) => (
        <NurseAssignmentCard key={a.id} a={a} settings={settings} />
      ))}
    </div>
  )
}

function NurseAssignmentCard({
  a,
  settings,
}: {
  a: MyAssignment
  settings?: PlatformSettings
}) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [confirmDone, setConfirmDone] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [viewScreenshot, setViewScreenshot] = useState<ViewableDocument | null>(null)

  // تأكيد إنهاء التكليف واستلام المبلغ
  const completeMutation = useMutation({
    mutationFn: (id: string) =>
      apiPost<{ message: string }>(`/api/me/assignments/${id}/nurse-complete`, {
        receivedAmount: true,
      }),
    onSuccess: (res) => {
      toast.success(res.message)
      setConfirmDone(false)
      queryClient.invalidateQueries({ queryKey: ['my-assignments'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // رفع لقطة شاشة إثبات الدفع — ضغط من جهة العميل ثم رفع مباشر
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const { file: compressed } = await compressImage(file)
      const formData = new FormData()
      formData.append('file', compressed)
      const response = await fetch(`/api/me/assignments/${a.id}/payment-screenshot`, {
        method: 'POST',
        body: formData,
      })
      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.includes('application/json')) {
        throw new Error(`تعذر رفع الصورة (رمز ${response.status}) — أعد المحاولة`)
      }
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'فشل رفع الصورة')
      return result as { message: string }
    },
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['my-assignments'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const applicationFee =
    settings?.feeMode === 'APPLICATION' ? Math.max(0, settings.applicationFee) : 0
  const dueToAdmin = (a.adminFee ?? 0) + applicationFee
  const canConfirmDone = !a.nurseDoneAt && a.status !== 'CANCELLED' && a.status !== 'COMPLETED'
  const hasFinanceSection = settings && a.status !== 'CANCELLED'
  const hasDetails = !!hasFinanceSection || !!a.description

  return (
    <Card className={cn('overflow-hidden', a.paymentStatus === 'PAID' && 'border-emerald-200')}>
      <CardContent className="space-y-2.5 p-4">
        {/* العنوان والحالة */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold">{a.title}</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">
                {a.facility}
                {a.department ? ` — ${a.department}` : ''}
              </span>
            </p>
          </div>
          <StatusBadge status={a.status} labels={ASSIGNMENT_STATUS_LABELS} />
        </div>

        {/* شرائح مصغّرة: التاريخ + القيمة + المستلم */}
        <div className="flex flex-wrap items-center gap-1.5">
          <MiniChip icon={CalendarDays}>{formatDate(a.startDate)}</MiniChip>
          {a.value != null && (
            <MiniChip icon={Banknote} tone="primary" ltr>
              {formatCurrency(a.value)}
            </MiniChip>
          )}
          <MiniChip icon={UserRound}>{a.receiver.name}</MiniChip>
          {/* الجولة 35: تواصل المستلم — يُفتح تلقائياً بعد تأكيد الإدارة للسداد */}
          <StaffPhone data={a.receiver} personName={a.receiver.name} />
          {a.receivedAt && (
            <MiniChip icon={BadgeCheck} tone="emerald">
              تم الاستلام ✓
            </MiniChip>
          )}
        </div>

        {/* ملخص الدفع المصغّر + حالة تأكيد الإدارة */}
        {a.status !== 'CANCELLED' && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-2.5 py-2 dark:border-emerald-900 dark:bg-emerald-950/30">
            <p className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-800 dark:text-emerald-300">
              <Wallet className="size-3.5 shrink-0" />
              <span className="shrink-0">الواجب للإدارة:</span>
              <span dir="ltr">{formatCurrency(dueToAdmin)}</span>
            </p>
            {a.paymentStatus === 'PAID' ? (
              <Badge className="gap-1 bg-emerald-600 text-[10px]">
                <BadgeCheck className="size-3" />
                أكدت الإدارة الدفع
              </Badge>
            ) : a.paymentScreenshotUrl ? (
              <Badge variant="secondary" className="text-[10px]">
                بانتظار تأكيد الإدارة
              </Badge>
            ) : null}
          </div>
        )}

        {/* تأكيد الكادر للإنهاء */}
        {a.nurseDoneAt && (
          <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            <BadgeCheck className="size-3.5 shrink-0" />
            أكدت انتهاء التكليف واستلام المبلغ — {formatDateTime(a.nurseDoneAt)}
          </p>
        )}

        {/* إنهاء التكليف واستلام المبلغ */}
        {canConfirmDone && (
          <Button size="sm" className="w-full gap-2" onClick={() => setConfirmDone(true)}>
            <CheckCircle2 className="size-4" />
            تم الانتهاء من التكليف واستلام مبلغ التكليف
          </Button>
        )}

        {/* فتح/إغلاق التفاصيل: طرق الدفع + إثبات الدفع + الوصف */}
        {hasDetails && (
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed py-1.5 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-accent"
          >
            {showDetails ? 'إخفاء التفاصيل والدفع' : 'التفاصيل وطرق الدفع وإثبات الدفع'}
            <ChevronDown className={cn('size-3.5 transition-transform', showDetails && 'rotate-180')} />
          </button>
        )}

        {showDetails && (
          <div className="space-y-3">
            {/* بطاقة طرق الدفع للإدارة — للكادر فقط */}
            {hasFinanceSection && (
              <PaymentCard
                settings={settings!}
                dueAmount={dueToAdmin}
                breakdown={[
                  { label: 'قيمة التكليف', amount: a.value ?? 0 },
                  ...(settings!.feeMode === 'ADMIN'
                    ? [
                        {
                          label:
                            settings!.adminFeeType === 'FIXED'
                              ? 'حصة الإدارة (مبلغ ثابت)'
                              : `حصة الإدارة (${settings!.adminPercentage}٪)`,
                          amount: a.adminFee ?? 0,
                          negative: true,
                        },
                      ]
                    : [{ label: 'رسوم التقديم', amount: applicationFee, negative: true }]),
                ]}
              />
            )}

            {/* إثبات دفع الرسوم — رفع لقطة الشاشة في نفس الصفحة */}
            {a.status !== 'CANCELLED' && (
              <div className="rounded-2xl border-2 border-dashed p-3">
                <p className="flex items-center gap-1.5 text-xs font-extrabold">
                  <ImagePlus className="size-3.5 text-primary" />
                  إثبات دفع رسوم/نسبة الإدارة
                </p>

                {a.paymentScreenshotUrl ? (
                  <button
                    type="button"
                    onClick={() =>
                      setViewScreenshot({
                        fileUrl: a.paymentScreenshotUrl!,
                        fileName: a.paymentScreenshotName ?? 'إثبات الدفع',
                        title: 'لقطة شاشة إثبات الدفع',
                        mimeType: 'image/*',
                      })
                    }
                    className="mt-2.5 flex w-full items-center gap-3 rounded-xl border p-2.5 text-start transition-colors hover:bg-accent"
                  >
                    <img
                      src={a.paymentScreenshotUrl}
                      alt="إثبات الدفع"
                      className="size-14 rounded-lg border object-cover"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold">
                        {a.paymentScreenshotName ?? 'لقطة الشاشة'}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        اضغط لعرض الصورة وتكبيرها
                      </span>
                    </span>
                  </button>
                ) : a.paymentStatus === 'PAID' ? (
                  <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    تم تأكيد دفع الرسوم من الإدارة — يمكنك التقديم على تكليفات جديدة
                  </p>
                ) : (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) uploadMutation.mutate(file)
                        e.target.value = ''
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2.5 w-full gap-2 border-dashed"
                      disabled={uploadMutation.isPending}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImagePlus className="size-4" />
                      {uploadMutation.isPending ? 'جارٍ الرفع...' : 'رفع لقطة شاشة إثبات الدفع'}
                    </Button>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                      بعد دفع المبلغ للإدارة عبر {settings?.paymentMethod ?? 'طريقة الدفع'} ارفع لقطة
                      شاشة هنا — تظهر للإدارة بشكل احترافي للتأكيد
                    </p>
                  </>
                )}
              </div>
            )}

            {a.description && (
              <p className="rounded-lg border border-dashed p-3 text-xs leading-relaxed text-muted-foreground">
                {a.description}
              </p>
            )}
          </div>
        )}
      </CardContent>

      {/* تأكيد إنهاء التكليف — بطاقة احترافية */}
      <ConfirmDialog
        open={confirmDone}
        onOpenChange={setConfirmDone}
        tone="success"
        icon={CheckCircle2}
        title="تأكيد انتهاء التكليف واستلام المبلغ"
        description={`بالتأكيد أنك أنهيت التكليف «${a.title}» وأنك استلمت مبلغ التكليف كاملاً؟ سيرى المستلم الإداري والإدارة هذا التأكيد فوراً.`}
        confirmLabel="نعم، أنهيت التكليف واستلمت المبلغ"
        processing={completeMutation.isPending}
        onConfirm={() => completeMutation.mutate(a.id)}
      />

      {/* عارض لقطة شاشة الدفع */}
      <DocumentViewer
        document={viewScreenshot}
        open={!!viewScreenshot}
        onOpenChange={(open) => !open && setViewScreenshot(null)}
      />
    </Card>
  )
}
