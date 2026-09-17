'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileCheck2,
  FileWarning,
  Gift,
  Hourglass,
  Info,
  MapPin,
  Minus,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetcher, apiPost } from '@/lib/api-client'
import {
  APPLICATION_STATUS_LABELS,
  cn,
  formatCurrency,
  formatDate,
  formatTime12,
  POST_GENDER_LABELS,
  POST_STATUS_LABELS,
} from '@/lib/utils'
import { computeMatchScore } from '@/lib/role-theme'
import { StatusBadge } from '@/components/shared/status-badge'
import { DashboardSkeleton, EmptyState } from '@/components/shared/empty-state'
import { ShiftCountdown } from '@/components/shared/shift-countdown'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * تجربة التكليف — الجيل الجديد (الجولة 58)
 * =====================================================
 * صفحة تكليف واحدة موحدة للكادر التمريضي (NURSE) والأطباء (DOCTOR)
 * تُبنى فوق واجهة /api/posts/[id] الحالية — صفر تغيير على المنطق
 * والقيود الموجودة: نفس قيود التقديم (مستندات/رسوم/تعارض وقت) نفسها.
 * Hero زجاجي + قيمة بارزة + مدة ذكية + فحص أهلية + معدل توافق
 * + تايم لاين + بطاقة الجهة + متطلبات المستندات + تكليفات مشابهة
 * + CTA ثابت على الجوال وملخص جانبي على الشاشات الكبيرة.
 */

interface AssignmentExperienceProps {
  audience: 'NURSE' | 'DOCTOR'
}

interface DetailPost {
  id: string
  number: number
  title: string
  description: string | null
  facility: string
  department: string | null
  location: string | null
  startDate: string
  endTime: string | null
  hours: number | null
  gender: string
  nursesNeeded: number
  value: number
  status: string
  createdAt: string
  receiver: { id: string; name: string }
  hospital?: { id: string; name: string; type: string; city: string | null; status: string } | null
}

interface DetailApplication {
  id: string
  status: string
  coverNote: string | null
  reviewNote: string | null
  createdAt: string
  reviewedAt: string | null
}

interface DetailAssignment {
  id: string
  status: string
  receivedAt: string | null
  createdAt: string
  startDate: string
  value: number | null
  paymentStatus: string | null
}

interface DetailSettings {
  feeMode: 'APPLICATION' | 'ADMIN'
  applicationFee: number
  adminFeeType: 'PERCENTAGE' | 'FIXED'
  adminPercentage: number
  adminFeeFixed: number
  promoActive?: boolean
  promoUntil?: string | null
}

interface MyDoc {
  id: string
  type: string
  title: string
  status: string
}

const ROLE_BASE = { NURSE: '/nurse', DOCTOR: '/doctor' } as const

/* ---------- حركات ظهور هادئة تحترم تقليل الحركة ---------- */
function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode
  delay?: number
  className?: string
}) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/* ---------- خط نبض القلب بلون الدور — خافت جداً داخل بطاقة البطل ---------- */
function EcgLine() {
  const d = 'M0 20 L28 20 L36 20 L44 8 L52 32 L60 14 L66 20 L96 20 L104 20 L112 4 L120 36 L128 20 L160 20 L188 20 L196 12 L204 26 L212 20 L244 20 L272 20'
  return (
    <svg viewBox="0 0 272 40" className="h-8 w-full opacity-40" preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill="none" strokeWidth="2" strokeLinecap="round" className="ecg-base" />
      <path d={d} fill="none" strokeWidth="2" strokeLinecap="round" className="assignment-ecg-bright" />
    </svg>
  )
}

/* ---------- عدّاد «يبدأ بعد» — أيام/ساعات/دقائق، ولا يعمل ببيانات غير صحيحة ---------- */
function StartCountdown({ startDate }: { startDate: string }) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const t = setTimeout(() => setNow(Date.now()), 0)
    const iv = setInterval(() => setNow(Date.now()), 30_000)
    return () => {
      clearTimeout(t)
      clearInterval(iv)
    }
  }, [])

  if (now == null) return null
  const target = new Date(startDate).getTime()
  if (!Number.isFinite(target)) return null
  const diff = target - now
  if (diff <= 0) return null

  const days = Math.floor(diff / 86_400_000)
  const hours = Math.floor((diff % 86_400_000) / 3_600_000)
  const minutes = Math.floor((diff % 3_600_000) / 60_000)
  const cells = [
    { v: days, label: 'يوم' },
    { v: hours, label: 'ساعة' },
    { v: minutes, label: 'دقيقة' },
  ]

  return (
    <div className="flex flex-wrap items-center gap-2" role="status" aria-label="الوقت المتبقي لبدء التكليف">
      <span className="flex items-center gap-1 text-xs font-bold text-muted-foreground">
        <Hourglass className="size-3.5" />
        يبدأ بعد
      </span>
      <span className="flex items-center gap-1.5" dir="ltr">
        {cells.map((c) => (
          <span
            key={c.label}
            className="flex min-w-11 flex-col items-center rounded-xl border border-white/50 bg-white/60 px-2 py-1 dark:border-white/10 dark:bg-white/5"
          >
            <span className="text-sm font-black text-[var(--role-accent-strong)] tabular-nums dark:text-[var(--role-accent-glow)]">
              {String(c.v).padStart(2, '0')}
            </span>
            <span className="text-[9px] font-bold text-muted-foreground">{c.label}</span>
          </span>
        ))}
      </span>
    </div>
  )
}

/* =====================================================
   المكوّن الرئيسي
   ===================================================== */
