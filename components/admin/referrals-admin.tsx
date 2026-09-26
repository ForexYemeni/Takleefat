'use client'

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Ban,
  BarChart3,
  CheckCircle2,
  Coins,
  Eye,
  FileClock,
  Gift,
  History,
  Loader2,
  Save,
  Settings2,
  Share2,
  ShieldCheck,
  Undo2,
  Users,
  XCircle,
} from 'lucide-react'
import { apiFetcher } from '@/lib/api-client'
import { formatCurrency, ROLE_LABELS, USER_STATUS_LABELS } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  REFERRAL_STATUS_LABELS,
  REFERRAL_SOURCE_LABELS,
  REFERRAL_REWARD_STATUS_LABELS,
  REFERRAL_ORIGIN_LABELS,
  REFERRAL_AUDIT_ACTION_LABELS,
} from '@/lib/referral-labels'

/**
 * «إدارة الإحالات» — الجولة 75 | لوحة الإدارة
 * ============================================================
 * تبويبات: الإعدادات (نسب/شروط/حدود) • الإحالات (الحالات والمراجعة)
 * • المزايا (قرارات المراجعة + تسجيل الخصم) • التقارير (حسب الدور والشهر)
 * • سجل العمليات (Audit Trail). كل شيء فوق أقسام اللوحة القائمة دون مساس.
 */

interface SettingsShape {
  enabled: boolean
  percentNURSE: number
  percentDOCTOR: number
  percentDOCTOR_SUPERVISOR: number
  percentRECEIVER: number
  percentHR: number
  maxRewardPerReferral: number
  maxInvitesPerReferrer: number
  minOperationValue: number
  validityDays: number
  includeAssignments: boolean
  includeOpportunities: boolean
  rewardsRequireReview: boolean
  policyNote: string | null
}

interface OverviewData {
  settings: SettingsShape
  stats: {
    totalReferrals: number
    byStatus: Record<string, number>
    rewards: Record<string, { count: number; amount: number }>
    benefits: { accrued: number; used: number; remaining: number }
    assignmentsFromReferrals: number
    opportunitiesFromReferrals: number
  }
  reports: {
    byRole: Record<string, { referrals: number; rewards: number; amount: number }>
    monthly: Array<{ key: string; label: string; rewards: number; amount: number }>
    topReferrers: Array<{ id: string; name: string; role: string; referred: number; amount: number }>
  }
  referrals: Array<{
    id: string
    source: string
    status: string
    invitedName: string | null
    invitedPhone: string | null
    createdAt: string
    registeredAt: string | null
    verifiedAt: string | null
    note: string | null
    referrer: { id: string; name: string; phone: string; role: string }
    referred: { id: string; name: string; phone: string; role: string; status: string } | null
    activity: { assignments: number; opportunities: number }
    rewardsTotal: number
  }>
  rewards: Array<{
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
    decidedAt: string | null
    decisionNote: string | null
    createdAt: string
    referrer: { id: string; name: string; role: string }
  }>
  transactions: Array<{
    id: string
    amount: number
    note: string | null
    createdAt: string
    referrer: { id: string; name: string; role: string }
  }>
  auditLogs: Array<{
    id: string
    action: string
    entityType: string
    entityId: string
    meta: string | null
    createdAt: string
    actorRole: string
    actorName: string | null
  }>
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

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('ar', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

const ROLE_PERCENT_FIELDS = [
  { key: 'percentNURSE', label: 'الكادر الصحي' },
  { key: 'percentDOCTOR', label: 'الطبيب' },
  { key: 'percentDOCTOR_SUPERVISOR', label: 'مشرف الأطباء' },
  { key: 'percentRECEIVER', label: 'المستلم الإداري' },
  { key: 'percentHR', label: 'الموارد البشرية' },
] as const

export function ReferralsAdmin() {
  const qc = useQueryClient()
  const [tab, setTab] = useState('settings')
  const [rewardDialog, setRewardDialog] = useState<{ id: string; referrerName: string; amount: number; currency: string } | null>(null)
  const [decisionNote, setDecisionNote] = useState('')
  const [deciding, setDeciding] = useState(false)
  const [usageDialog, setUsageDialog] = useState<{ referrerId: string; referrerName: string; remaining: number } | null>(null)
  const [usageAmount, setUsageAmount] = useState('')
  const [usageNote, setUsageNote] = useState('')
  const [savingUsage, setSavingUsage] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-referrals-overview'],
    queryFn: () => apiFetcher<OverviewData>('/api/admin/referrals/overview'),
    staleTime: 20_000,
  })

