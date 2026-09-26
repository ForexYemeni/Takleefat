'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  BadgeCheck,
  Briefcase,
  Check,
  ClipboardList,
  Coins,
  Copy,
  Gift,
  Hourglass,
  Link2,
  Loader2,
  Lock,
  Share2,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UserPlus,
  Users,
} from 'lucide-react'
import { apiFetcher } from '@/lib/api-client'
import { formatCurrency } from '@/lib/utils'
import { ROLE_LABELS } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import {
  REFERRAL_STATUS_LABELS,
  REFERRAL_SOURCE_LABELS,
  REFERRAL_REWARD_STATUS_LABELS,
  REFERRAL_ORIGIN_LABELS,
} from '@/lib/referral-labels'

/**
 * «إحالاتي» — الجولة 75 | برنامج إحالة تكليفات
 * ============================================================
 * تصميم Premium Medical SaaS بهوية تكليفات: بطاقات زجاجية، توهج سماوي/بنفسجي
 * خفيف، أرقام واضحة، حالات Status، خط زمني لكل إحالة، وتوضيح إلزامي أن المزايا
 * خصم من رسوم المنصة وليست رصيداً نقدياً قابلاً للسحب.
 */

interface ReferralItem {
  id: string
  source: 'LINK' | 'DIRECT'
  status: string
  invitedName: string | null
  invitedPhone: string | null
  createdAt: string
  registeredAt: string | null
  verifiedAt: string | null
  referred: { id: string; name: string; phone: string | null; role: string; status: string; specialty: string | null } | null
  activity: { assignments: number; opportunities: number; applications: number }
  rewardsTotal: number
  rewardsCurrency: string
  hasActiveWork: boolean
}

interface RewardItem {
  id: string
  originType: string
  originLabel: string
  baseValue: number
  platformFeeAmount: number
  currency: string
  percent: number
  amount: number
  status: string
  usedAmount: number
  createdAt: string
}

interface TransactionItem {
  id: string
  amount: number
  note: string | null
  createdAt: string
}

interface MyReferralsData {
  eligible: boolean
  reason?: string
  settings?: { policyNote: string; includeAssignments: boolean; includeOpportunities: boolean }
  myPercent?: number
  code?: string
  inviteLink?: string
  visits?: number
  stats?: {
    totalInvited: number
    verified: number
    active: number
    assignments: number
    opportunities: number
  }
  benefits?: { totalAccrued: number; used: number; remaining: number; pendingReview: number }
  items?: ReferralItem[]
  recentRewards?: RewardItem[]
  recentTransactions?: TransactionItem[]
}

const STATUS_TINTS: Record<string, string> = {
  INVITED: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
  REGISTERED: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  VERIFIED: 'bg-teal-500/10 text-teal-600 dark:text-teal-400',
  REWARDED: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  BLOCKED: 'bg-red-500/10 text-red-600 dark:text-red-400',
}

const REWARD_TINTS: Record<string, string> = {
  PENDING_REVIEW: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  ACCRUED: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  PARTIALLY_USED: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  USED: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
  CANCELLED: 'bg-red-500/10 text-red-600 dark:text-red-400',
}

/** سلسلة التجربة الموحدة — من الدعوة حتى الاستحقاق */
const JOURNEY = [
  { label: 'ادعُ كادراً', icon: UserPlus },
  { label: 'شارك الرابط', icon: Link2 },
  { label: 'أكمل التسجيل', icon: Users },
  { label: 'وثّق الحساب', icon: ShieldCheck },
  { label: 'تكليف أو فرصة', icon: Briefcase },
  { label: 'استحقاق تلقائي', icon: Gift },
]

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('ar', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return '—'
  }
}

