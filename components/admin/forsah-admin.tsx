'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BadgeCheck,
  Banknote,
  Briefcase,
  Building2,
  ClipboardList,
  Eye,
  KeyRound,
  Lock,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Save,
  ScrollText,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCog,
  Users,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiDelete, apiFetcher, apiPatch, apiPost } from '@/lib/api-client'
import { cn, formatDate } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { ForsahBadge, formatSalary } from '@/components/forsah/opportunity-visuals'
import { DocumentViewer, type ViewableDocument } from '@/components/shared/document-viewer'
import { FORSAH_PERMISSIONS, DEFAULT_HR_PERMISSIONS } from '@/lib/forsah/constants'

const PERMISSION_LABELS: Record<string, string> = {
  'opportunity.view': 'عرض الفرص',
  'opportunity.create': 'إنشاء فرصة',
  'opportunity.edit': 'تعديل فرصة',
  'opportunity.publish': 'نشر فرصة',
  'opportunity.pause': 'إيقاف/استئناف',
  'opportunity.close': 'إغلاق فرصة',
  'opportunity.viewApplicants': 'عرض المتقدمين',
  'opportunity.inviteInterview': 'دعوة مقابلات',
  'opportunity.selectCandidate': 'اختيار موظفين',
  'opportunity.viewFinancials': 'عرض المالية',
  'opportunity.viewCommission': 'عرض العمولات',
  'opportunity.manage': 'إدارة عليا (فرصة)',
}

/**
 * لوحة الإدارة لمنظومة «فرصة» — الجولة 66 (المواصفة 2/14/16/20)
 * تبويب الفرص: كل الفرص + إغلاق الفرصة بصلاحية الإدارة العليا + الأرشفة.
 * تبويب حسابات الموارد البشرية: إنشاء HR + تعديل + تفعيل/تعطيل + كلمة مرور + صلاحيات.
 * تبويب الرسوم: نوع/قيمة الرسوم + نسبة HR + الحدود — الإدارة وحدها.
 */