  // نسخة محلية قابلة للتحرير من الإعدادات
  const [draft, setDraft] = useState<SettingsShape | null>(null)
  const settings = draft ?? data?.settings ?? null

  const pendingRewards = useMemo(
    () => (data?.rewards ?? []).filter((w) => w.status === 'PENDING_REVIEW'),
    [data]
  )

  const patchDraft = (patch: Partial<SettingsShape>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  const saveSettings = async () => {
    if (!settings) return
    try {
      const res = await fetch('/api/admin/referrals/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...settings, policyNote: settings.policyNote ?? '' }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body?.error ?? 'تعذر حفظ الإعدادات')
        return
      }
      toast.success(body?.message ?? 'حُفظت الإعدادات بنجاح')
      setDraft(null)
      qc.invalidateQueries({ queryKey: ['admin-referrals-overview'] })
    } catch {
      toast.error('تعذر الاتصال — أعد المحاولة')
    }
  }

  const decideReward = async (decision: 'APPROVE' | 'CANCEL') => {
    if (!rewardDialog || deciding) return
    setDeciding(true)
    try {
      const res = await fetch(`/api/admin/referrals/rewards/${rewardDialog.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note: decisionNote }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body?.error ?? 'تعذر تنفيذ القرار')
        return
      }
      toast.success(body?.message ?? 'نُفذ القرار بنجاح')
      setRewardDialog(null)
      setDecisionNote('')
      qc.invalidateQueries({ queryKey: ['admin-referrals-overview'] })
    } finally {
      setDeciding(false)
    }
  }

  const openUsageDialog = async (referrerId: string, referrerName: string) => {
    try {
      const res = await apiFetcher<{ benefits: { remaining: number } }>(
        `/api/admin/referrals/transactions?referrerId=${encodeURIComponent(referrerId)}`
      )
      setUsageDialog({ referrerId, referrerName, remaining: res.benefits.remaining })
      setUsageAmount('')
      setUsageNote('')
    } catch {
      toast.error('تعذر قراءة رصيد المزايا')
    }
  }

  const submitUsage = async () => {
    if (!usageDialog || savingUsage) return
    setSavingUsage(true)
    try {
      const res = await fetch('/api/admin/referrals/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referrerId: usageDialog.referrerId,
          amount: Number(usageAmount),
          note: usageNote,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body?.error ?? 'تعذر تسجيل الخصم')
        return
      }
      toast.success(body?.message ?? 'سُجل الخصم بنجاح')
      setUsageDialog(null)
      qc.invalidateQueries({ queryKey: ['admin-referrals-overview'] })
    } finally {
      setSavingUsage(false)
    }
  }

  const changeReferralStatus = async (id: string, action: 'BLOCK' | 'UNBLOCK') => {
    const note =
      action === 'BLOCK'
        ? window.prompt('سبب الإقصاء (يُوثق في سجل العمليات):') ?? ''
        : ''
    if (action === 'BLOCK' && !note.trim()) return
    try {
      const res = await fetch(`/api/admin/referrals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body?.error ?? 'تعذر تغيير الحالة')
        return
      }
      toast.success(body?.message ?? 'تغيرت الحالة')
      qc.invalidateQueries({ queryKey: ['admin-referrals-overview'] })
    } catch {
      toast.error('تعذر الاتصال — أعد المحاولة')
    }
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full rounded-3xl" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-3xl" />
      </div>
    )
  }

  const { stats } = data
  const maxMonthlyAmount = Math.max(1, ...data.reports.monthly.map((m) => m.amount))

  return (
    <div className="space-y-5">
      {/* ---------- الترويسة ---------- */}
      <section className="liquid-glass relative overflow-hidden rounded-3xl p-5 md:p-6">
        <div aria-hidden className="pointer-events-none absolute -top-20 end-[-50px] size-56 rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-primary/8 px-3 py-1 text-[11px] font-bold text-primary">
              <Share2 className="size-3.5" />
              الجولة 75 — إضافي بحت
            </p>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">إدارة الإحالات</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              تحكم كامل ببرنامج إحالة تكليفات — النسب والشروط والحدود والمراجعة والتقارير
            </p>
          </div>
          <Badge
            className={cn(
              'px-4 py-2 text-sm',
              settings?.enabled ? 'bg-emerald-500/12 text-emerald-600' : 'bg-red-500/12 text-red-600'
            )}
          >
            النظام {settings?.enabled ? 'مفعّل' : 'معطّل'}
          </Badge>
        </div>

        {/* أرقام عامة */}
        <div className="relative mt-5 grid grid-cols-2 gap-2.5 lg:grid-cols-6">
          <MiniStat label="إجمالي الإحالات" value={stats.totalReferrals.toLocaleString('ar-YE')} />
          <MiniStat label="موثقة" value={(stats.byStatus.VERIFIED ?? 0).toLocaleString('ar-YE')} />
          <MiniStat label="مستحقة الحالة" value={(stats.byStatus.REWARDED ?? 0).toLocaleString('ar-YE')} />
          <MiniStat label="تكليفات ناتجة" value={stats.assignmentsFromReferrals.toLocaleString('ar-YE')} />
          <MiniStat label="فرص ناتجة" value={stats.opportunitiesFromReferrals.toLocaleString('ar-YE')} />
          <MiniStat label="متبقي المزايا" value={formatCurrency(stats.benefits.remaining)} highlight />
        </div>
      </section>

      {/* ميزات بانتظار المراجعة */}
      {pendingRewards.length > 0 && (
        <section className="rounded-3xl border border-amber-500/40 bg-amber-500/8 p-4 md:p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-amber-700 dark:text-amber-400">
            <FileClock className="size-4.5" />
            {pendingRewards.length} ميزة إحالة بانتظار المراجعة
          </h2>
          <div className="space-y-2">
            {pendingRewards.map((w) => (
              <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-500/30 bg-background/70 px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-foreground">
                    {w.referrer.name} ({ROLE_LABELS[w.referrer.role] ?? w.referrer.role}) — {formatCurrency(w.amount)} {w.currency}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {w.originLabel} — {w.percent}٪ من رسوم {formatCurrency(w.platformFeeAmount)} — {fmtDate(w.createdAt)}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setRewardDialog({ id: w.id, referrerName: w.referrer.name, amount: w.amount, currency: w.currency }); setDecisionNote('') }}>
                  <Eye className="size-3.5" />
                  مراجعة وقرار
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---------- التبويبات ---------- */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-5">
          <TabsTrigger value="settings" className="gap-1.5 text-xs"><Settings2 className="size-3.5" />الإعدادات</TabsTrigger>
          <TabsTrigger value="referrals" className="gap-1.5 text-xs"><Users className="size-3.5" />الإحالات</TabsTrigger>
          <TabsTrigger value="rewards" className="gap-1.5 text-xs"><Gift className="size-3.5" />المزايا</TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5 text-xs"><BarChart3 className="size-3.5" />التقارير</TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5 text-xs"><History className="size-3.5" />سجل العمليات</TabsTrigger>
        </TabsList>

        {/* ---------- تبويب الإعدادات ---------- */}
        <TabsContent value="settings" className="mt-4 space-y-4">
          {settings && (
            <>
              <section className="liquid-glass-soft rounded-3xl p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-extrabold text-foreground">حالة النظام</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      عند التعطيل تُخفى صفحات الإحالة عن المستخدمين ولا يُحتسب أي استحقاق جديد — بيانات الإحالات القائمة تبقى محفوظة
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="ref-enabled"
                      checked={settings.enabled}
                      onCheckedChange={(v) => patchDraft({ enabled: v })}
                      aria-label="تفعيل نظام الإحالة"
                    />
                    <Label htmlFor="ref-enabled" className="text-xs font-bold">
                      {settings.enabled ? 'مفعّل' : 'معطّل'}
                    </Label>
                  </div>
                </div>
              </section>

              <section className="liquid-glass-soft rounded-3xl p-5">
                <h3 className="mb-1 text-sm font-extrabold text-foreground">نسبة الإحالة لكل دور (٪ من رسوم المنصة المحصلة)</h3>
                <p className="mb-4 text-xs text-muted-foreground">
                  مثال: تكليف 100,000 برسوم منصة 5,000 ونسبة 20٪ → استحقاق المُحيل 1,000 وصافي رسوم الإدارة 4,000 (أرقام توضيحية فقط)
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {ROLE_PERCENT_FIELDS.map((f) => (
                    <div key={f.key} className="space-y-1.5">
                      <Label htmlFor={`pct-${f.key}`} className="text-xs font-bold">{f.label}</Label>
                      <Input
                        id={`pct-${f.key}`}
                        type="number"
                        min={0}
                        max={100}
                        step="0.5"
                        value={settings[f.key]}
                        onChange={(e) => patchDraft({ [f.key]: Number(e.target.value) } as Partial<SettingsShape>)}
                      />
                    </div>
                  ))}
                </div>
              </section>

              <section className="liquid-glass-soft rounded-3xl p-5">
                <h3 className="mb-4 text-sm font-extrabold text-foreground">شروط وحدود الاستحقاق</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <NumberField label="الحد الأقصى للاستحقاق الواحد (0 = بلا حد)" value={settings.maxRewardPerReferral} onChange={(v) => patchDraft({ maxRewardPerReferral: v })} />
                  <NumberField label="الحد الأقصى لعدد الإحالات لكل مُحيل (0 = بلا حد)" value={settings.maxInvitesPerReferrer} onChange={(v) => patchDraft({ maxInvitesPerReferrer: v })} />
                  <NumberField label="الحد الأدنى لقيمة العملية (0 = بلا حد)" value={settings.minOperationValue} onChange={(v) => patchDraft({ minOperationValue: v })} />
                  <NumberField label="مدة صلاحية الإحالة (أيام — 0 = بلا مدة)" value={settings.validityDays} onChange={(v) => patchDraft({ validityDays: v })} />
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <SwitchRow label="تشمل الاستحقاقات التكليفات" checked={settings.includeAssignments} onChange={(v) => patchDraft({ includeAssignments: v })} />
                  <SwitchRow label="تشمل الاستحقاقات فرص العمل" checked={settings.includeOpportunities} onChange={(v) => patchDraft({ includeOpportunities: v })} />
                  <SwitchRow label="مراجعة إدارية قبل تثبيت أي استحقاق" checked={settings.rewardsRequireReview} onChange={(v) => patchDraft({ rewardsRequireReview: v })} />
                </div>
              </section>

              <section className="liquid-glass-soft rounded-3xl p-5">
                <h3 className="mb-1 text-sm font-extrabold text-foreground">نص سياسة المزايا (يظهر للمستخدمين)</h3>
                <p className="mb-3 text-xs text-muted-foreground">
                  التوضيح الإلزامي: المزايا خصم من رسوم المنصة وليست رصيداً نقدياً قابلاً للسحب
                </p>
                <Textarea
                  rows={3}
                  maxLength={400}
                  value={settings.policyNote ?? ''}
                  onChange={(e) => patchDraft({ policyNote: e.target.value })}
                  placeholder="تُستخدم مزايا الإحالة كخصم على رسوم المنصة وفق سياسة تكليفات، ولا تمثل رصيداً نقدياً قابلاً للسحب."
                />
              </section>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDraft(null)} disabled={!draft}>
                  <Undo2 className="size-4" />
                  استعادة
                </Button>
                <Button onClick={saveSettings} className="gap-1.5">
                  <Save className="size-4" />
                  حفظ الإعدادات
                </Button>
              </div>
            </>
          )}
        </TabsContent>

        {/* ---------- تبويب الإحالات ---------- */}
        <TabsContent value="referrals" className="mt-4">
          <section className="liquid-glass-soft overflow-hidden rounded-3xl">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                    <th className="px-4 py-3 text-start font-bold">المُحيل</th>
                    <th className="px-4 py-3 text-start font-bold">المُحال</th>
                    <th className="px-4 py-3 text-start font-bold">المصدر</th>
                    <th className="px-4 py-3 text-start font-bold">الحالة</th>
                    <th className="px-4 py-3 text-start font-bold">النشاط</th>
                    <th className="px-4 py-3 text-start font-bold">الاستحقاق</th>
                    <th className="px-4 py-3 text-start font-bold">التاريخ</th>
                    <th className="px-4 py-3 text-start font-bold">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {data.referrals.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-xs text-muted-foreground">
                        لا توجد إحالات بعد — ستظهر هنا فور أول دعوة
                      </td>
                    </tr>
                  )}
                  {data.referrals.map((r) => (
                    <tr key={r.id} className="border-b border-border/40 last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <p className="font-bold text-foreground">{r.referrer.name}</p>
                        <p className="text-[11px] text-muted-foreground">{ROLE_LABELS[r.referrer.role] ?? r.referrer.role} · {r.referrer.phone}</p>
                      </td>
                      <td className="px-4 py-3">
                        {r.referred ? (
                          <>
                            <p className="font-bold text-foreground">{r.referred.name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {ROLE_LABELS[r.referred.role] ?? r.referred.role} · {USER_STATUS_LABELS[r.referred.status] ?? r.referred.status}
                            </p>
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            {r.invitedName ?? '—'}
                            {r.invitedPhone ? ` · ${r.invitedPhone}` : ''}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">{REFERRAL_SOURCE_LABELS[r.source] ?? r.source}</td>
                      <td className="px-4 py-3">
                        <Badge className={cn('text-[10px]', STATUS_TINTS[r.status])}>
                          {REFERRAL_STATUS_LABELS[r.status] ?? r.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {r.activity.assignments} تكليف · {r.activity.opportunities} فرصة
                      </td>
                      <td className="px-4 py-3 text-xs font-black text-emerald-600 dark:text-emerald-400">
                        {r.rewardsTotal > 0 ? formatCurrency(r.rewardsTotal) : '—'}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-muted-foreground">{fmtDate(r.createdAt)}</td>
                      <td className="px-4 py-3">
                        {r.status === 'BLOCKED' ? (
                          <Button size="sm" variant="outline" className="gap-1" onClick={() => changeReferralStatus(r.id, 'UNBLOCK')}>
                            <Undo2 className="size-3" /> إعادة
                          </Button>
                        ) : r.referred ? (
                          <Button size="sm" variant="outline" className="gap-1 text-destructive hover:text-destructive" onClick={() => changeReferralStatus(r.id, 'BLOCK')}>
                            <Ban className="size-3" /> إقصاء
                          </Button>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </TabsContent>

        {/* ---------- تبويب المزايا ---------- */}
        <TabsContent value="rewards" className="mt-4 space-y-4">
          <section className="liquid-glass-soft rounded-3xl p-5">
            <h3 className="mb-1 flex items-center gap-2 text-sm font-extrabold text-foreground">
              <Coins className="size-4 text-emerald-600" />
              حالة مزايا المنصة
            </h3>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <BenefitBox label="إجمالي الاستحقاقات" value={formatCurrency(stats.benefits.accrued)} />
              <BenefitBox label="المستخدم (خصم من الرسوم)" value={formatCurrency(stats.benefits.used)} />
              <BenefitBox label="المتبقي" value={formatCurrency(stats.benefits.remaining)} highlight />
            </div>
            <div className="mt-3">
              <Progress
                value={stats.benefits.accrued > 0 ? Math.min(100, Math.round((stats.benefits.used / stats.benefits.accrued) * 100)) : 0}
                className="h-2"
              />
            </div>
          </section>

          <section className="liquid-glass-soft overflow-hidden rounded-3xl">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                    <th className="px-4 py-3 text-start font-bold">المُحيل</th>
                    <th className="px-4 py-3 text-start font-bold">العملية</th>
                    <th className="px-4 py-3 text-start font-bold">رسوم المنصة</th>
                    <th className="px-4 py-3 text-start font-bold">النسبة</th>
                    <th className="px-4 py-3 text-start font-bold">الاستحقاق</th>
                    <th className="px-4 py-3 text-start font-bold">الحالة</th>
                    <th className="px-4 py-3 text-start font-bold">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rewards.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-xs text-muted-foreground">
                        لا توجد مزايا محتسبة بعد — يُحتسب الاستحقاق آلياً عند تأكيد رسوم عمليات المُحالين
                      </td>
                    </tr>
                  )}
                  {data.rewards.map((w) => (
                    <tr key={w.id} className="border-b border-border/40 last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <p className="font-bold text-foreground">{w.referrer.name}</p>
                        <p className="text-[11px] text-muted-foreground">{ROLE_LABELS[w.referrer.role] ?? w.referrer.role}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="max-w-48 truncate text-xs font-bold">{w.originLabel}</p>
                        <p className="text-[11px] text-muted-foreground">{REFERRAL_ORIGIN_LABELS[w.originType] ?? w.originType} · {fmtDate(w.createdAt)}</p>
                      </td>
                      <td className="px-4 py-3 text-xs">{formatCurrency(w.platformFeeAmount)} {w.currency}</td>
                      <td className="px-4 py-3 text-xs">{w.percent}٪</td>
                      <td className="px-4 py-3 text-sm font-black text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(w.amount)}
                        {w.usedAmount > 0 && (
                          <span className="block text-[10px] font-bold text-sky-600">استُخدم {formatCurrency(w.usedAmount)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={cn('text-[10px]', REWARD_TINTS[w.status])}>
                          {REFERRAL_REWARD_STATUS_LABELS[w.status] ?? w.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {w.status === 'PENDING_REVIEW' ? (
                          <Button size="sm" variant="outline" className="gap-1" onClick={() => { setRewardDialog({ id: w.id, referrerName: w.referrer.name, amount: w.amount, currency: w.currency }); setDecisionNote('') }}>
                            <Eye className="size-3" /> قرار
                          </Button>
                        ) : ['ACCRUED', 'PARTIALLY_USED'].includes(w.status) ? (
                          <Button size="sm" variant="outline" className="gap-1" onClick={() => openUsageDialog(w.referrer.id, w.referrer.name)}>
                            <Coins className="size-3" /> تسجيل خصم
                          </Button>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {data.transactions.length > 0 && (
            <section className="liquid-glass-soft rounded-3xl p-5">
              <h3 className="mb-3 text-sm font-extrabold text-foreground">آخر عمليات استخدام المزايا</h3>
              <div className="space-y-2">
                {data.transactions.slice(0, 10).map((t) => (
                  <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/50 bg-background/60 px-3.5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold">{t.referrer.name} — {t.note ?? 'خصم من رسوم المنصة'}</p>
                      <p className="text-[11px] text-muted-foreground">{fmtDate(t.createdAt)}</p>
                    </div>
                    <span className="text-sm font-black text-sky-600 dark:text-sky-400">−{formatCurrency(t.amount)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </TabsContent>

        {/* ---------- تبويب التقارير ---------- */}
        <TabsContent value="reports" className="mt-4 space-y-4">
          <section className="liquid-glass-soft rounded-3xl p-5">
            <h3 className="mb-4 text-sm font-extrabold text-foreground">الاستحقاقات حسب الشهر (آخر 6 أشهر)</h3>
            <div className="flex h-44 items-end justify-between gap-2.5">
              {data.reports.monthly.map((m) => (
                <div key={m.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                  <span className="text-[10px] font-black text-muted-foreground">
                    {m.amount > 0 ? formatCurrency(m.amount) : ''}
                  </span>
                  <div
                    className="w-full max-w-12 rounded-t-xl bg-gradient-to-t from-cyan-600/70 to-violet-500/70 transition-all"
                    style={{ height: `${Math.max(4, (m.amount / maxMonthlyAmount) * 100)}%` }}
                    title={`${m.rewards} ميزة — ${formatCurrency(m.amount)}`}
                  />
                  <span className="text-[10px] font-bold text-muted-foreground">{m.label}</span>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="liquid-glass-soft rounded-3xl p-5">
              <h3 className="mb-3 text-sm font-extrabold text-foreground">حسب دور المُحيل</h3>
              <div className="space-y-2.5">
                {Object.entries(data.reports.byRole).length === 0 && (
                  <p className="text-xs text-muted-foreground">لا بيانات بعد</p>
                )}
                {Object.entries(data.reports.byRole).map(([role, v]) => (
                  <div key={role} className="flex items-center justify-between gap-2 rounded-2xl border border-border/50 bg-background/60 px-3.5 py-2.5">
                    <span className="text-xs font-bold">{ROLE_LABELS[role] ?? role}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {v.referrals} إحالة · {v.rewards} ميزة · {formatCurrency(v.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="liquid-glass-soft rounded-3xl p-5">
              <h3 className="mb-3 text-sm font-extrabold text-foreground">أعلى المُحيلين استحقاقاً</h3>
              <div className="space-y-2.5">
                {data.reports.topReferrers.length === 0 && (
                  <p className="text-xs text-muted-foreground">لا بيانات بعد</p>
                )}
                {data.reports.topReferrers.map((t, i) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 rounded-2xl border border-border/50 bg-background/60 px-3.5 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-black text-primary">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold">{t.name}</p>
                        <p className="text-[10px] text-muted-foreground">{ROLE_LABELS[t.role] ?? t.role} · {t.referred} إحالة</p>
                      </div>
                    </div>
                    <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(t.amount)}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </TabsContent>

        {/* ---------- تبويب سجل العمليات ---------- */}
        <TabsContent value="audit" className="mt-4">
          <section className="liquid-glass-soft rounded-3xl p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-foreground">
              <History className="size-4 text-primary" />
              سجل تدقيق برنامج الإحالة — كل عملية قابلة للتتبع
            </h3>
            <div className="space-y-2">
              {data.auditLogs.length === 0 && (
                <p className="py-8 text-center text-xs text-muted-foreground">لا عمليات مسجلة بعد</p>
              )}
              {data.auditLogs.map((l) => (
                <div key={l.id} className="rounded-2xl border border-border/50 bg-background/60 px-3.5 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-bold text-foreground">
                      {REFERRAL_AUDIT_ACTION_LABELS[l.action] ?? l.action}
                    </p>
                    <span className="text-[10px] text-muted-foreground">{fmtDate(l.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {l.actorName ? `${l.actorName} (${l.actorRole})` : l.actorRole} · {l.entityType} #{l.entityId.slice(-8)}
                  </p>
                  {l.meta && (
                    <p dir="ltr" className="mt-1 max-h-16 overflow-hidden break-all rounded-lg bg-muted/50 px-2 py-1 text-left text-[10px] text-muted-foreground">
                      {l.meta}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        </TabsContent>
      </Tabs>

      {/* ---------- حوار قرار المراجعة ---------- */}
      <Dialog open={rewardDialog !== null} onOpenChange={(v) => !v && setRewardDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>قرار مراجعة ميزة إحالة</DialogTitle>
            <DialogDescription>
              {rewardDialog && `${rewardDialog.referrerName} — استحقاق ${formatCurrency(rewardDialog.amount)} ${rewardDialog.currency}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="decision-note" className="text-xs font-bold">ملاحظة القرار (اختيارية للاعتماد — توثق في السجل)</Label>
              <Textarea
                id="decision-note"
                rows={2}
                maxLength={300}
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                placeholder="سبب القرار إن وجد..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => decideReward('CANCEL')} disabled={deciding}>
                {deciding ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
                إلغاء الميزة
              </Button>
              <Button className="gap-1.5" onClick={() => decideReward('APPROVE')} disabled={deciding}>
                {deciding ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                اعتماد
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---------- حوار تسجيل الخصم ---------- */}
      <Dialog open={usageDialog !== null} onOpenChange={(v) => !v && setUsageDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تسجيل استخدام مزايا إحالة</DialogTitle>
            <DialogDescription>
              {usageDialog && `${usageDialog.referrerName} — المتبقي من المزايا: ${formatCurrency(usageDialog.remaining)}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="rounded-2xl bg-amber-500/8 px-3.5 py-2.5 text-[11px] leading-6 text-amber-700 dark:text-amber-400">
              يُسجل الخصم كمزايا إحالة مستخدمة (خصم من رسوم المنصة وفق سياسة تكليفات) — لا يوجد أي سحب نقدي أو تحويل بنكي.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="usage-amount" className="text-xs font-bold">قيمة الخصم</Label>
              <Input
                id="usage-amount"
                type="number"
                min={1}
                max={usageDialog?.remaining ?? undefined}
                value={usageAmount}
                onChange={(e) => setUsageAmount(e.target.value.replace(/[^\d.]/g, ''))}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="usage-note" className="text-xs font-bold">بيان الخصم</Label>
              <Input
                id="usage-note"
                maxLength={300}
                value={usageNote}
                onChange={(e) => setUsageNote(e.target.value)}
                placeholder="مثال: خصم رسوم تكليف أو فرصة عمل"
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={submitUsage} disabled={savingUsage || !usageAmount || Number(usageAmount) <= 0} className="gap-1.5">
                {savingUsage ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                تسجيل الخصم
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------- عناصر مساعدة ----------

function MiniStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn(
      'rounded-2xl border p-3 text-center',
      highlight ? 'border-emerald-500/30 bg-emerald-500/8' : 'border-border/50 bg-background/60'
    )}>
      <p className="text-[10px] font-bold text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 text-base font-black', highlight ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground')}>{value}</p>
    </div>
  )
}

function BenefitBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn(
      'rounded-2xl border p-4 text-center',
      highlight ? 'border-emerald-500/30 bg-emerald-500/8' : 'border-border/50 bg-background/60'
    )}>
      <p className="text-[11px] font-bold text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-lg font-black', highlight ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground')}>{value}</p>
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-bold leading-5 text-muted-foreground">{label}</Label>
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
      />
    </div>
  )
}

function SwitchRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-2xl border border-border/50 bg-background/60 px-3.5 py-3">
      <Label className="text-xs font-bold leading-5">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  )
}