export function AssignmentExperience({ audience }: AssignmentExperienceProps) {
  const params = useParams<{ id: string }>()
  const postId = params?.id
  const queryClient = useQueryClient()
  const basePath = ROLE_BASE[audience]

  const { data, isLoading, isError } = useQuery({
    queryKey: ['post', postId],
    queryFn: () =>
      apiFetcher<{
        post: DetailPost
        myApplication: DetailApplication | null
        myAssignment: DetailAssignment | null
        settings: DetailSettings
      }>(`/api/posts/${postId}`),
    enabled: !!postId,
  })

  const { data: profileData } = useQuery({
    queryKey: ['my-profile'],
    queryFn: () =>
      apiFetcher<{
        user: { status: string; specialty: string | null; qualification: string | null; yearsOfExperience: number | null; gender: string | null }
      }>('/api/me/profile'),
    staleTime: 60_000,
  })
  const { data: docsData } = useQuery({
    queryKey: ['my-documents'],
    queryFn: () => apiFetcher<{ documents: MyDoc[] }>('/api/me/documents'),
    staleTime: 60_000,
  })
  const { data: assignmentsData } = useQuery({
    queryKey: ['my-assignments'],
    queryFn: () =>
      apiFetcher<{ assignments: Array<{ id: string; status: string; startDate: string; endDate: string | null; paymentStatus: string | null; adminFee: number | null }> }>(
        '/api/me/assignments'
      ),
    staleTime: 30_000,
  })
  const { data: wdData } = useQuery({
    queryKey: ['my-work-departments'],
    queryFn: () => apiFetcher<{ departments: Array<{ id: string; name: string }> }>('/api/me/work-departments'),
    enabled: audience === 'NURSE',
    staleTime: 60_000,
  })
  const { data: wsData } = useQuery({
    queryKey: ['my-work-specialties'],
    queryFn: () => apiFetcher<{ specialties: Array<{ id: string; name: string }> }>('/api/me/work-specialties'),
    enabled: audience === 'DOCTOR',
    staleTime: 60_000,
  })
  const { data: postsListData } = useQuery({
    queryKey: ['open-posts'],
    queryFn: () => apiFetcher<{ posts: DetailPost[] }>('/api/posts'),
    staleTime: 30_000,
  })

  /* ---------- مشتقات القيود — نفس منطق صفحة القائمة الحالية حرفياً ---------- */
  const post = data?.post
  const myApplication = data?.myApplication ?? null
  const myAssignment = data?.myAssignment ?? null
  const settings = data?.settings

  const documents = useMemo(() => docsData?.documents ?? [], [docsData])
  const assignments = useMemo(() => assignmentsData?.assignments ?? [], [assignmentsData])

  const applicationFeeDue = settings?.feeMode === 'APPLICATION' ? Math.max(0, settings.applicationFee) : 0
  const unpaidAssignments = assignments.filter(
    (a) => a.paymentStatus !== 'PAID' && a.status !== 'CANCELLED' && ((a.adminFee ?? 0) > 0 || applicationFeeDue > 0)
  )
  const blocked = unpaidAssignments.length > 0
  const needsDocuments = documents.length === 0

  const busyWindows = useMemo(
    () =>
      assignments
        .filter((a) => a.status === 'ACTIVE' || a.status === 'RECEIVED')
        .map((a) => ({
          start: new Date(a.startDate).getTime(),
          end: a.endDate ? new Date(a.endDate).getTime() : new Date(a.startDate).getTime() + 86_400_000,
        })),
    [assignments]
  )
  const timeConflict = useMemo(() => {
    if (!post) return false
    const start = new Date(post.startDate).getTime()
    const end = post.endTime ? new Date(post.endTime).getTime() : null
    return end != null && busyWindows.some((w) => start < w.end && w.start < end)
  }, [post, busyWindows])

  const myTags = useMemo(() => {
    if (audience === 'NURSE') return (wdData?.departments ?? []).map((d) => d.name)
    return (wsData?.specialties ?? []).map((s) => s.name)
  }, [wdData, wsData, audience])

  const documentsState: 'approved' | 'pending' | 'none' = useMemo(() => {
    if (documents.length === 0) return 'none'
    if (documents.some((d) => d.status === 'APPROVED')) return 'approved'
    return 'pending'
  }, [documents])

  const match = useMemo(() => {
    if (!post) return null
    return computeMatchScore({
      audience,
      post,
      me: profileData?.user ?? null,
      myTags,
      documentsState,
      timeConflict,
    })
  }, [post, audience, profileData, myTags, documentsState, timeConflict])

  /* ---------- الرسوم — نفس حساب القائمة الحالي ---------- */
  const fees = useMemo(() => {
    if (!settings || !post) return null
    const promo =
      settings.promoActive && (!settings.promoUntil || new Date(settings.promoUntil).getTime() >= Date.now())
    const adminFee =
      !promo && settings.feeMode === 'ADMIN'
        ? settings.adminFeeType === 'FIXED'
          ? Math.max(0, Math.round(settings.adminFeeFixed))
          : Math.round((post.value * settings.adminPercentage) / 100)
        : 0
    const applicationFee = settings.feeMode === 'APPLICATION' ? Math.max(0, settings.applicationFee) : 0
    return { adminFee, applicationFee, dueToAdmin: adminFee + applicationFee, net: post.value - adminFee - applicationFee }
  }, [settings, post])

  /* ---------- تكليفات مشابهة ---------- */
  const similar = useMemo(() => {
    const posts = postsListData?.posts ?? []
    if (!post) return []
    return posts
      .filter((p) => p.id !== post.id && p.status === 'OPEN' && !(p as unknown as { applications?: unknown[] }).applications?.length)
      .map((p) => ({
        post: p,
        deptMatch: !!p.department && p.department === post.department,
        facilityMatch: p.facility === post.facility,
        matchScore: computeMatchScore({
          audience,
          post: p,
          me: profileData?.user ?? null,
          myTags,
          documentsState,
          timeConflict: false,
        }).score,
      }))
      .filter((s) => s.deptMatch || s.facilityMatch)
      .sort((a, b) => Number(b.deptMatch) - Number(a.deptMatch))
      .slice(0, 3)
  }, [postsListData, post, audience, profileData, myTags, documentsState])

  const [applyOpen, setApplyOpen] = useState(false)
  const [justApplied, setJustApplied] = useState(false)

  const applyMutation = useMutation({
    mutationFn: (coverNote: string) => apiPost<{ message: string }>(`/api/posts/${postId}/apply`, { coverNote }),
    onSuccess: (res) => {
      toast.success(res.message)
      setJustApplied(true)
      setApplyOpen(false)
      queryClient.invalidateQueries({ queryKey: ['post', postId] })
      queryClient.invalidateQueries({ queryKey: ['my-applications'] })
      queryClient.invalidateQueries({ queryKey: ['open-posts'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  /* ---------- حالات التحميل و404 ---------- */
  if (isLoading) return <DashboardSkeleton />
  if (isError || !post) {
    return (
      <div className="space-y-4">
        <BackLink basePath={basePath} />
        <EmptyState
          icon={FileWarning}
          title="هذا التكليف غير متاح"
          description="قد يكون قد أُغلق أو لا يشمل جمهورك — تصفح التكليفات المتاحة الأخرى."
        />
        <div className="text-center">
          <Button asChild variant="outline" className="gap-2">
            <Link href={`${basePath}/assignments`}>
              <ArrowRight className="size-4" />
              الذهاب إلى التكليفات
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  const postOpen = post.status === 'OPEN'

  /* ---------- حالة زر التقديم الرئيسي — نفس القيود الحالية ---------- */
  const cta = buildCtaState({
    myApplication,
    myAssignment,
    postOpen,
    needsDocuments,
    blocked,
    timeConflict,
    justApplied,
    basePath,
  })

  return (
    <div className="space-y-5 pb-2">
      <BackLink basePath={basePath} />

      {/* ================= بطاقة البطل ================= */}
      <Reveal>
        <section
          className="liquid-glass overflow-hidden rounded-3xl"
          aria-label={`تفاصيل التكليف: ${post.title}`}
        >
          <div className="space-y-3 p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <PostStatusPill status={post.status} />
              <span className="rounded-full bg-secondary/80 px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">
                تكليف رقم {post.number || '—'}
              </span>
            </div>

            <h1 className="text-2xl font-black leading-snug sm:text-3xl">{post.title}</h1>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
              <span className="flex items-center gap-1.5 font-bold text-muted-foreground">
                <Building2 className="size-4 text-[var(--role-accent)]" />
                {post.facility}
              </span>
              {post.department && (
                <span className="flex items-center gap-1.5 font-bold text-muted-foreground">
                  <ClipboardList className="size-4 text-[var(--role-accent)]" />
                  {post.department}
                </span>
              )}
              {post.location && (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <MapPin className="size-4" />
                  {post.location}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5 text-xs">
              <Badge variant="outline" className="gap-1 bg-white/50 dark:bg-white/5">
                <UserRound className="size-3" />
                {POST_GENDER_LABELS[post.gender] ?? 'أي جنس'}
              </Badge>
              {post.hours ? (
                <Badge variant="outline" className="gap-1 bg-white/50 dark:bg-white/5">
                  <Clock className="size-3" />
                  {post.hours} ساعة
                </Badge>
              ) : null}
              <Badge variant="outline" className="gap-1 bg-white/50 dark:bg-white/5">
                <Users className="size-3" />
                العدد المطلوب: {post.nursesNeeded}
              </Badge>
            </div>
          </div>
          <div className="px-5 pb-2 sm:px-6">
            <EcgLine />
          </div>
        </section>
      </Reveal>

      {/* ================= الشبكة: التفاصيل + الملخص الجانبي ================= */}
      <div className="lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start lg:gap-6">
        {/* ---- الملخص الجانبي (يمين في RTL — شاشات كبيرة فقط) ---- */}
        <aside className="hidden lg:sticky lg:top-20 lg:block lg:space-y-4" aria-label="ملخص التكليف">
          <Reveal delay={0.1}>
            <ValueCard post={post} fees={fees} compact />
          </Reveal>
          <Reveal delay={0.15}>
            <section className="liquid-glass-soft space-y-3 rounded-2xl p-4">
              <StartCountdown startDate={post.startDate} />
              <ShiftCountdown startDate={post.startDate} endDate={post.endTime} />
            </section>
          </Reveal>
          {match?.enough && match.score != null && (
            <Reveal delay={0.2}>
              <MatchCard score={match.score} reasons={match.reasons} compact />
            </Reveal>
          )}
          <Reveal delay={0.25}>
            <CtaButton cta={cta} onApply={() => setApplyOpen(true)} block />
          </Reveal>
        </aside>

        {/* ---- المحتوى الرئيسي ---- */}
        <div className="space-y-5">
          {/* القيمة — أوضع عنصر في الصفحة (جوال) */}
          <Reveal delay={0.05} className="lg:hidden">
            <ValueCard post={post} fees={fees} />
          </Reveal>

          <Reveal delay={0.1} className="lg:hidden">
            <section className="liquid-glass-soft space-y-2.5 rounded-2xl p-4">
              <StartCountdown startDate={post.startDate} />
              <ShiftCountdown startDate={post.startDate} endDate={post.endTime} />
            </section>
          </Reveal>

          {/* شبكة المعلومات */}
          <Reveal delay={0.12}>
            <InfoGrid post={post} />
          </Reveal>

          {post.description && (
            <Reveal delay={0.14}>
              <section className="rounded-2xl border bg-card p-4" aria-label="وصف التكليف">
                <h2 className="mb-2 flex items-center gap-2 text-sm font-black">
                  <Info className="size-4 text-[var(--role-accent)]" />
                  وصف التكليف
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">{post.description}</p>
              </section>
            </Reveal>
          )}

          {/* فحص الأهلية — هل أنت مؤهل لهذا التكليف؟ */}
          <Reveal delay={0.16}>
            <EligibilityCard
              audience={audience}
              post={post}
              me={profileData?.user ?? null}
              documents={documents}
              myTags={myTags}
              timeConflict={timeConflict}
              basePath={basePath}
            />
          </Reveal>

          {/* معدل التوافق — جوال (الشاشات الكبيرة في الملخص الجانبي) */}
          {match?.enough && match.score != null && (
            <Reveal delay={0.18} className="lg:hidden">
              <MatchCard score={match.score} reasons={match.reasons} />
            </Reveal>
          )}

          {/* بطاقة الجهة الصحية */}
          <Reveal delay={0.2}>
            <FacilityCard post={post} />
          </Reveal>

          {/* متطلبات المستندات */}
          <Reveal delay={0.22}>
            <DocumentsCard documents={documents} basePath={basePath} needsDocuments={needsDocuments} />
          </Reveal>

          {/* التايم لاين */}
          <Reveal delay={0.24}>
            <TimelineCard
              post={post}
              myApplication={myApplication}
              myAssignment={myAssignment}
            />
          </Reveal>

          {/* تكليفات مشابهة */}
          {similar.length > 0 && (
            <Reveal delay={0.26}>
              <section aria-label="تكليفات قد تناسبك" className="space-y-2.5">
                <h2 className="flex items-center gap-2 text-sm font-black">
                  <Sparkles className="size-4 text-[var(--role-accent)]" />
                  تكليفات قد تناسبك
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {similar.map(({ post: p, matchScore, deptMatch }) => (
                    <Link
                      key={p.id}
                      href={`${basePath}/assignments/${p.id}`}
                      className="group rounded-2xl border bg-card p-3.5 transition-all hover:-translate-y-0.5 hover:border-[var(--role-accent)]/50 hover:shadow-md focus-visible:outline-2 focus-visible:outline-[var(--role-accent)]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-1 text-sm font-extrabold group-hover:text-[var(--role-accent-strong)] dark:group-hover:text-[var(--role-accent-glow)]">
                          {p.title}
                        </p>
                        {matchScore != null && (
                          <span className="shrink-0 rounded-lg bg-[var(--role-accent-soft)] px-1.5 py-0.5 text-[10px] font-black text-[var(--role-accent-strong)] dark:text-[var(--role-accent-glow)]">
                            توافق {matchScore}٪
                          </span>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <Building2 className="size-3 shrink-0" />
                        {p.facility}
                      </p>
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span className="font-black text-[var(--role-accent-strong)] dark:text-[var(--role-accent-glow)]" dir="ltr">
                          {formatCurrency(p.value)}
                        </span>
                        <span className="font-bold text-muted-foreground">
                          {deptMatch ? 'نفس قسمك' : 'نفس الجهة'}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            </Reveal>
          )}
        </div>
      </div>

      {/* ================= CTA الثابت — جوال، فوق شريط التنقل ================= */}
      <div
        className="cta-rise fixed inset-x-0 z-40 px-4 lg:hidden"
        style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="liquid-glass mx-auto max-w-md rounded-2xl p-2">
          <CtaButton cta={cta} onApply={() => setApplyOpen(true)} block />
        </div>
      </div>

      {/* ================= حوار التقديم ================= */}
      <ApplyDialog
        open={applyOpen}
        onOpenChange={setApplyOpen}
        post={post}
        fees={fees}
        pending={applyMutation.isPending}
        onSubmit={(note) => applyMutation.mutate(note)}
      />
    </div>
  )
}

/* =====================================================
   العناصر الفرعية
   ===================================================== */

function ClipboardIcon() {
  return <ClipboardList className="size-3.5 text-[var(--role-accent)]" />
}

function BackLink({ basePath }: { basePath: string }) {
  return (
    <Link
      href={`${basePath}/assignments`}
      className="inline-flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm font-bold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--role-accent)]"
    >
      <ArrowRight className="size-4" />
      العودة إلى التكليفات
    </Link>
  )
}

function PostStatusPill({ status }: { status: string }) {
  const open = status === 'OPEN'
  const label = POST_STATUS_LABELS[status] ?? status
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black shadow-sm',
        open
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
          : 'bg-secondary text-muted-foreground'
      )}
    >
      <span
        className={cn(
          'size-2 rounded-full',
          open ? 'status-dot-pulse bg-emerald-500' : 'bg-muted-foreground/50'
        )}
        style={open ? { ['--role-accent-soft' as string]: 'rgba(16,185,129,0.35)' } : undefined}
      />
      {open ? 'متاح الآن' : label}
    </span>
  )
}

function ValueCard({
  post,
  fees,
  compact = false,
}: {
  post: DetailPost
  fees: { adminFee: number; applicationFee: number; dueToAdmin: number; net: number } | null
  compact?: boolean
}) {
  return (
    <section className="liquid-glass rounded-3xl p-5" aria-label="قيمة التكليف">
      <p className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
        <Banknote className="size-4 text-[var(--role-accent)]" />
        قيمة التكليف
      </p>
      <p
        className={cn(
          'mt-1 font-black tracking-tight text-[var(--role-accent-strong)] dark:text-[var(--role-accent-glow)]',
          compact ? 'text-3xl' : 'text-4xl'
        )}
        dir="ltr"
      >
        {formatCurrency(post.value)}
      </p>

      {fees && fees.dueToAdmin === 0 ? (
        <p className="mt-3 flex items-start gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-[11px] font-bold leading-relaxed text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          <Gift className="mt-0.5 size-3.5 shrink-0" />
          عرض بدون رسوم إدارة — التقديم والعمل بلا أي سداد، والصافي لك كاملاً
        </p>
      ) : fees ? (
        <div className="mt-3 space-y-1 rounded-xl border bg-white/60 p-3 text-xs dark:bg-black/20">
          <div className="flex justify-between text-muted-foreground">
            <span>{fees.applicationFee > 0 ? 'رسوم التقديم' : 'حصة الإدارة'}</span>
            <span dir="ltr">{formatCurrency(fees.dueToAdmin)}</span>
          </div>
          <div className="flex justify-between font-extrabold text-emerald-700 dark:text-emerald-300">
            <span>الصافي المستحق لك</span>
            <span dir="ltr">{formatCurrency(fees.net)}</span>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function InfoGrid({ post }: { post: DetailPost }) {
  const cells: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }[] = [
    { icon: ClipboardIcon, label: 'القسم', value: post.department ?? 'غير محدد' },
    { icon: UserRound, label: 'الجنس المطلوب', value: POST_GENDER_LABELS[post.gender] ?? 'أي جنس' },
    { icon: Clock, label: 'المدة', value: post.hours ? `${post.hours} ساعة` : 'وردية' },
    { icon: CalendarDays, label: 'تاريخ البداية', value: formatDate(post.startDate) },
    { icon: CalendarDays, label: 'تاريخ الانتهاء', value: post.endTime ? formatDate(post.endTime) : 'حسب المدة' },
    { icon: Clock, label: 'وقت البداية', value: formatTime12(post.startDate) },
    { icon: Clock, label: 'وقت الانتهاء', value: post.endTime ? formatTime12(post.endTime) : '—' },
    { icon: MapPin, label: 'الموقع', value: post.location ?? 'غير محدد' },
  ]
  return (
    <section aria-label="معلومات التكليف" className="rounded-2xl border bg-card p-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {cells.map((c) => (
          <div key={c.label} className="rounded-xl bg-secondary/50 p-3">
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <c.icon className="size-3.5 text-[var(--role-accent)]" />
              {c.label}
            </p>
            <p className="mt-1 text-xs font-extrabold">{c.value}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ---------- فحص الأهلية ---------- */
type EligibilityItem = {
  state: 'ok' | 'warn' | 'bad' | 'info'
  text: string
  action?: { label: string; href: string }
}

function EligibilityCard({
  audience,
  post,
  me,
  documents,
  myTags,
  timeConflict,
  basePath,
}: {
  audience: 'NURSE' | 'DOCTOR'
  post: DetailPost
  me: { status: string; specialty: string | null; qualification: string | null; yearsOfExperience: number | null; gender: string | null } | null
  documents: MyDoc[]
  myTags: string[]
  timeConflict: boolean
  basePath: string
}) {
  const items: EligibilityItem[] = []

  // حالة الحساب
  if (me?.status === 'APPROVED') items.push({ state: 'ok', text: 'حسابك معتمد لدى الإدارة' })
  else items.push({ state: 'warn', text: 'حسابك قيد مراجعة الإدارة — يُتاح التقديم بعد الاعتماد' })

  // المستندات الأساسية
  const idDoc = documents.find((d) => d.type === 'ID_CARD')
  const licenseDoc = documents.find((d) => d.type === 'PRACTICE_LICENSE')
  const rejected = documents.filter((d) => d.status === 'REJECTED')
  if (rejected.length > 0) {
    items.push({
      state: 'bad',
      text: `يوجد ${rejected.length} مستند مرفوض — أعد رفعه من صفحة مستنداتي`,
      action: { label: 'تحديث المستند', href: `${basePath}/documents` },
    })
  } else if (idDoc && licenseDoc) {
    items.push({ state: 'ok', text: 'مستنداتك الأساسية مرفوعة (الهوية + المزاولة)' })
  } else {
    items.push({
      state: 'warn',
      text: 'ارفع مستنداتك الأساسية (الهوية الشخصية + صورة المزاولة) لتتمكن من التقديم',
      action: { label: 'رفع المستندات', href: `${basePath}/documents` },
    })
  }

  // مطابقة القسم/التخصص
  if (audience === 'NURSE') {
    const deptMatch = !!post.department && myTags.includes(post.department)
    items.push(
      deptMatch
        ? { state: 'ok', text: `قسم عملك يشمل «${post.department}»` }
        : { state: 'info', text: post.department ? `القسم «${post.department}» خارج أقسام عملك المصرّحة — يمكنك التقديم لكن التوافق أقل` : 'التكليف متاح لجميع الأقسام' }
    )
  } else {
    items.push(
      myTags.length > 0
        ? { state: 'ok', text: `تخصصاتك الطبية مسجلة (${myTags.slice(0, 2).join('، ')}${myTags.length > 2 ? '…' : ''})` }
        : { state: 'warn', text: 'لم تسجل تخصصاتك الطبية بعد', action: { label: 'إكمال الملف', href: `${basePath}/profile` } }
    )
  }

  // اكتمال الملف المهني
  const completeProfile = !!me?.specialty && !!me?.qualification
  items.push(
    completeProfile
      ? { state: 'ok', text: 'ملفك المهني مكتمل (التخصص والمؤهل)' }
      : { state: 'warn', text: 'أكمل ملفك المهني (التخصص والمؤهل العلمي)', action: { label: 'إكمال الملف', href: `${basePath}/profile` } }
  )

  // التوفر
  items.push(
    timeConflict
      ? { state: 'warn', text: 'وقت هذا التكليف يتعارض مع تكليف سارٍ لك — التقديم معطل تلقائياً' }
      : { state: 'ok', text: 'أنت متاح خلال فترة هذا التكليف — لا يوجد تعارض' }
  )

  const ICONS = { ok: CheckCircle2, warn: AlertTriangle, bad: XCircle, info: Info }
  const STYLES = {
    ok: 'text-emerald-600 dark:text-emerald-400',
    warn: 'text-amber-600 dark:text-amber-400',
    bad: 'text-red-600 dark:text-red-400',
    info: 'text-sky-600 dark:text-sky-400',
  }

  return (
    <section className="liquid-glass-soft rounded-2xl p-4" aria-label="فحص الأهلية">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-black">
        <ShieldCheck className="size-4.5 text-[var(--role-accent)]" />
        هل أنت مؤهل لهذا التكليف؟
      </h2>
      <ul className="space-y-2">
        {items.map((item, i) => {
          const Icon = ICONS[item.state]
          return (
            <li key={i} className="flex items-start gap-2.5">
              <Icon className={cn('mt-0.5 size-4.5 shrink-0', STYLES[item.state])} />
              <span className="flex-1 text-xs leading-relaxed text-foreground/90">{item.text}</span>
              {item.action && (
                <Link
                  href={item.action.href}
                  className="shrink-0 rounded-lg bg-[var(--role-accent)] px-2.5 py-1 text-[10px] font-black text-white transition-transform hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-[var(--role-accent-strong)]"
                >
                  {item.action.label}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/* ---------- معدل التوافق ---------- */
function MatchCard({
  score,
  reasons,
  compact = false,
}: {
  score: number
  reasons: { ok: boolean; text: string }[]
  compact?: boolean
}) {
  return (
    <section className="liquid-glass-soft rounded-2xl p-4" aria-label="معدل التوافق">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-black">
          <Sparkles className="size-4.5 text-[var(--role-accent)]" />
          معدل توافقك مع هذا التكليف
        </h2>
        <span className="text-2xl font-black tabular-nums text-[var(--role-accent-strong)] dark:text-[var(--role-accent-glow)]" dir="ltr">
          {score}٪
        </span>
      </div>
      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="h-full rounded-full"
          style={{ background: 'linear-gradient(90deg, var(--role-accent), var(--role-accent-glow))' }}
        />
      </div>
      {!compact && (
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-black text-muted-foreground">لماذا؟</p>
          <ul className="space-y-1.5">
            {reasons.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                {r.ok ? (
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Minus className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                )}
                <span className={cn('leading-relaxed', r.ok ? 'text-foreground/90' : 'text-muted-foreground')}>{r.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

/* ---------- بطاقة الجهة الصحية ---------- */
function FacilityCard({ post }: { post: DetailPost }) {
  const hospital = post.hospital
  const mapsUrl = post.location
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(post.location)}`
    : null
  return (
    <section className="rounded-2xl border bg-card p-4" aria-label="الجهة الصحية">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-black">
        <Building2 className="size-4.5 text-[var(--role-accent)]" />
        الجهة الصحية
      </h2>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-extrabold">{hospital?.name ?? post.facility}</p>
          {hospital?.status === 'APPROVED' && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#2563EB]/30 bg-[#2563EB]/10 px-2 py-0.5 text-[10px] font-black text-[#2563EB]">
              <ShieldCheck className="size-3" />
              جهة موثقة
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {hospital?.type && <span>النوع: {hospital.type}</span>}
          {hospital?.city && <span>المدينة: {hospital.city}</span>}
          <span className="flex items-center gap-1">
            <UserRound className="size-3" />
            المسؤول: {post.receiver.name}
          </span>
        </div>
        {mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold text-[var(--role-accent-strong)] transition-colors hover:bg-[var(--role-accent-soft)] focus-visible:outline-2 focus-visible:outline-[var(--role-accent)] dark:text-[var(--role-accent-glow)]"
          >
            <MapPin className="size-3.5" />
            فتح الموقع على الخريطة
          </a>
        )}
      </div>
    </section>
  )
}

/* ---------- متطلبات المستندات ---------- */
const REQUIRED_DOCS: { type: string; label: string; required: boolean }[] = [
  { type: 'ID_CARD', label: 'الهوية الشخصية', required: true },
  { type: 'PRACTICE_LICENSE', label: 'صورة المزاولة', required: true },
  { type: 'EXPERIENCE_CERT', label: 'شهادة الخبرة', required: false },
]

function DocumentsCard({
  documents,
  basePath,
  needsDocuments,
}: {
  documents: MyDoc[]
  basePath: string
  needsDocuments: boolean
}) {
  return (
    <section className="rounded-2xl border bg-card p-4" aria-label="متطلبات التكليف">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-black">
          <FileCheck2 className="size-4.5 text-[var(--role-accent)]" />
          متطلبات التكليف — مستنداتك
        </h2>
        {needsDocuments && (
          <Link
            href={`${basePath}/documents`}
            className="rounded-lg bg-[var(--role-accent)] px-2.5 py-1 text-[10px] font-black text-white focus-visible:outline-2 focus-visible:outline-[var(--role-accent-strong)]"
          >
            رفع المستندات
          </Link>
        )}
      </div>
      <ul className="space-y-2">
        {REQUIRED_DOCS.map((req) => {
          const doc = documents.find((d) => d.type === req.type)
          return (
            <li key={req.type} className="flex items-center justify-between gap-2 rounded-xl bg-secondary/50 px-3 py-2">
              <span className="text-xs font-bold">
                {req.label}
                {!req.required && <span className="ms-1 text-[10px] font-semibold text-muted-foreground">(اختياري)</span>}
              </span>
              {!doc ? (
                <span className={cn('text-[10px] font-black', req.required ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
                  {req.required ? 'غير مرفوع بعد' : '—'}
                </span>
              ) : (
                <StatusBadge
                  status={doc.status}
                  labels={{ PENDING: 'قيد المراجعة', APPROVED: 'معتمد', REJECTED: 'مرفوض' }}
                  className="text-[10px]"
                />
              )}
            </li>
          )
        })}
      </ul>
      <p className="mt-2.5 text-[10px] leading-relaxed text-muted-foreground">
        المطلوب للتقديم: الهوية الشخصية + صورة المزاولة — تُراجع مستنداتك من إدارة المنصة
      </p>
    </section>
  )
}

/* ---------- التايم لاين ---------- */
interface TimelineEvent {
  label: string
  date?: string | null
  state: 'done' | 'active' | 'rejected' | 'pending'
}

function TimelineCard({
  post,
  myApplication,
  myAssignment,
}: {
  post: DetailPost
  myApplication: DetailApplication | null
  myAssignment: DetailAssignment | null
}) {
  const events: TimelineEvent[] = [{ label: 'تم إنشاء التكليف', date: post.createdAt, state: 'done' }]

  if (myApplication) {
    events.push({ label: 'قدّمت على هذا التكليف', date: myApplication.createdAt, state: 'done' })
    if (myApplication.status === 'PENDING') events.push({ label: 'طلبك قيد المراجعة', state: 'active' })
    if (myApplication.status === 'APPROVED')
      events.push({ label: 'تم قبول طلبك', date: myApplication.reviewedAt, state: 'done' })
    if (myApplication.status === 'REJECTED')
      events.push({ label: 'لم يتم قبول الطلب', date: myApplication.reviewedAt, state: 'rejected' })
  } else {
    events.push({ label: 'بانتظار تقديمك — قدّم الآن لتبدأ رحلتك', state: 'pending' })
  }

  if (myAssignment) {
    events.push({ label: 'أُسند التكليف إليك', date: myAssignment.createdAt, state: 'done' })
    if (myAssignment.status === 'RECEIVED' || myAssignment.status === 'ACTIVE')
      events.push({
        label: 'بدأ التكليف',
        date: myAssignment.receivedAt ?? myAssignment.startDate,
        state: 'active',
      })
    if (myAssignment.status === 'COMPLETED') events.push({ label: 'اكتمل التكليف', state: 'done' })
  }

  const DOT = {
    done: 'bg-emerald-500 text-white',
    active: 'status-dot-pulse bg-[var(--role-accent)] text-white',
    rejected: 'bg-red-500 text-white',
    pending: 'border-2 border-dashed border-muted-foreground/40 bg-transparent text-transparent',
  }

  return (
    <section className="rounded-2xl border bg-card p-4" aria-label="مسار التكليف">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-black">
        <FileCheck2 className="size-4.5 text-[var(--role-accent)]" />
        مسار التكليف
      </h2>
      <ol className="relative space-y-4 ps-1">
        {events.map((e, i) => {
          const last = i === events.length - 1
          return (
            <li key={i} className="relative flex items-start gap-3">
              {!last && <span className="absolute start-[9px] top-5 h-[calc(100%+0.65rem)] w-px bg-border" aria-hidden="true" />}
              <span className={cn('z-10 mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full', DOT[e.state])}>
                <CheckCircle2 className="size-3" />
              </span>
              <span className="min-w-0 flex-1 pb-0.5">
                <span className={cn('block text-xs', e.state === 'rejected' ? 'font-bold text-red-600 dark:text-red-400' : e.state === 'pending' ? 'font-semibold text-muted-foreground/70' : 'font-extrabold')}>
                  {e.label}
                </span>
                {e.date && <span className="mt-0.5 block text-[10px] font-semibold text-muted-foreground/70">{new Date(e.date).toLocaleString('ar', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/* ---------- حالة زر التقديم ---------- */
interface CtaState {
  mode: 'apply' | 'pending' | 'accepted' | 'rejected' | 'closed' | 'docs' | 'fees' | 'conflict' | 'applied-ok'
  label: string
  sub?: string
  href?: string
}

function buildCtaState(args: {
  myApplication: DetailApplication | null
  myAssignment: DetailAssignment | null
  postOpen: boolean
  needsDocuments: boolean
  blocked: boolean
  timeConflict: boolean
  justApplied: boolean
  basePath: string
}): CtaState {
  const { myApplication, postOpen, needsDocuments, blocked, timeConflict, justApplied, basePath } = args
  if (myApplication?.status === 'APPROVED')
    return { mode: 'accepted', label: 'تم قبولك ✓', sub: 'مبروك! تواصل مع الجهة عبر بيانات تكليفك المؤكد' }
  if (myApplication?.status === 'PENDING')
    return { mode: 'pending', label: 'قيد المراجعة', sub: 'طلبك أمام المستلم الإداري الآن — ستصلك النتيجة بإشعار' }
  if (myApplication?.status === 'REJECTED')
    return { mode: 'rejected', label: 'لم يتم قبول الطلب', sub: myApplication.reviewNote ?? 'لا بأس — هناك تكليفات أخرى تناسبك، واصل التقديم' }
  if (justApplied) return { mode: 'applied-ok', label: 'تم التقديم ✓', sub: 'وصل طلبك بنجاح وهو الآن قيد المراجعة' }
  if (!postOpen) return { mode: 'closed', label: 'التقديم مغلق', sub: 'هذا التكليف لم يعد متاحاً للنشر' }
  if (needsDocuments)
    return { mode: 'docs', label: 'ارفع مستنداتك أولاً', sub: 'التقديم يتطلب الهوية وصورة المزاولة', href: `${basePath}/documents` }
  if (blocked)
    return { mode: 'fees', label: 'أكمل سداد الرسوم أولاً', sub: 'لديك تكليف معلق لم تُسدَّد رسومه — سدّده ليتاح التقديم', href: `${basePath}/assignments?tab=applications` }
  if (timeConflict)
    return { mode: 'conflict', label: 'يتعارض مع وقتك الحالي', sub: 'لديك تكليف سارٍ في نفس الفترة — اختر وقتاً آخر' }
  return { mode: 'apply', label: 'التقديم على التكليف', sub: undefined }
}

function CtaButton({ cta, onApply, block }: { cta: CtaState; onApply: () => void; block?: boolean }) {
  const canApply = cta.mode === 'apply'
  const isActionLink = (cta.mode === 'docs' || cta.mode === 'fees') && cta.href
  const base = 'h-11 w-full gap-2 text-sm font-black rounded-xl transition-transform focus-visible:outline-2 focus-visible:outline-[var(--role-accent-strong)]'

  if (canApply) {
    return (
      <Button
        className={cn(base, 'text-white hover:scale-[1.01]')}
        style={{ background: 'linear-gradient(135deg, var(--role-accent-glow), var(--role-accent))' }}
        onClick={onApply}
      >
        <Send className="size-4" />
        {cta.label}
      </Button>
    )
  }
  if (isActionLink) {
    return (
      <Button asChild variant="outline" className={cn(base, 'border-[var(--role-accent)]/50 text-[var(--role-accent-strong)] dark:text-[var(--role-accent-glow)]')}>
        <Link href={cta.href!}>
          {cta.mode === 'docs' ? <FileCheck2 className="size-4" /> : <Wallet className="size-4" />}
          {cta.label}
        </Link>
      </Button>
    )
  }
  const tone =
    cta.mode === 'accepted' || cta.mode === 'applied-ok'
      ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
      : cta.mode === 'rejected'
        ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
        : 'bg-secondary/70 text-muted-foreground'
  return (
    <div className={cn('flex flex-col items-center gap-1 rounded-xl border px-4 py-2.5 text-center', tone)} aria-live="polite">
      <span className="flex items-center gap-1.5 text-sm font-black">
        {cta.mode === 'pending' && <span className="status-dot-pulse size-2 rounded-full bg-current" />}
        {cta.label}
      </span>
      {cta.sub && <span className="text-[10px] font-semibold leading-relaxed opacity-80">{cta.sub}</span>}
    </div>
  )
}

/* ---------- حوار التقديم ---------- */
function ApplyDialog({
  open,
  onOpenChange,
  post,
  fees,
  pending,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  post: DetailPost
  fees: { adminFee: number; applicationFee: number; dueToAdmin: number; net: number } | null
  pending: boolean
  onSubmit: (coverNote: string) => void
}) {
  const [coverNote, setCoverNote] = useState('')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>التقديم على: {post.title}</DialogTitle>
          <DialogDescription>
            {fees && fees.dueToAdmin === 0
              ? 'هذا التكليف ضمن عرض بدون رسوم إدارة — أرسل تقديمك مباشرة وابدأ العمل بسلاسة'
              : 'راجع تفاصيل الرسوم قبل إرسال التقديم — تُدفع الرسوم للإدارة بعد اعتماد تقديمك'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {fees && fees.dueToAdmin > 0 && (
            <div className="rounded-xl border bg-secondary/40 p-3 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>{fees.applicationFee > 0 ? 'رسوم التقديم' : 'حصة الإدارة'}</span>
                <span dir="ltr">{formatCurrency(fees.dueToAdmin)}</span>
              </div>
              <div className="mt-1 flex justify-between font-extrabold text-emerald-700 dark:text-emerald-300">
                <span>الصافي المستحق لك</span>
                <span dir="ltr">{formatCurrency(fees.net)}</span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="apply-cover-note">رسالة تقديم (اختياري)</Label>
            <Textarea
              id="apply-cover-note"
              rows={3}
              placeholder="عرّف عن نفسك وخبرتك بإيجاز..."
              value={coverNote}
              onChange={(e) => setCoverNote(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button
              className="gap-2 text-white"
              style={{ background: 'linear-gradient(135deg, var(--role-accent-glow), var(--role-accent))' }}
              disabled={pending}
              onClick={() => onSubmit(coverNote)}
            >
              <Send className="size-4" />
              {pending ? 'جارٍ الإرسال...' : 'إرسال التقديم'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