export function ForsahAdminManager() {
  const [tab, setTab] = useState('opportunities')
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['forsah-admin'],
    queryFn: () =>
      apiFetcher<{
        opportunities: AdminOpportunity[]
        hrAccounts: HrAccount[]
        feeSettings: FeeSettings
        systemEnabled: boolean
        defaults: { permissions: string[]; all: string[] }
        auditLogs: AuditRow[]
      }>('/api/admin/forsah'),
    staleTime: 15_000,
    retry: 1,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['forsah-admin'] })

  const close = useMutation({
    mutationFn: (id: string) => apiPatch<{ message: string }>(`/api/opportunities/${id}`, { action: 'close' }),
    onSuccess: (res) => {
      toast.success(res.message)
      invalidate()
      setCloseTarget(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const archive = useMutation({
    mutationFn: (id: string) => apiPatch<{ message: string }>(`/api/opportunities/${id}`, { action: 'archive' }),
    onSuccess: (res) => {
      toast.success(res.message)
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const [closeTarget, setCloseTarget] = useState<AdminOpportunity | null>(null)
  // الجولة 69: الحذف النهائي للفرص المغلقة/المؤرشفة — بتأكيد كلمة مرور الإدارة
  const [deleteTarget, setDeleteTarget] = useState<AdminOpportunity | null>(null)
  const [hrDialog, setHrDialog] = useState<{ mode: 'create' } | { mode: 'edit'; account: HrAccount } | null>(null)

  // ---------- الجولة 67: الإغلاق الكلي لنظام «فرصة» ----------
  const systemEnabled = data?.systemEnabled ?? true
  const [systemDialog, setSystemDialog] = useState<null | 'close' | 'open'>(null)
  const systemToggle = useMutation({
    mutationFn: (enabled: boolean) =>
      apiPatch<{ message: string; systemEnabled: boolean }>('/api/admin/forsah', { systemEnabled: enabled }),
    onSuccess: (res) => {
      toast.success(res.message)
      setSystemDialog(null)
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="space-y-5">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-black md:text-2xl">
          <span className="flex size-9 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-violet-500 text-white shadow-md">
            <Briefcase className="size-4.5" />
          </span>
          فرصة — الموارد البشرية
        </h1>
        <p className="mt-1 text-xs font-bold text-muted-foreground">
          الإدارة العليا لمنظومة فرص العمل: حسابات الموارد البشرية، كل الفرص، إغلاق أي فرصة، الرسوم والعمولات
        </p>
      </header>

      {/* ---------- الجولة 67: حالة النظام الكلية + الإغلاق الكلي (صلاحية عليا للإدارة) ---------- */}
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl border p-4 shadow-sm',
          systemEnabled
            ? 'border-emerald-200 bg-gradient-to-l from-emerald-50/80 to-card dark:border-emerald-800'
            : 'border-rose-200 bg-gradient-to-l from-rose-50/80 to-card dark:border-rose-800'
        )}
      >
        <span
          className={cn(
            'absolute inset-y-0 start-0 w-1',
            systemEnabled ? 'bg-emerald-500' : 'bg-rose-500'
          )}
          aria-hidden
        />
        <div className="flex flex-wrap items-center justify-between gap-3 ps-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-black">
              {systemEnabled ? (
                <>
                  <span className="relative flex size-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
                  </span>
                  نظام «فرصة» يعمل الآن — ظاهر لكل المستخدمين
                </>
              ) : (
                <>
                  <Lock className="size-4 text-rose-600" />
                  نظام «فرصة» مغلق كلياً — مخفي عن الجميع وكل مساراته متوقفة
                </>
              )}
            </p>
            <p className="mt-1 text-[11px] font-bold leading-relaxed text-muted-foreground">
              {systemEnabled
                ? 'الإغلاق الكلي يوقف النظام بالكامل فوراً: يختفي من قوائم الكادر والأطباء ولوحة الموارد البشرية، وتُرفض كل المسارات — مع بقاء كل الفرص والطلبات والمقابلات والبيانات المالية محفوظة بلا أي حذف.'
                : 'لن يستطيع أحد الوصول لأي جزء من النظام حتى إعادة التشغيل — الإدارة وحدها تفتحه من هنا. جميع البيانات محفوظة كاملة.'}
            </p>
          </div>
          {systemEnabled ? (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 rounded-xl text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40"
              onClick={() => setSystemDialog('close')}
            >
              <PowerOff className="size-4" />
              إغلاق كلي لنظام فرصة
            </Button>
          ) : (
            <Button
              size="sm"
              className="shrink-0 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => setSystemDialog('open')}
            >
              <Power className="size-4" />
              إعادة تشغيل النظام
            </Button>
          )}
        </div>
      </div>

      {/* حوار تأكيد الإغلاق الكلي — بنفس صياغة تأكيد إغلاق الفرصة (المواصفة 14) */}
      <Dialog open={systemDialog !== null} onOpenChange={(o) => !o && setSystemDialog(null)}>
        <DialogContent className="rounded-3xl sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-black">
              {systemDialog === 'close'
                ? 'هل أنت متأكد من الإغلاق الكلي لنظام فرصة؟'
                : 'إعادة تشغيل نظام فرصة لكل المستخدمين؟'}
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              {systemDialog === 'close'
                ? 'سيختفي نظام «فرصة» فوراً من قوائم الكادر والأطباء ولوحة الموارد البشرية، وتتوقف كل مساراته عن العمل حصراً — وتبقى كل الفرص والطلبات والمقابلات والاختيارات والبيانات المالية وسجل التدقيق محفوظة بلا أي حذف. الإدارة وحدها تستطيع إعادة تشغيله من هنا.'
                : 'سيعود نظام «فرصة» ظاهراً لكل المستخدمين المصرح لهم فوراً، وتُستأنف كل مساراته من حيث توقفت — بلا أي فقدان في البيانات.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            {systemDialog === 'close' ? (
              <Button
                className="flex-1 rounded-xl bg-rose-600 text-white hover:bg-rose-700"
                disabled={systemToggle.isPending}
                onClick={() => systemToggle.mutate(false)}
              >
                <PowerOff className="size-4" />
                {systemToggle.isPending ? 'جارٍ الإغلاق...' : 'إغلاق النظام'}
              </Button>
            ) : (
              <Button
                className="flex-1 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={systemToggle.isPending}
                onClick={() => systemToggle.mutate(true)}
              >
                <Power className="size-4" />
                {systemToggle.isPending ? 'جارٍ التشغيل...' : 'إعادة التشغيل'}
              </Button>
            )}
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setSystemDialog(null)}>
              إلغاء
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto w-full flex-wrap">
          <TabsTrigger value="opportunities" className="gap-1 text-xs"><Briefcase className="size-3.5" />الفرص</TabsTrigger>
          <TabsTrigger value="hr" className="gap-1 text-xs"><UserCog className="size-3.5" />الموارد البشرية</TabsTrigger>
          <TabsTrigger value="fees" className="gap-1 text-xs"><BadgeCheck className="size-3.5" />الرسوم والعمولات</TabsTrigger>
          <TabsTrigger value="payments" className="gap-1 text-xs"><Banknote className="size-3.5" />تأكيدات الدفع</TabsTrigger>
          <TabsTrigger value="audit" className="gap-1 text-xs"><ScrollText className="size-3.5" />سجل التدقيق</TabsTrigger>
        </TabsList>

        {/* ---------- الفرص ---------- */}
        <TabsContent value="opportunities" className="space-y-3">
          {isLoading ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
          ) : (data?.opportunities.length ?? 0) === 0 ? (
            <EmptyBox icon={Briefcase} title="لا فرص بعد" note="أنشئ حساب موارد بشرية ليبدأ بنشر الفرص" />
          ) : (
            data!.opportunities.map((o) => (
              <article key={o.id} className="rounded-2xl border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary">فرصة {o.number}</Badge>
                      <ForsahBadge status={o.status} />
                    </div>
                    <h3 className="mt-1 truncate text-sm font-black" title={o.title}>{o.title}</h3>
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] font-bold text-muted-foreground">
                      <span className="flex items-center gap-1"><Building2 className="size-3" />{o.hospital.name}</span>
                      <span className="flex items-center gap-1"><UserCog className="size-3" />{o.createdBy.name}</span>
                      <span className="flex items-center gap-1"><Users className="size-3" />{o._count.applications} متقدم</span>
                      <span className="flex items-center gap-1"><ClipboardList className="size-3" />{o._count.selections}/{o.positionsNeeded} اختيار</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {o.status === 'CLOSED' && (
                      <Button size="sm" variant="outline" className="h-8 rounded-lg text-[11px]" disabled={archive.isPending} onClick={() => archive.mutate(o.id)}>
                        أرشفة
                      </Button>
                    )}
                    {(o.status === 'CLOSED' || o.status === 'ARCHIVED') ? (
                      // الجولة 69: الحذف النهائي — للمغلقة/المؤرشفة حصراً مع تأكيد كلمة المرور
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-lg text-[11px] text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40"
                        onClick={() => setDeleteTarget(o)}
                      >
                        <Trash2 className="size-3.5" />
                        حذف نهائي
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-lg text-[11px] text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40"
                        disabled={close.isPending}
                        onClick={() => setCloseTarget(o)}
                      >
                        <XCircle className="size-3.5" />
                        إغلاق الفرصة
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            ))
          )}
        </TabsContent>

        {/* ---------- حسابات الموارد البشرية ---------- */}
        <TabsContent value="hr" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" className="rounded-xl bg-gradient-to-l from-violet-600 to-violet-500 text-white hover:from-violet-700 hover:to-violet-600" onClick={() => setHrDialog({ mode: 'create' })}>
              <Plus className="size-4" />
              إضافة موارد بشرية
            </Button>
          </div>
          {isLoading ? (
            <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
          ) : (data?.hrAccounts.length ?? 0) === 0 ? (
            <EmptyBox icon={UserCog} title="لا حسابات موارد بشرية بعد" note="أنشئ أول حساب HR — يدخل من تسجيل الدخول الحالي دون أي نظام جديد" />
          ) : (
            data!.hrAccounts.map((h) => (
              <article key={h.id} className="rounded-2xl border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black">{h.name}</p>
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] font-bold text-muted-foreground">
                      <span dir="ltr">{h.phone}</span>
                      {h.jobTitle && <span>{h.jobTitle}</span>}
                      {h.hospitalName && <span>{h.hospitalName}</span>}
                      <span>{h._count.forsahOpportunitiesCreated} فرصة</span>
                      <span>{h.forsahPermissions.length} صلاحية</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusChip status={h.status} />
                    <Button size="sm" variant="ghost" className="h-8 rounded-lg text-[11px]" onClick={() => setHrDialog({ mode: 'edit', account: h })}>
                      <Pencil className="size-3.5" />
                      إدارة
                    </Button>
                  </div>
                </div>
              </article>
            ))
          )}
        </TabsContent>

        {/* ---------- الرسوم والعمولات ---------- */}
        <TabsContent value="fees">
          {data ? <FeesForm settings={data.feeSettings} onSaved={invalidate} /> : <Skeleton className="h-72 rounded-3xl" />}
        </TabsContent>

        {/* ---------- الجولة 71: تأكيدات دفع رسوم «فرصة» ---------- */}
        <TabsContent value="payments" className="space-y-3">
          <PaymentConfirmationsTab />
        </TabsContent>

        {/* ---------- سجل التدقيق ---------- */}
        <TabsContent value="audit" className="space-y-2">
          {isLoading ? (
            <Skeleton className="h-64 rounded-3xl" />
          ) : (data?.auditLogs.length ?? 0) === 0 ? (
            <EmptyBox icon={ScrollText} title="سجل التدقيق فارغ" note="كل عملية حساسة في «فرصة» تُسجل هنا تلقائياً" />
          ) : (
            <div className="rounded-3xl border bg-card p-4">
              <ol className="space-y-2.5">
                {data!.auditLogs.map((log) => (
                  <li key={log.id} className="flex items-start gap-2.5 text-xs">
                    <span className="mt-1 size-1.5 shrink-0 rounded-full bg-violet-500" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">
                        {log.actor?.name ?? 'النظام'}{' '}
                        <span className="text-muted-foreground">({log.actorRole})</span>{' '}
                        — {auditLabel(log.action)}
                      </p>
                      <p className="text-[10px] font-bold text-muted-foreground">
                        {log.entityType} • {formatDate(log.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* حوار تأكيد الإغلاق الإداري — المواصفة 14 حرفياً */}
      <Dialog open={!!closeTarget} onOpenChange={(o) => !o && setCloseTarget(null)}>
        <DialogContent className="rounded-3xl sm:max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-black">هل أنت متأكد من إغلاق هذه الفرصة؟</DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              «{closeTarget?.title}» — ستتوقف فوراً عن استقبال أي طلبات جديدة، تختفي من قوائم المؤهلين،
              ويُمنع أي تقديم جديد من الخادم. جميع الطلبات والمقابلات والاختيارات والبيانات المالية
              وسجل التدقيق محفوظة — لا حذف لأي بيانات.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button className="flex-1 rounded-xl bg-rose-600 text-white hover:bg-rose-700" disabled={close.isPending} onClick={() => closeTarget && close.mutate(closeTarget.id)}>
              <XCircle className="size-4" />
              إغلاق الفرصة
            </Button>
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setCloseTarget(null)}>
              إلغاء
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* الجولة 69: حوار تأكيد الحذف النهائي للفرصة — خارج حوار الإدارة — Radix portals */}
      {deleteTarget && (
        <OpportunityDeleteDialog
          opportunity={deleteTarget}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
          onSaved={invalidate}
        />
      )}

      {/* حوار إنشاء/إدارة HR */}
      {hrDialog && (
        <HrAccountDialog
          mode={hrDialog.mode}
          account={hrDialog.mode === 'edit' ? hrDialog.account : null}
          defaults={data?.defaults.permissions ?? DEFAULT_HR_PERMISSIONS}
          onOpenChange={(o) => !o && setHrDialog(null)}
          onSaved={invalidate}
        />
      )}
    </div>
  )
}

/* ================= نموذج الرسوم ================= */

interface FeeSettings {
  forsahFeeType: string
  forsahFeeValue: number
  forsahHrCommissionPercent: number
  forsahFeeMin: number
  forsahFeeMax: number
}

function FeesForm({ settings, onSaved }: { settings: FeeSettings; onSaved: () => void }) {
  const [feeType, setFeeType] = useState(settings.forsahFeeType)
  const [feeValue, setFeeValue] = useState(String(settings.forsahFeeValue))
  const [hrPercent, setHrPercent] = useState(String(settings.forsahHrCommissionPercent))
  const [feeMin, setFeeMin] = useState(String(settings.forsahFeeMin))
  const [feeMax, setFeeMax] = useState(String(settings.forsahFeeMax))

  const save = useMutation({
    mutationFn: () =>
      apiPatch<{ message: string }>('/api/admin/forsah', {
        forsahFeeType: feeType,
        forsahFeeValue: Number(feeValue),
        forsahHrCommissionPercent: Number(hrPercent),
        forsahFeeMin: Number(feeMin),
        forsahFeeMax: Number(feeMax),
      }),
    onSuccess: (res) => {
      toast.success(res.message)
      onSaved()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const exampleSalary = 300000
  const fee =
    feeType === 'PERCENTAGE'
      ? Math.round((exampleSalary * Number(feeValue || 0)) / 100)
      : Number(feeValue || 0)
  const hrFee = Math.round((fee * Number(hrPercent || 0)) / 100)

  return (
    <div className="space-y-4 rounded-3xl border bg-card p-5">
      <div>
        <h2 className="text-sm font-black">إعدادات رسوم «فرصة»</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">الإدارة وحدها تتحكم في نوع وقيمة الرسوم ونسبة HR والحدود — تسري على الاختيارات الجديدة</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs font-black">نوع الرسوم</Label>
          <Select value={feeType} onValueChange={(v) => setFeeType(v)}>
            <SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="PERCENTAGE">نسبة من الراتب</SelectItem>
              <SelectItem value="FIXED">مبلغ ثابت</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs font-black">{feeType === 'PERCENTAGE' ? 'قيمة النسبة (٪)' : 'المبلغ الثابت'}</Label>
          <Input type="number" min={0} value={feeValue} onChange={(e) => setFeeValue(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs font-black">نسبة عمولة HR (٪ من الرسوم)</Label>
          <Input type="number" min={0} max={100} value={hrPercent} onChange={(e) => setHrPercent(e.target.value)} className="mt-1" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs font-black">الحد الأدنى</Label>
            <Input type="number" min={0} value={feeMin} onChange={(e) => setFeeMin(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs font-black">الحد الأعلى</Label>
            <Input type="number" min={0} value={feeMax} onChange={(e) => setFeeMax(e.target.value)} className="mt-1" />
            <p className="mt-0.5 text-[10px] text-muted-foreground">0 = بلا حد</p>
          </div>
        </div>
      </div>
      {/* مثال حي */}
      <div className="rounded-2xl bg-muted/50 p-3 text-xs font-bold leading-relaxed">
        مثال حي — راتب 300,000: الرسوم {fee.toLocaleString('ar-YE')} — نصيب HR {hrFee.toLocaleString('ar-YE')} ({hrPercent}٪) — نصيب الإدارة {(fee - hrFee).toLocaleString('ar-YE')}
      </div>
      <Button className="rounded-xl" disabled={save.isPending} onClick={() => save.mutate()}>
        <Save className="size-4" />
        {save.isPending ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}
      </Button>
    </div>
  )
}

/* ================= حوار حساب HR ================= */

interface HrAccount {
  id: string
  name: string
  phone: string
  email: string | null
  jobTitle: string | null
  hospitalName: string | null
  status: string
  forsahPermissions: string[]
  forsahCommissionPercent: number | null
  _count: { forsahOpportunitiesCreated: number }
}

function HrAccountDialog({
  mode,
  account,
  defaults,
  onOpenChange,
  onSaved,
}: {
  mode: 'create' | 'edit'
  account: HrAccount | null
  defaults: string[]
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const [name, setName] = useState(account?.name ?? '')
  const [phone, setPhone] = useState(account?.phone ?? '')
  const [email, setEmail] = useState(account?.email ?? '')
  const [hospitalName, setHospitalName] = useState(account?.hospitalName ?? '')
  const [jobTitle, setJobTitle] = useState(account?.jobTitle ?? '')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState(account?.status ?? 'APPROVED')
  const [commission, setCommission] = useState(account?.forsahCommissionPercent != null ? String(account.forsahCommissionPercent) : '')
  const [permissions, setPermissions] = useState<string[]>(
    mode === 'create' ? [...defaults] : [...(account?.forsahPermissions ?? [])]
  )
  const [confirmDelete, setConfirmDelete] = useState(false)

  // الجولة 68: المنشأة تُختار حصراً من الجهات الصحية المسجلة — بلا أي إدخال حر
  const { data: hospitalsData } = useQuery({
    queryKey: ['admin-forsah-hospitals'],
    queryFn: () =>
      apiFetcher<{ hospitals: { id: string; name: string; type: string; city: string | null; location: string | null }[] }>('/api/hospitals'),
    staleTime: 60_000,
  })
  const hospitals = hospitalsData?.hospitals ?? []
  // حفاظ: إن كانت منشأة الحساب القائمة غير موجودة في القائمة النشطة تُضاف كخيار للحفاظ على قيمتها
  const hospitalNames = hospitals.map((h) => h.name)
  const facilityOptions =
    account?.hospitalName && !hospitalNames.includes(account.hospitalName)
      ? [account.hospitalName, ...hospitalNames]
      : hospitalNames

  const togglePermission = (key: string) => {
    setPermissions((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]))
  }

  const create = useMutation({
    mutationFn: () =>
      apiPost<{ message: string }>('/api/admin/hr', {
        name,
        phone,
        email,
        hospitalName,
        jobTitle,
        password,
        status,
        forsahPermissions: permissions,
        forsahCommissionPercent: commission === '' ? null : Number(commission),
      }),
    onSuccess: (res) => {
      toast.success(res.message)
      onOpenChange(false)
      onSaved()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const act = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPatch<{ message: string }>(`/api/admin/hr/${account!.id}`, body),
    onSuccess: (res) => {
      toast.success(res.message)
      onOpenChange(false)
      onSaved()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const canCreate =
    name.trim().split(/\s+/).length === 2 &&
    /^7\d{8}$/.test(phone) &&
    password.length >= 8 &&
    !!hospitalName.trim()

  return (
    <>
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-black">
            <UserCog className="size-4 text-violet-600" />
            {mode === 'create' ? 'إضافة موارد بشرية' : `إدارة حساب: ${account?.name}`}
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            {mode === 'create'
              ? 'الإدارة وحدها تنشئ حسابات HR — لا يوجد تسجيل ذاتي. يدخل الحساب من تسجيل الدخول الحالي.'
              : 'عدّل البيانات أو الحالة أو الصلاحيات — كل التغييرات تسري فوراً وتُسجل تدقيقاً.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {mode === 'create' ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-black">الاسم واللقب *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="سامي عبدالله" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-black">الهاتف *</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="7xxxxxxxx" dir="ltr" inputMode="tel" className="mt-1 text-start" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-black">البريد الإلكتروني</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="اختياري" dir="ltr" className="mt-1 text-start" />
                </div>
                <div>
                  <Label className="text-xs font-black">المسمى الوظيفي</Label>
                  <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="مدير التوظيف" className="mt-1" />
                </div>
              </div>
              <div>
                <Label className="text-xs font-black">المنشأة / الجهة الصحية *</Label>
                <Select value={hospitalName || undefined} onValueChange={setHospitalName}>
                  <SelectTrigger className="mt-1 w-full">
                    <SelectValue placeholder="اختر من الجهات الصحية المسجلة" />
                  </SelectTrigger>
                  <SelectContent>
                    {facilityOptions.map((n) => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {hospitals.length === 0 && (
                  <p className="mt-1 text-[10px] font-bold text-amber-600">
                    لا توجد جهات صحية نشطة بعد — أضِفها من صفحة «الجهات الصحية» وستُدرج هنا تلقائياً
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-black">كلمة المرور الأولية *</Label>
                  <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8 أحرف + أرقام" className="mt-1" dir="ltr" />
                </div>
                <div>
                  <Label className="text-xs font-black">حالة الحساب</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v)}>
                    <SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="APPROVED">معتمد (دخول فوري)</SelectItem>
                      <SelectItem value="PENDING">قيد المراجعة</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-black">المسمى الوظيفي</Label>
                  <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-black">المنشأة / الجهة الصحية</Label>
                  <Select value={hospitalName || undefined} onValueChange={setHospitalName}>
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue placeholder="اختر من الجهات الصحية" />
                    </SelectTrigger>
                    <SelectContent>
                      {facilityOptions.map((n) => (
                        <SelectItem key={n} value={n}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs font-black">كلمة مرور جديدة (لإعادة التعيين)</Label>
                <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8 أحرف + أرقام على الأقل" dir="ltr" className="mt-1" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="rounded-xl" disabled={act.isPending} onClick={() => act.mutate({ action: 'SET_STATUS', status: account?.status === 'SUSPENDED' ? 'APPROVED' : 'SUSPENDED' })}>
                  <Lock className="size-3.5" />
                  {account?.status === 'SUSPENDED' ? 'إعادة تفعيل الحساب' : 'تعطيل الحساب'}
                </Button>
                <Button size="sm" variant="outline" className="rounded-xl" disabled={act.isPending || password.length < 8} onClick={() => act.mutate({ action: 'RESET_PASSWORD', password })}>
                  <KeyRound className="size-3.5" />
                  إعادة تعيين كلمة المرور
                </Button>
                {password.length > 0 && password.length < 8 && (
                  <p className="text-[10px] font-bold text-rose-600">اكتب كلمة المرور الجديدة أعلاه — 8 أحرف على الأقل</p>
                )}
              </div>
              <div className="border-t pt-3">
                <Button size="sm" className="rounded-xl" disabled={act.isPending} onClick={() => act.mutate({ action: 'UPDATE', jobTitle, hospitalName })}>
                  <Save className="size-3.5" />
                  حفظ البيانات
                </Button>
              </div>
              {/* الجولة 68: منطقة الخطر — حذف نهائي بتأكيد كلمة مرور الإدارة */}
              <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-3 dark:border-rose-900/60 dark:bg-rose-950/30">
                <p className="flex items-center gap-1.5 text-xs font-black text-rose-700 dark:text-rose-300">
                  <Trash2 className="size-3.5" />
                  منطقة خطر — حذف نهائي
                </p>
                <p className="mt-1 text-[10px] leading-relaxed text-rose-700/80 dark:text-rose-300/80">
                  حذف الحساب لا رجعة فيه: تُسند فرصه ومقابلاته واختياراته إلى حسابك حفاظاً على السجلات،
                  وتبقى سجلات التدقيق محفوظة. يتطلب تأكيداً بكلمة مرور الإدارة.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 rounded-xl border-rose-300 text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/60"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="size-3.5" />
                  حذف الحساب نهائياً
                </Button>
              </div>
            </>
          )}

          {/* الصلاحيات — للوضعين */}
          <div className="rounded-2xl border p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-black">
              <ShieldCheck className="size-3.5 text-violet-600" />
              صلاحيات «فرصة» ({permissions.length}/{FORSAH_PERMISSIONS.length})
            </p>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {FORSAH_PERMISSIONS.map((p) => (
                <label key={p} className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-[11px] font-bold hover:bg-accent">
                  <Checkbox checked={permissions.includes(p)} onCheckedChange={() => togglePermission(p)} className="size-3.5" />
                  {PERMISSION_LABELS[p] ?? p}
                </label>
              ))}
            </div>
            {mode === 'edit' && (
              <Button size="sm" variant="outline" className="mt-2 w-full rounded-xl" disabled={act.isPending} onClick={() => act.mutate({ action: 'SET_PERMISSIONS', forsahPermissions: permissions })}>
                <Save className="size-3.5" />
                حفظ الصلاحيات
              </Button>
            )}
          </div>

          {mode === 'create' ? (
            <Button className="w-full rounded-xl bg-gradient-to-l from-violet-600 to-violet-500 text-white hover:from-violet-700 hover:to-violet-600" disabled={!canCreate || create.isPending} onClick={() => create.mutate()}>
              <Sparkles className="size-4" />
              {create.isPending ? 'جارٍ الإنشاء...' : 'إنشاء الحساب'}
            </Button>
          ) : (
            <div>
              <Label className="text-xs font-black">نسبة عمولة HR الخاصة (٪ — فراغ = الإعداد العام)</Label>
              <div className="mt-1 flex gap-2">
                <Input value={commission} onChange={(e) => setCommission(e.target.value.replace(/[^\d.]/g, ''))} placeholder="مثال: 30" inputMode="decimal" />
                <Button size="sm" className="rounded-xl" disabled={act.isPending} onClick={() => act.mutate({ action: 'UPDATE' })}>
                  حفظ
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>

    {/* حوار تأكيد الحذف — الجولة 68 (خارج حوار الإدارة — Radix portals) */}
    {confirmDelete && account && (
      <HrDeleteDialog
        account={account}
        onOpenChange={(o) => !o && setConfirmDelete(false)}
        onSaved={onSaved}
      />
    )}
    </>
  )
}

/* ================= حوار تأكيد حذف حساب HR — الجولة 68 ================= */

/* ================= حوار تأكيد حذف فرصة مغلقة/مؤرشفة — الجولة 69 ================= */

function OpportunityDeleteDialog({
  opportunity,
  onOpenChange,
  onSaved,
}: {
  opportunity: AdminOpportunity
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const [password, setPassword] = useState('')
  const del = useMutation({
    mutationFn: () =>
      apiDelete<{ message: string; counts: { applications: number; interviews: number; selections: number; transactions: number } }>(
        `/api/opportunities/${opportunity.id}`,
        { password }
      ),
    onSuccess: (res) => {
      toast.success(res.message)
      onOpenChange(false)
      onSaved()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl sm:max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-black text-rose-700 dark:text-rose-300">
            <Trash2 className="size-4" />
            حذف فرصة {opportunity.number}: {opportunity.title}
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            حذف نهائي لا رجعة فيه لفرصة مغلقة/مؤرشفة. حفاظاً على السجلات: تُخزَّن لقطة كاملة للفرصة
            وطلباتها ومقابلاتها واختياراتها وعملياتها المالية ({opportunity._count.applications} طلب،
            {' '}{opportunity._count.interviews} مقابلة، {opportunity._count.transactions} عملية مالية)
            في أرشيف الحذف قبل التنفيذ، ويبقى سجل التدقيق محفوظاً.
            أكّد الحذف بكلمة مرور حسابك الإداري.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs font-black">كلمة مرور الإدارة *</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="كلمة مرور حسابك الإداري"
              dir="ltr"
              className="mt-1"
              onKeyDown={(e) => e.key === 'Enter' && password.length > 0 && del.mutate()}
            />
          </div>
          <div className="flex gap-2">
            <Button
              className="flex-1 rounded-xl bg-rose-600 text-white hover:bg-rose-700"
              disabled={del.isPending || password.length === 0}
              onClick={() => del.mutate()}
            >
              <Trash2 className="size-4" />
              {del.isPending ? 'جارٍ الحذف...' : 'حذف نهائي'}
            </Button>
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function HrDeleteDialog({
  account,
  onOpenChange,
  onSaved,
}: {
  account: HrAccount
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const [password, setPassword] = useState('')
  const del = useMutation({
    mutationFn: () => apiDelete<{ message: string; reassigned: { opportunities: number; interviews: number; selections: number } }>(`/api/admin/hr/${account.id}`, { password }),
    onSuccess: (res) => {
      toast.success(res.message)
      onOpenChange(false)
      onSaved()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl sm:max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-black text-rose-700 dark:text-rose-300">
            <Trash2 className="size-4" />
            حذف حساب: {account.name}
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            حذف نهائي لا رجعة فيه. حفاظاً على السجلات: تُسند الفرص ودعوات المقابلة والاختيارات
            التي أنشأها إلى حسابك تلقائياً، وتبقى سجلات التدقيق محفوظة.
            أكّد الحذف بكلمة مرور حسابك الإداري.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs font-black">كلمة مرور الإدارة *</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="كلمة مرور حسابك الإداري"
              dir="ltr"
              className="mt-1"
              onKeyDown={(e) => e.key === 'Enter' && password.length > 0 && del.mutate()}
            />
          </div>
          <div className="flex gap-2">
            <Button
              className="flex-1 rounded-xl bg-rose-600 text-white hover:bg-rose-700"
              disabled={del.isPending || password.length === 0}
              onClick={() => del.mutate()}
            >
              <Trash2 className="size-4" />
              {del.isPending ? 'جارٍ الحذف...' : 'حذف نهائي'}
            </Button>
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ================= مساعدات ================= */

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    APPROVED: { label: 'معتمد', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200' },
    PENDING: { label: 'قيد المراجعة', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200' },
    SUSPENDED: { label: 'موقوف', cls: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200' },
  }
  const s = map[status] ?? { label: status, cls: 'bg-muted text-muted-foreground' }
  return <Badge variant="secondary" className={s.cls}>{s.label}</Badge>
}

function EmptyBox({ icon: Icon, title, note }: { icon: React.ComponentType<{ className?: string }>; title: string; note: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-violet-100 dark:bg-violet-950/50">
        <Icon className="size-6 text-violet-600 dark:text-violet-300" />
      </span>
      <p className="text-sm font-black">{title}</p>
      <p className="max-w-xs text-xs text-muted-foreground">{note}</p>
    </div>
  )
}

const AUDIT_LABELS: Record<string, string> = {
  OPPORTUNITY_CREATED: 'أنشأ فرصة',
  OPPORTUNITY_UPDATED: 'عدّل فرصة',
  OPPORTUNITY_PUBLISHED: 'نشر فرصة',
  OPPORTUNITY_PAUSED: 'أوقف فرصة',
  OPPORTUNITY_RESUMED: 'استأنف فرصة',
  OPPORTUNITY_CLOSED_BY_HR: 'أغلق فرصة',
  OPPORTUNITY_CLOSED_BY_ADMIN: 'أغلق الإدارة فرصة',
  OPPORTUNITY_ARCHIVED: 'أرشف فرصة',
  OPPORTUNITY_DELETED: 'حذف فرصة نهائياً (لقطة محفوظة)',
  APPLICANT_PROFILE_VIEWED: 'شاهد ملف متقدم',
  APPLICANT_DOCUMENTS_VIEWED: 'شاهد مستندات متقدم',
  APPLICANT_CONTACT_VIEWED: 'شاهد تواصل متقدم',
  APPLICATION_SUBMITTED: 'قدّم على فرصة',
  APPLICATION_REVIEWED: 'راجع تقديم',
  APPLICATION_REJECTED: 'رفض تقديم',
  APPLICATION_WITHDRAWN: 'انسحب تقديم',
  INTERVIEW_INVITED: 'أرسل دعوة مقابلة',
  INTERVIEW_RESPONDED: 'رد على دعوة مقابلة',
  CANDIDATE_SELECTED: 'اختار مرشحاً',
  TRANSACTION_CREATED: 'أُنشئت عملية مالية',
  TRANSACTION_UPDATED: 'عُدّلت عملية مالية',
  PAYMENT_TIMING_SELECTED: 'اختار المرشح توقيت سداد الرسوم',
  PAYMENT_PROOF_SUBMITTED: 'رفع المرشح إثبات دفع الرسوم',
  PAYMENT_CONFIRMED: 'أكدت الإدارة وصول دفعة الرسوم',
  PAYMENT_PROOF_REJECTED: 'رفضت الإدارة إثبات دفع الرسوم',
  FEE_SETTINGS_CHANGED: 'غيّر رسوم الفرصة',
  HR_CREATED: 'أنشأ حساب HR',
  HR_UPDATED: 'عدّل حساب HR',
  HR_DISABLED: 'عطّل حساب HR',
  HR_ENABLED: 'فعّل حساب HR',
  HR_PASSWORD_RESET: 'أعاد تعيين كلمة مرور HR',
  HR_DELETED: 'حذف حساب HR نهائياً',
  HR_PERMISSIONS_CHANGED: 'غيّر صلاحيات HR',
}

function auditLabel(action: string): string {
  return AUDIT_LABELS[action] ?? action
}

/* أنواع داخلية */

interface AdminOpportunity {
  id: string
  number: number
  title: string
  status: string
  positionsNeeded: number
  hospital: { name: string }
  createdBy: { id: string; name: string; jobTitle: string | null }
  _count: { applications: number; selections: number; interviews: number; transactions: number }
}

interface AuditRow {
  id: string
  action: string
  actorRole: string
  entityType: string
  createdAt: string
  actor: { name: string } | null
}

/* ---------------- الجولة 71: تأكيدات دفع رسوم «فرصة» ---------------- */

interface PaymentConfirmationItem {
  id: string
  opportunity: { id: string; title: string; number: number }
  feeAmount: number
  currency: string
  status: string
  statusLabel: string
  paymentTimingLabel: string | null
  paymentProofUrl: string | null
  paymentProofFileName: string | null
  paymentProofUploadedAt: string | null
  candidate: { id: string; name: string; phone: string } | null
}

function PaymentConfirmationsTab() {
  const queryClient = useQueryClient()
  const [viewProof, setViewProof] = useState<ViewableDocument | null>(null)
  const [confirmItem, setConfirmItem] = useState<PaymentConfirmationItem | null>(null)
  const [rejectItem, setRejectItem] = useState<PaymentConfirmationItem | null>(null)
  const [rejectNote, setRejectNote] = useState('')

  const list = useQuery({
    queryKey: ['forsah-payment-confirmations'],
    queryFn: () =>
      apiFetcher<{ items: PaymentConfirmationItem[]; total: number }>(
        '/api/forsah/payment-confirmations'
      ),
    refetchInterval: 60_000,
    staleTime: 15_000,
    retry: 1,
  })

  const decide = useMutation({
    mutationFn: ({
      transactionId,
      action,
      note,
    }: {
      transactionId: string
      action: 'CONFIRM' | 'REJECT'
      note?: string
    }) => apiPatch<{ message: string }>('/api/forsah/payment-confirmations', { transactionId, action, note }),
    onSuccess: (res) => {
      toast.success(res.message)
      setConfirmItem(null)
      setRejectItem(null)
      setRejectNote('')
      queryClient.invalidateQueries({ queryKey: ['forsah-payment-confirmations'] })
      queryClient.invalidateQueries({ queryKey: ['forsah-admin'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const items = list.data?.items ?? []

  if (list.isLoading) {
    return <Skeleton className="h-64 rounded-3xl" />
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed bg-card/60 px-6 py-14 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-950/50">
          <Banknote className="size-7 text-emerald-600 dark:text-emerald-300" />
        </span>
        <p className="text-sm font-black">لا توجد إثباتات بانتظار التأكيد</p>
        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
          عند رفع أي مرشح إثبات دفع رسوم «فرصة» يظهر هنا فوراً — راجع الصورة وأكد وصول
          الدفعة ليرفع عنه المرشح بطاقة السداد الإلزامية، أو ارفضه بسبب معلن لإتاحة إعادة الرفع.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="rounded-2xl bg-muted/60 px-4 py-2.5 text-xs font-bold text-muted-foreground">
        الإثباتات المرفوعة من المرشحين المختارين — «تأكيد الدفعة» يسدد العملية ويرفع بطاقة
        السداد الحاجبة عن المرشح فوراً، و«رفض الإثبات» يمسح الصورة ويترك البوابة مفعلة بإتاحة إعادة الرفع.
      </p>
      {items.map((item) => (
        <div key={item.id} className="rounded-3xl border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-black">
                #{item.opportunity.number} — {item.opportunity.title}
              </p>
              <p className="mt-0.5 text-xs font-bold text-muted-foreground">
                المرشح: {item.candidate?.name ?? '—'}
                {item.candidate?.phone ? ` — ${item.candidate.phone}` : ''}
              </p>
              <p className="mt-0.5 text-xs font-bold text-muted-foreground">
                المبلغ:{' '}
                <span className="font-black text-foreground" dir="ltr">
                  {item.feeAmount.toLocaleString('ar-YE')} {item.currency}
                </span>
                {item.paymentTimingLabel ? ` — التوقيت: ${item.paymentTimingLabel}` : ''}
              </p>
              {item.paymentProofUploadedAt && (
                <p className="mt-0.5 text-[10px] font-bold text-muted-foreground">
                  رُفع الإثبات: {formatDate(item.paymentProofUploadedAt)}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setViewProof({
                    fileUrl: item.paymentProofUrl!,
                    fileName: item.paymentProofFileName ?? 'إثبات الدفع',
                    title: `إثبات دفع — ${item.opportunity.title}`,
                    mimeType: 'image/*',
                  })
                }
                className="flex items-center gap-2 rounded-xl border p-1.5 transition-colors hover:bg-accent"
                title="عرض صورة الإثبات بالتكبير"
              >
                <img
                  src={item.paymentProofUrl!}
                  alt="إثبات الدفع"
                  className="size-14 rounded-lg border object-cover"
                />
              </button>
              <div className="flex flex-col gap-1.5">
                <Button
                  size="sm"
                  className="gap-1 rounded-xl bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                  disabled={decide.isPending}
                  onClick={() => setConfirmItem(item)}
                >
                  <ShieldCheck className="size-3.5" />
                  تأكيد الدفعة
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 rounded-xl border-red-300 text-xs text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                  disabled={decide.isPending}
                  onClick={() => {
                    setRejectNote('')
                    setRejectItem(item)
                  }}
                >
                  <XCircle className="size-3.5" />
                  رفض الإثبات
                </Button>
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* عارض صورة الإثبات */}
      <DocumentViewer
        document={viewProof}
        open={!!viewProof}
        onOpenChange={(open) => !open && setViewProof(null)}
      />

      {/* حوار تأكيد الدفعة */}
      <Dialog open={!!confirmItem} onOpenChange={(open) => !open && setConfirmItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تأكيد وصول دفعة رسوم الخدمة</DialogTitle>
            <DialogDescription>
              {confirmItem && (
                <>
                  تأكيد استلام{' '}
                  <span className="font-black" dir="ltr">
                    {confirmItem.feeAmount.toLocaleString('ar-YE')} {confirmItem.currency}
                  </span>{' '}
                  من المرشح «{confirmItem.candidate?.name ?? '—'}» لفرصة «{confirmItem.opportunity.title}».
                  <br />
                  تُسوّى العملية («مسددة») ويُشعر المرشح ويرتفع عنه قفل السداد فوراً.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button
              className="flex-1 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={decide.isPending}
              onClick={() =>
                confirmItem && decide.mutate({ transactionId: confirmItem.id, action: 'CONFIRM' })
              }
            >
              <ShieldCheck className="size-4" />
              {decide.isPending ? 'جارٍ التأكيد...' : 'تأكيد الاستلام'}
            </Button>
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setConfirmItem(null)}>
              إلغاء
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* حوار رفض الإثبات — السبب إلزامي ويظهر للمرشح */}
      <Dialog open={!!rejectItem} onOpenChange={(open) => !open && setRejectItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>رفض إثبات الدفع</DialogTitle>
            <DialogDescription>
              {rejectItem && (
                <>
                  رفض إثبات المرشح «{rejectItem.candidate?.name ?? '—'}» لفرصة «{rejectItem.opportunity.title}».
                  <br />
                  اذكر السبب بوضوح — يظهر للمرشح ويتيح له إعادة الرفع، وتبقى بطاقة السداد الإلزامية مفعلة عنده.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-note">سبب الرفض (إلزامي)</Label>
            <Input
              id="reject-note"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="مثال: الصورة غير واضحة / المبلغ غير مطابق / الحوالة غير واصلة"
              maxLength={300}
            />
          </div>
          <div className="flex gap-2">
            <Button
              className="flex-1 rounded-xl bg-red-600 text-white hover:bg-red-700"
              disabled={decide.isPending || !rejectNote.trim()}
              onClick={() =>
                rejectItem && decide.mutate({ transactionId: rejectItem.id, action: 'REJECT', note: rejectNote.trim() })
              }
            >
              <XCircle className="size-4" />
              {decide.isPending ? 'جارٍ الرفض...' : 'رفض الإثبات'}
            </Button>
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setRejectItem(null)}>
              إلغاء
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