export function MyReferrals() {
  const qc = useQueryClient()
  const [copied, setCopied] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [inviteName, setInviteName] = useState('')
  const [invitePhone, setInvitePhone] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['my-referrals'],
    queryFn: () => apiFetcher<MyReferralsData>('/api/referrals/me'),
    staleTime: 30_000,
  })

  const copyLink = async () => {
    if (!data?.inviteLink) return
    try {
      await navigator.clipboard.writeText(data.inviteLink)
      setCopied(true)
      toast.success('نُسخ رابط الدعوة — شاركه مع كوادر وأطباء جدد')
      setTimeout(() => setCopied(false), 2500)
    } catch {
      toast.error('تعذر النسخ — انسخ الرابط يدوياً من الحقل')
    }
  }

  const shareLink = async () => {
    if (!data?.inviteLink) return
    const shareText = 'انضم إلى تكليفات من خلال دعوتي — منصة احترافية لإدارة التكليفات الطبية والتمريضية وفرص العمل الصحية'
    const shareApi = (navigator as Navigator & { share?: (d: { title: string; text: string; url: string }) => Promise<void> }).share
    if (typeof shareApi === 'function') {
      try {
        await shareApi.call(navigator, { title: 'تكليفات | Takleefat', text: shareText, url: data.inviteLink })
        return
      } catch {
        // المستخدم ألغى المشاركة — لا رسالة خطأ
        return
      }
    }
    try {
      await navigator.clipboard.writeText(`${shareText}\n${data.inviteLink}`)
      toast.success('نُسخ نص الدعوة مع الرابط — الصقه في أي تطبيق')
    } catch {
      toast.error('المشاركة غير مدعومة على هذا الجهاز — انسخ الرابط يدوياً')
    }
  }

  const whatsappShare = () => {
    if (!data?.inviteLink) return
    const text = encodeURIComponent(
      `انضم إلى تكليفات من خلال دعوتي 🩺\nمنصة احترافية لإدارة التكليفات الطبية والتمريضية وفرص العمل الصحية\n${data.inviteLink}`
    )
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer')
  }

  const submitInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (inviting) return
    setInviting(true)
    try {
      const res = await fetch('/api/referrals/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: inviteName, phone: invitePhone }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body?.error ?? 'تعذر إنشاء الدعوة — أعد المحاولة')
        return
      }
      toast.success(body?.message ?? 'سُجلت الدعوة المباشرة بنجاح')
      setInviteName('')
      setInvitePhone('')
      qc.invalidateQueries({ queryKey: ['my-referrals'] })
    } finally {
      setInviting(false)
    }
  }

  // ---------- حالات التحميل وعدم الأهلية ----------
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-36 w-full rounded-3xl" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-3xl" />
      </div>
    )
  }

  if (!data?.eligible) {
    return (
      <div className="liquid-glass mx-auto mt-10 max-w-lg rounded-3xl p-8 text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-600">
          <Lock className="size-7" />
        </div>
        <h1 className="mb-2 text-xl font-extrabold text-foreground">إحالاتي</h1>
        <p className="text-sm leading-7 text-muted-foreground">{data?.reason ?? 'برنامج الإحالة غير متاح حالياً'}</p>
        <Button asChild variant="outline" className="mt-5">
          <Link href="/">العودة إلى لوحتي</Link>
        </Button>
      </div>
    )
  }

  const { stats, benefits, items = [], recentRewards = [], recentTransactions = [] } = data
  const policyNote =
    data.settings?.policyNote ??
    'تُستخدم مزايا الإحالة كخصم على رسوم المنصة وفق سياسة تكليفات، ولا تمثل رصيداً نقدياً قابلاً للسحب.'
  const usagePercent = benefits && benefits.totalAccrued > 0
    ? Math.min(100, Math.round((benefits.used / benefits.totalAccrued) * 100))
    : 0

  return (
    <div className="space-y-5">
      {/* ---------- الترويسة البطولية الزجاجية ---------- */}
      <section className="liquid-glass relative overflow-hidden rounded-3xl p-5 md:p-7">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 end-[-60px] size-64 rounded-full bg-cyan-400/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-28 start-[-40px] size-56 rounded-full bg-violet-500/15 blur-3xl"
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-primary/8 px-3 py-1 text-[11px] font-bold text-primary">
              <Sparkles className="size-3.5" />
              برنامج إحالة تكليفات
            </p>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
              إحالاتي
            </h1>
            <p className="mt-1 max-w-xl text-sm leading-7 text-muted-foreground">
              ادعُ كوادر صحية وأطباء إلى تكليفات برابطك الشخصي أو بدعوة مباشرة — وعند حصولهم على
              تكليف أو فرصة مؤهلة تُحتسب مزايا إحالتك تلقائياً.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5 rounded-2xl bg-primary/8 px-4 py-3 text-center">
            <span className="text-[11px] font-bold text-muted-foreground">نسبة إحالتك</span>
            <span className="text-2xl font-black text-primary">{data.myPercent ?? 0}٪</span>
            <span className="text-[10px] text-muted-foreground">من رسوم المنصة المحصلة</span>
          </div>
        </div>

        {/* سلسلة التجربة */}
        <div className="relative mt-5 flex flex-wrap items-center gap-1.5">
          {JOURNEY.map((step, i) => (
            <div key={step.label} className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
                <step.icon className="size-3.5 text-primary" />
                {step.label}
              </span>
              {i < JOURNEY.length - 1 && (
                <span aria-hidden className="text-[10px] text-muted-foreground/60">←</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ---------- بطاقة الدعوة الزجاجية Premium ---------- */}
      <section className="liquid-glass rounded-3xl p-5 md:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-extrabold text-foreground">
            <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/15 to-violet-500/15 text-primary">
              <UserPlus className="size-5" />
            </span>
            ادعُ كادراً إلى تكليفات
          </h2>
          {typeof data.visits === 'number' && (
            <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-bold text-muted-foreground">
              {data.visits} زيارة على الرابط
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2.5 md:flex-row md:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-border/70 bg-background/70 px-3.5 py-2.5">
            <Link2 className="size-4 shrink-0 text-primary" />
            <input
              readOnly
              dir="ltr"
              value={data.inviteLink ?? ''}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="رابط الدعوة الشخصي"
              className="min-w-0 flex-1 bg-transparent text-left text-xs text-muted-foreground outline-none md:text-sm"
            />
            <span className="hidden shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-black tracking-wider text-primary sm:block" dir="ltr">
              {data.code}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 md:w-auto md:shrink-0">
            <Button onClick={copyLink} className="gap-1.5" size="sm" aria-label="نسخ الرابط">
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              نسخ الرابط
            </Button>
            <Button onClick={shareLink} variant="outline" size="sm" className="gap-1.5" aria-label="مشاركة">
              <Share2 className="size-4" />
              مشاركة
            </Button>
            <Button
              onClick={whatsappShare}
              size="sm"
              className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
              aria-label="مشاركة عبر واتساب"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="size-4" aria-hidden>
                <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.6-6.1c-.3-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4 0-.5.2-.7l.4-.5c.1-.2.2-.3.3-.5v-.5L9.5 7.9c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.9.9-1.1 2.2-.2 3.9a12 12 0 0 0 4.6 4.4c1.8.9 2.6 1 3.5.8.6-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2 0-.1-.2-.2-.5-.3Z" />
              </svg>
              واتساب
            </Button>
          </div>
        </div>

        {/* الدعوة المباشرة */}
        <form onSubmit={submitInvite} className="mt-4 rounded-2xl border border-dashed border-border/80 bg-background/50 p-4">
          <p className="mb-3 flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
            <Stethoscope className="size-4 text-primary" />
            دعوة مباشرة — أدخل اسم الكادر ورقمه، وعند تسجيله بنفس الرقم يرتبط بإحالتك تلقائياً
          </p>
          <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
            <div className="space-y-1">
              <Label htmlFor="ref-name" className="text-[11px] text-muted-foreground">الاسم مع اللقب</Label>
              <Input
                id="ref-name"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="مثال: أحمد صالح"
                maxLength={80}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ref-phone" className="text-[11px] text-muted-foreground">رقم الهاتف (7xxxxxxxx)</Label>
              <Input
                id="ref-phone"
                type="tel"
                dir="ltr"
                inputMode="numeric"
                value={invitePhone}
                onChange={(e) => setInvitePhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
                placeholder="773178684"
                className="text-left"
                required
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={inviting} className="w-full gap-1.5 md:w-auto">
                {inviting ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
                إنشاء الدعوة
              </Button>
            </div>
          </div>
        </form>
      </section>

      {/* ---------- الإحصاءات ---------- */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard icon={Users} label="إجمالي المدعوين" value={stats?.totalInvited ?? 0} tint="text-sky-600 bg-sky-500/10" />
        <StatCard icon={BadgeCheck} label="حسابات موثقة" value={stats?.verified ?? 0} tint="text-teal-600 bg-teal-500/10" />
        <StatCard icon={ShieldCheck} label="حسابات نشطة" value={stats?.active ?? 0} tint="text-emerald-600 bg-emerald-500/10" />
        <StatCard icon={ClipboardList} label="تكليفات ناتجة" value={stats?.assignments ?? 0} tint="text-violet-600 bg-violet-500/10" />
        <StatCard icon={Briefcase} label="فرص ناتجة" value={stats?.opportunities ?? 0} tint="text-amber-600 bg-amber-500/10" />
      </section>

      {/* ---------- مزايا الإحالة ---------- */}
      <section className="liquid-glass rounded-3xl p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-extrabold text-foreground">
            <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/15 to-cyan-500/15 text-emerald-600">
              <Coins className="size-5" />
            </span>
            مزايا الإحالة
          </h2>
          {(benefits?.pendingReview ?? 0) > 0 && (
            <Badge className="bg-amber-500/10 text-amber-600 hover:bg-amber-500/15">
              {formatCurrency(benefits!.pendingReview)} بانتظار المراجعة
            </Badge>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <BenefitBox label="إجمالي الاستحقاقات" value={formatCurrency(benefits?.totalAccrued ?? 0)} strong />
          <BenefitBox label="المستخدم من الاستحقاق" value={formatCurrency(benefits?.used ?? 0)} />
          <BenefitBox label="المتبقي من المزايا" value={formatCurrency(benefits?.remaining ?? 0)} highlight />
        </div>

        <div className="mt-4 space-y-1.5">
          <div className="flex justify-between text-[11px] font-bold text-muted-foreground">
            <span>نسبة استخدام المزايا</span>
            <span>{usagePercent}٪</span>
          </div>
          <Progress value={usagePercent} className="h-2" />
        </div>

        <p className="mt-4 rounded-2xl bg-amber-500/8 px-4 py-3 text-xs leading-6 text-amber-700 dark:text-amber-400">
          {policyNote}
        </p>

        {/* آخر المزايا */}
        {recentRewards.length > 0 && (
          <div className="mt-5">
            <h3 className="mb-2 text-xs font-extrabold text-muted-foreground">آخر المزايا المحتسبة</h3>
            <div className="space-y-2">
              {recentRewards.slice(0, 5).map((w) => (
                <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/60 bg-background/60 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-foreground">{w.originLabel}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {REFERRAL_ORIGIN_LABELS[w.originType] ?? w.originType} — {w.percent}٪ من رسوم{' '}
                      {formatCurrency(w.platformFeeAmount)} — {formatDate(w.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                      +{formatCurrency(w.amount)}
                    </span>
                    <Badge className={cn('text-[10px]', REWARD_TINTS[w.status])}>
                      {REFERRAL_REWARD_STATUS_LABELS[w.status] ?? w.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* عمليات الخصم */}
        {recentTransactions.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-xs font-extrabold text-muted-foreground">عمليات استخدام المزايا (خصم من رسوم المنصة)</h3>
            <div className="space-y-2">
              {recentTransactions.slice(0, 5).map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 rounded-2xl border border-border/60 bg-background/60 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-foreground">{t.note ?? 'خصم من رسوم المنصة'}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{formatDate(t.createdAt)}</p>
                  </div>
                  <span className="shrink-0 text-sm font-black text-sky-600 dark:text-sky-400">
                    −{formatCurrency(t.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ---------- قائمة الإحالات ---------- */}
      <section className="liquid-glass rounded-3xl p-5 md:p-6">
        <h2 className="mb-4 flex items-center gap-2 text-base font-extrabold text-foreground">
          <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/15 to-sky-500/15 text-violet-600">
            <Users className="size-5" />
          </span>
          قائمة الإحالات
        </h2>

        {items.length === 0 ? (
          <EmptyInvites />
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <ReferralCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ---------- عناصر مساعدة ----------

function StatCard({
  icon: Icon,
  label,
  value,
  tint,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  tint: string
}) {
  return (
    <div className="liquid-glass-soft rounded-2xl p-4">
      <div className="flex items-center gap-2.5">
        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', tint)}>
          <Icon className="size-4.5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-bold text-muted-foreground">{label}</p>
          <p className="text-xl font-black text-foreground">{value.toLocaleString('ar-YE')}</p>
        </div>
      </div>
    </div>
  )
}

function BenefitBox({
  label,
  value,
  strong,
  highlight,
}: {
  label: string
  value: string
  strong?: boolean
  highlight?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-4 text-center',
        highlight
          ? 'border-emerald-500/30 bg-emerald-500/8'
          : strong
            ? 'border-primary/25 bg-primary/8'
            : 'border-border/60 bg-background/60'
      )}
    >
      <p className="text-[11px] font-bold text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-xl font-black', highlight ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground')}>
        {value}
      </p>
    </div>
  )
}

/** الخط الزمني لحالة الإحالة — مدعو → حساب → توثيق → تكليف → استحقاق */
function ReferralTimeline({ item }: { item: ReferralItem }) {
  const reached = (stage: number) => {
    const order = ['INVITED', 'REGISTERED', 'VERIFIED', 'REWARDED']
    const idx = order.indexOf(item.status)
    if (item.status === 'BLOCKED') return stage === 0 || (stage === 1 && item.registeredAt)
    return idx >= stage
  }
  const blocked = item.status === 'BLOCKED'

  const stages = [
    { label: 'مدعو', done: reached(0) },
    { label: 'أنشأ حساباً', done: reached(1) },
    { label: 'موثق', done: reached(2) },
    { label: item.activity.assignments > 0 || item.activity.opportunities > 0 ? 'حصل على تكليف/فرصة' : 'بانتظار تكليف أو فرصة', done: item.activity.assignments > 0 || item.activity.opportunities > 0 },
    { label: 'تم احتساب الاستحقاق', done: item.status === 'REWARDED' },
  ]

  return (
    <div className="flex items-center gap-1">
      {stages.map((s, i) => (
        <div key={s.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <div className="flex w-full items-center">
            <span className={cn('h-0.5 flex-1 rounded-full', i === 0 ? 'bg-transparent' : s.done && stages[i - 1].done ? 'bg-primary' : 'bg-border')} />
            <span
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-full border-2 text-[9px] font-black transition-colors',
                s.done
                  ? blocked
                    ? 'border-red-500 bg-red-500 text-white'
                    : 'border-primary bg-primary text-white'
                  : 'border-border bg-background text-muted-foreground/50'
              )}
            >
              {s.done ? '✓' : i + 1}
            </span>
            <span className={cn('h-0.5 flex-1 rounded-full', i === stages.length - 1 ? 'bg-transparent' : s.done && stages[i + 1].done ? 'bg-primary' : 'bg-border')} />
          </div>
          <span className={cn('truncate text-center text-[9px] font-bold leading-tight', s.done ? 'text-foreground' : 'text-muted-foreground/60')}>
            {s.label}
          </span>
        </div>
      ))}
    </div>
  )
}

function ReferralCard({ item }: { item: ReferralItem }) {
  const name = item.referred?.name ?? item.invitedName ?? 'مدعو'
  const role = item.referred?.role ?? null

  return (
    <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-extrabold text-foreground">{name}</p>
            <Badge className={cn('text-[10px]', STATUS_TINTS[item.status])}>
              {REFERRAL_STATUS_LABELS[item.status] ?? item.status}
            </Badge>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
              {REFERRAL_SOURCE_LABELS[item.source] ?? item.source}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {role ? `${ROLE_LABELS[role] ?? role}${item.referred?.specialty ? ` — ${item.referred.specialty}` : ''} · ` : ''}
            {item.referred?.phone ? `${item.referred.phone} · ` : item.invitedPhone ? `${item.invitedPhone} · ` : ''}
            دُعي في {formatDate(item.createdAt)}
            {item.registeredAt ? ` · سجّل ${formatDate(item.registeredAt)}` : ''}
            {item.verifiedAt ? ` · وُثّق ${formatDate(item.verifiedAt)}` : ''}
          </p>
        </div>
        {item.rewardsTotal > 0 && (
          <span className="shrink-0 rounded-xl bg-emerald-500/10 px-3 py-1.5 text-sm font-black text-emerald-600 dark:text-emerald-400">
            {formatCurrency(item.rewardsTotal)}
          </span>
        )}
      </div>

      <div className="mt-3">
        <ReferralTimeline item={item} />
      </div>

      {item.activity.assignments + item.activity.opportunities + item.activity.applications > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {item.activity.assignments > 0 && (
            <span className="rounded-full bg-violet-500/10 px-2.5 py-0.5 text-[10px] font-bold text-violet-600 dark:text-violet-400">
              {item.activity.assignments} تكليف
            </span>
          )}
          {item.activity.opportunities > 0 && (
            <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
              {item.activity.opportunities} فرصة عمل
            </span>
          )}
          {item.activity.applications > 0 && (
            <span className="rounded-full bg-sky-500/10 px-2.5 py-0.5 text-[10px] font-bold text-sky-600 dark:text-sky-400">
              {item.activity.applications} تقديم
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function EmptyInvites() {
  return (
    <div className="rounded-2xl border border-dashed border-border/80 bg-background/50 px-6 py-10 text-center">
      <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Hourglass className="size-6" />
      </span>
      <p className="text-sm font-bold text-foreground">لا توجد إحالات بعد</p>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-6 text-muted-foreground">
        ابدأ بمشاركة رابط دعوتك الشخصي مع زملائك من الكوادر الصحية والأطباء — أو أنشئ دعوة مباشرة
        بالاسم ورقم الهاتف من البطاقة أعلاه.
      </p>
    </div>
  )
}
