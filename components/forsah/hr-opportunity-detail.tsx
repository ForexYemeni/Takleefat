'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  CalendarClock,
  Coins,
  Eye,
  FileCheck2,
  KeyRound,
  MapPin,
  PauseCircle,
  PlayCircle,
  Send,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetcher, apiPatch, apiPost } from '@/lib/api-client'
import { formatDate } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ForsahBadge, formatSalary, TRANSACTION_STATUS_AR } from '@/components/forsah/opportunity-visuals'

/**
 * إدارة فرصة واحدة — الجولة 66 | ميزة «فرصة»
 * تبويبات: المتقدمون (مراجعة/دعوة مقابلة/اختيار) | المقابلات | المختارون | المالية.
 * كل الأفعال تمر عبر مسارات الخادم المحمية — الإغلاق بصلاحية صريحة فقط.
 */

interface ApplicationRow {
  id: string
  status: string
  coverNote: string | null
  createdAt: string
  selected: boolean
  interview: { id: string; response: string; scheduledDate: string; scheduledTime: string } | null
  candidate: {
    id: string
    name: string
    photoUrl: string | null
    gender: string | null
    qualification: string | null
    yearsOfExperience: number | null
    accountStatus: string
    workTags: string[]
    avgRating: number | null
    phoneMasked: string
    phoneRevealed: boolean
  }
}

interface InterviewsPayload {
  interviews: Array<{
    id: string
    candidate: { id: string; name: string; photoUrl: string | null }
    scheduledDate: string
    scheduledTime: string
    mode: string
    location: string | null
    address: string | null
    mapUrl: string | null
    notes: string | null
    response: string
    respondedAt: string | null
  }>
}

interface SelectionsPayload {
  selections: Array<{
    id: string
    candidate: { id: string; name: string; phone: string; phoneMasked: string; photoUrl: string | null }
    note: string | null
    createdAt: string
    transaction: { id: string; status: string; feeAmount: number; hrCommissionAmount: number; adminAmount: number; currency: string } | null
  }>
  positionsNeeded: number
}

interface TxPayload {
  transactions: Array<{
    id: string
    baseAmount: number
    currency: string
    feeType: string
    feePercent: number | null
    feeAmount: number
    hrCommissionPercent: number
    hrCommissionAmount: number
    adminAmount: number
    status: string
    createdAt: string
  }>
}

const MODE_AR: Record<string, string> = { ONSITE: 'حضورية', ONLINE: 'عن بُعد' }
const RESPONSE_AR: Record<string, string> = { PENDING: 'بانتظار الرد', CONFIRMED: 'أكّد الحضور', DECLINED: 'اعتذر' }

export function HrOpportunityDetail({ id }: { id: string }) {
  const [tab, setTab] = useState('applicants')
  const queryClient = useQueryClient()

  const detail = useQuery({
    queryKey: ['forsah-detail-manager', id],
    queryFn: () => apiFetcher<{ opportunity: { id: string; number: number; title: string; status: string; audience: string; salaryAmount: number | null; salaryType: string; salaryCurrency: string; positionsNeeded: number; hospital: { name: string } } }>('/api/opportunities/' + id),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['forsah-detail-manager', id] })
    queryClient.invalidateQueries({ queryKey: ['forsah-dashboard'] })
    queryClient.invalidateQueries({ queryKey: ['forsah-opportunities'] })
  }

  const transition = useMutation({
    mutationFn: (action: string) => apiPatch<{ message: string }>(`/api/opportunities/${id}`, { action }),
    onSuccess: (res) => {
      toast.success(res.message)
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const o = detail.data?.opportunity

  return (
    <div className="space-y-5">
      <Button size="sm" variant="ghost" className="rounded-xl" asChild>
        <Link href="/hr/opportunities">
          <ArrowRight className="size-4" />
          كل الفرص
        </Link>
      </Button>

      {detail.isLoading || !o ? (
        <div className="space-y-3">
          <Skeleton className="h-28 rounded-3xl" />
          <Skeleton className="h-64 rounded-3xl" />
        </div>
      ) : (
        <>
          {/* ترويسة الفرصة + إجراءات الحالة */}
          <header className="relative overflow-hidden rounded-3xl border bg-card p-5 shadow-sm">
            <span className={`absolute inset-x-0 top-0 h-1 ${o.status === 'PUBLISHED' ? 'bg-emerald-500' : o.status === 'DRAFT' ? 'bg-slate-400' : o.status === 'PAUSED' ? 'bg-amber-500' : 'bg-rose-500'}`} aria-hidden />
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary">فرصة رقم {o.number}</Badge>
                  <ForsahBadge status={o.status} />
                </div>
                <h1 className="mt-1.5 text-lg font-black">{o.title}</h1>
                <p className="mt-0.5 flex items-center gap-1 text-xs font-bold text-muted-foreground">
                  <MapPin className="size-3" />
                  {o.hospital.name} — {formatSalary(o.salaryAmount, o.salaryType, o.salaryCurrency).main}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {o.status === 'DRAFT' && (
                  <Button size="sm" className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700" disabled={transition.isPending} onClick={() => transition.mutate('publish')}>
                    <Send className="size-4" /> نشر
                  </Button>
                )}
                {(o.status === 'PUBLISHED' || o.status === 'ACTIVE') && (
                  <Button size="sm" variant="outline" className="rounded-xl" disabled={transition.isPending} onClick={() => transition.mutate('pause')}>
                    <PauseCircle className="size-4" /> إيقاف مؤقت
                  </Button>
                )}
                {o.status === 'PAUSED' && (
                  <Button size="sm" variant="outline" className="rounded-xl" disabled={transition.isPending} onClick={() => transition.mutate('resume')}>
                    <PlayCircle className="size-4" /> استئناف
                  </Button>
                )}
              </div>
            </div>
          </header>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex h-auto w-full flex-wrap">
              <TabsTrigger value="applicants" className="gap-1 text-xs"><Users className="size-3.5" />المتقدمون</TabsTrigger>
              <TabsTrigger value="interviews" className="gap-1 text-xs"><CalendarClock className="size-3.5" />المقابلات</TabsTrigger>
              <TabsTrigger value="selections" className="gap-1 text-xs"><UserCheck className="size-3.5" />المختارون</TabsTrigger>
              <TabsTrigger value="finance" className="gap-1 text-xs"><Coins className="size-3.5" />المالية</TabsTrigger>
            </TabsList>

            <TabsContent value="applicants">
              <ApplicantsTab opportunityId={id} onInvalidate={invalidate} />
            </TabsContent>
            <TabsContent value="interviews">
              <InterviewsTab opportunityId={id} />
            </TabsContent>
            <TabsContent value="selections">
              <SelectionsTab opportunityId={id} />
            </TabsContent>
            <TabsContent value="finance">
              <FinanceTab opportunityId={id} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}

/* ================= تبويب المتقدمين ================= */

function ApplicantsTab({ opportunityId, onInvalidate }: { opportunityId: string; onInvalidate: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [inviteOpen, setInviteOpen] = useState(false)
  const [selectOpen, setSelectOpen] = useState(false)
  const [q, setQ] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['forsah-applicants', opportunityId, q],
    queryFn: () =>
      apiFetcher<{
        applications: ApplicationRow[]
        total: number
        selectedCount: number
        opportunity: { positionsNeeded: number; title: string }
      }>(`/api/opportunities/${opportunityId}/applications?take=50${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  })

  const review = useMutation({
    mutationFn: ({ applicationId, status }: { applicationId: string; status: 'REVIEWED' | 'REJECTED' }) =>
      apiPatch<{ message: string }>(`/api/opportunities/applications/${applicationId}`, { status }),
    onSuccess: (res) => {
      toast.success(res.message)
      onInvalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectable = (data?.applications ?? []).filter(
    (a) => !a.selected && !['SELECTED', 'REJECTED', 'WITHDRAWN'].includes(a.status)
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث باسم المتقدم أو المؤهل..." className="h-10 max-w-xs rounded-xl" />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="rounded-xl" disabled={selected.size === 0} onClick={() => setInviteOpen(true)}>
            <CalendarClock className="size-4" />
            دعوة مقابلة ({selected.size})
          </Button>
          <Button
            size="sm"
            className="rounded-xl bg-gradient-to-l from-violet-600 to-violet-500 text-white hover:from-violet-700 hover:to-violet-600"
            disabled={selected.size === 0}
            onClick={() => setSelectOpen(true)}
          >
            <UserCheck className="size-4" />
            اختيار موظف ({selected.size})
          </Button>
        </div>
      </div>

      {data && (
        <p className="text-[11px] font-bold text-muted-foreground">
          المختارون: {data.selectedCount} من {data.opportunity.positionsNeeded} المطلوبين
          {data.selectedCount >= data.opportunity.positionsNeeded && ' — اكتمل العدد'}
        </p>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
      ) : (data?.applications.length ?? 0) === 0 ? (
        <EmptyMini icon={Users} title="لا متقدمين بعد" note="سيظهر المتقدمون هنا فور وصول تقديماتهم" />
      ) : (
        <div className="space-y-2">
          {data!.applications.map((a) => (
            <article key={a.id} className="rounded-2xl border bg-card p-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={selected.has(a.id)}
                  onCheckedChange={() => toggle(a.id)}
                  disabled={a.selected || ['SELECTED', 'REJECTED', 'WITHDRAWN'].includes(a.status)}
                  className="mt-1"
                  aria-label={`اختيار ${a.candidate.name}`}
                />
                {a.candidate.photoUrl ? (
                  <img src={a.candidate.photoUrl} alt={a.candidate.name} className="size-10 shrink-0 rounded-xl object-cover" />
                ) : (
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-sm font-black text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
                    {a.candidate.name.slice(0, 1)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-black">{a.candidate.name}</p>
                    <ForsahBadge status={a.status} kind="application" />
                    {a.selected && <Badge className="bg-emerald-600 text-white">مختار</Badge>}
                  </div>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] font-bold text-muted-foreground">
                    {a.candidate.qualification && <span>{a.candidate.qualification}</span>}
                    {a.candidate.yearsOfExperience != null && <span>{a.candidate.yearsOfExperience} سنوات خبرة</span>}
                    {a.candidate.avgRating != null && <span>تقييم {a.candidate.avgRating}★</span>}
                    <span dir="ltr" className={a.candidate.phoneRevealed ? '' : 'tracking-wider'}>
                      {a.candidate.phoneMasked}
                    </span>
                  </p>
                  {a.candidate.workTags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {a.candidate.workTags.slice(0, 4).map((t) => (
                        <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                      ))}
                    </div>
                  )}
                  {a.coverNote && (
                    <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground" style={{ overflowWrap: 'anywhere' }}>{a.coverNote}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {['PENDING', 'REVIEWED'].includes(a.status) && (
                      <>
                        <Button size="sm" variant="outline" className="h-7 rounded-lg px-2 text-[11px]" disabled={review.isPending} onClick={() => review.mutate({ applicationId: a.id, status: 'REVIEWED' })}>
                          <FileCheck2 className="size-3" /> تمت المراجعة
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 rounded-lg px-2 text-[11px] text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40" disabled={review.isPending} onClick={() => review.mutate({ applicationId: a.id, status: 'REJECTED' })}>
                          <XCircle className="size-3" /> رفض
                        </Button>
                      </>
                    )}
                    {a.interview && (
                      <Badge variant="secondary" className="text-[10px]">
                        <CalendarClock className="size-3" />
                        {formatDate(a.interview.scheduledDate)} {a.interview.scheduledTime} — {RESPONSE_AR[a.interview.response]}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* حوار دعوة المقابلة */}
      <InterviewInviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        opportunityId={opportunityId}
        applicationIds={Array.from(selected)}
        onDone={() => {
          setSelected(new Set())
          onInvalidate()
        }}
      />

      {/* حوار تأكيد الاختيار */}
      <SelectConfirmDialog
        open={selectOpen}
        onOpenChange={setSelectOpen}
        opportunityId={opportunityId}
        applicationIds={Array.from(selected)}
        count={data?.opportunity.positionsNeeded ?? 0}
        selectedCount={data?.selectedCount ?? 0}
        onDone={() => {
          setSelected(new Set())
          onInvalidate()
        }}
      />
    </div>
  )
}

/* ================= حوار دعوة المقابلة ================= */

function InterviewInviteDialog({
  open,
  onOpenChange,
  opportunityId,
  applicationIds,
  onDone,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  opportunityId: string
  applicationIds: string[]
  onDone: () => void
}) {
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [mode, setMode] = useState<'ONSITE' | 'ONLINE'>('ONSITE')
  const [location, setLocation] = useState('')
  const [address, setAddress] = useState('')
  const [mapUrl, setMapUrl] = useState('')
  const [notes, setNotes] = useState('')

  const send = useMutation({
    mutationFn: () =>
      apiPost<{ message: string }>(`/api/opportunities/${opportunityId}/interviews`, {
        applicationIds,
        scheduledDate,
        scheduledTime,
        mode,
        location,
        address,
        mapUrl,
        notes,
      }),
    onSuccess: (res) => {
      toast.success(res.message)
      onOpenChange(false)
      setScheduledDate('')
      setScheduledTime('')
      setLocation('')
      setAddress('')
      setMapUrl('')
      setNotes('')
      onDone()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto rounded-3xl sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-base font-black">إرسال دعوات المقابلة ({applicationIds.length} متقدم)</DialogTitle>
          <DialogDescription className="text-xs">يصل المتقدم إشعاراً بالتفاصيل مع زرّي تأكيد الحضور وعدم الحضور</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-black">التاريخ *</Label>
              <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} className="mt-1 rounded-xl" />
            </div>
            <div>
              <Label className="text-xs font-black">الوقت *</Label>
              <Input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} className="mt-1 rounded-xl" />
            </div>
          </div>
          <div>
            <Label className="text-xs font-black">نمط المقابلة *</Label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {(['ONSITE', 'ONLINE'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`rounded-xl border px-3 py-2 text-xs font-black transition-colors ${mode === m ? 'border-violet-400 bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200' : 'text-muted-foreground hover:bg-accent'}`}
                >
                  {MODE_AR[m]}
                </button>
              ))}
            </div>
          </div>
          {mode === 'ONSITE' && (
            <>
              <div>
                <Label className="text-xs font-black">مكان المقابلة *</Label>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="مثال: مبنى الإدارة — الطابق الثاني" className="mt-1 rounded-xl" />
              </div>
              <div>
                <Label className="text-xs font-black">العنوان</Label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="العنوان التفصيلي" className="mt-1 rounded-xl" />
              </div>
              <div>
                <Label className="text-xs font-black">رابط الخريطة</Label>
                <Input value={mapUrl} onChange={(e) => setMapUrl(e.target.value)} placeholder="https://maps.google.com/..." className="mt-1 rounded-xl" dir="ltr" />
              </div>
            </>
          )}
          <div>
            <Label className="text-xs font-black">ملاحظات</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="أي تعليمات للمرشحين..." className="mt-1 rounded-xl" />
          </div>
          <Button
            className="w-full rounded-xl bg-gradient-to-l from-violet-600 to-violet-500 text-white hover:from-violet-700 hover:to-violet-600"
            disabled={send.isPending || !scheduledDate || !scheduledTime || (mode === 'ONSITE' && !location.trim())}
            onClick={() => send.mutate()}
          >
            <Send className="size-4" />
            {send.isPending ? 'جارٍ الإرسال...' : `إرسال ${applicationIds.length} دعوة`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ================= حوار تأكيد الاختيار ================= */

function SelectConfirmDialog({
  open,
  onOpenChange,
  opportunityId,
  applicationIds,
  count,
  selectedCount,
  onDone,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  opportunityId: string
  applicationIds: string[]
  count: number
  selectedCount: number
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const select = useMutation({
    mutationFn: () => apiPost<{ message: string }>(`/api/opportunities/${opportunityId}/selections`, { applicationIds }),
    onSuccess: (res) => {
      toast.success(res.message)
      onOpenChange(false)
      queryClient.invalidateQueries({ queryKey: ['forsah-detail-manager', opportunityId] })
      onDone()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const remaining = Math.max(0, count - selectedCount)
  const overflow = applicationIds.length > remaining

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl sm:max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-base font-black">اختيار {applicationIds.length} موظفاً</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            سيصل المختارون إشعار «تم اختيارك للفرصة» ويُفتح لهم رقم تواصلك. تبقى{' '}
            <strong>{remaining}</strong> من أصل {count} مقعداً.
            {overflow && ' — تحذير: عدد المختارين المطلوب يتجاوز المقاعد المتبقية وسيُرفض من الخادم.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Button
            className="flex-1 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={select.isPending || overflow || remaining === 0}
            onClick={() => select.mutate()}
          >
            <UserCheck className="size-4" />
            تأكيد الاختيار
          </Button>
          <Button variant="outline" className="flex-1 rounded-xl" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ================= تبويب المقابلات ================= */

function InterviewsTab({ opportunityId }: { opportunityId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['forsah-interviews', opportunityId],
    queryFn: () => apiFetcher<InterviewsPayload>(`/api/opportunities/${opportunityId}/interviews`),
  })

  if (isLoading) return <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
  if ((data?.interviews.length ?? 0) === 0)
    return <EmptyMini icon={CalendarClock} title="لا مقابلات بعد" note="رشّح المتقدمين للمقابلة من تبويب المتقدمين" />

  return (
    <div className="space-y-2">
      {data!.interviews.map((i) => (
        <article key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-card p-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-black">{i.candidate.name}</p>
            <p className="mt-0.5 text-[11px] font-bold text-muted-foreground">
              {formatDate(i.scheduledDate)} — الساعة {i.scheduledTime} ({MODE_AR[i.mode]})
              {i.location ? ` — ${i.location}` : ''}
            </p>
          </div>
          <Badge
            variant="secondary"
            className={
              i.response === 'CONFIRMED'
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                : i.response === 'DECLINED'
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200'
            }
          >
            {RESPONSE_AR[i.response]}
          </Badge>
        </article>
      ))}
    </div>
  )
}

/* ================= تبويب المختارين ================= */

function SelectionsTab({ opportunityId }: { opportunityId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['forsah-selections', opportunityId],
    queryFn: () => apiFetcher<SelectionsPayload>(`/api/opportunities/${opportunityId}/selections`),
  })

  if (isLoading) return <Skeleton className="h-40 rounded-2xl" />
  if ((data?.selections.length ?? 0) === 0)
    return <EmptyMini icon={UserCheck} title="لا موظفين مختارين بعد" note="اختر الموظفين من تبويب المتقدمين بعد المقابلات" />

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold text-muted-foreground">
        {data!.selections.length} من {data!.positionsNeeded} مقعداً اكتمل
      </p>
      {data!.selections.map((s) => (
        <article key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-card p-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-black">{s.candidate.name}</p>
            <p className="mt-0.5 text-[11px] font-bold text-muted-foreground">
              اختير بتاريخ {formatDate(s.createdAt)} — <span dir="ltr">{s.candidate.phone ?? s.candidate.phoneMasked}</span>
            </p>
          </div>
          {s.transaction && (
            <div className="text-end">
              <Badge variant="secondary">{TRANSACTION_STATUS_AR[s.transaction.status]}</Badge>
              <p className="mt-1 text-[10px] font-bold text-muted-foreground">
                رسوم: {s.transaction.feeAmount.toLocaleString('ar-YE')} — نصيبك: {s.transaction.hrCommissionAmount.toLocaleString('ar-YE')}
              </p>
            </div>
          )}
        </article>
      ))}
    </div>
  )
}

/* ================= تبويب المالية ================= */

function FinanceTab({ opportunityId }: { opportunityId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['forsah-tx', opportunityId],
    queryFn: () => apiFetcher<TxPayload>(`/api/opportunities/${opportunityId}/transaction`),
  })

  if (isLoading) return <Skeleton className="h-40 rounded-2xl" />
  if ((data?.transactions.length ?? 0) === 0)
    return (
      <EmptyMini
        icon={Coins}
        title="لا عمليات مالية بعد"
        note="تُنشأ العملية المالية تلقائياً عند اختيار كل موظف — محسوبة من إعدادات الإدارة"
      />
    )

  return (
    <div className="space-y-2">
      {data!.transactions.map((t) => (
        <article key={t.id} className="rounded-2xl border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ForsahBadge status={t.status} kind="transaction" />
            <p className="text-[10px] font-bold text-muted-foreground">{formatDate(t.createdAt)}</p>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-muted/50 p-2">
              <p className="text-[10px] font-bold text-muted-foreground">إجمالي الرسوم</p>
              <p className="text-sm font-black">{t.feeAmount.toLocaleString('ar-YE')}</p>
            </div>
            <div className="rounded-xl bg-emerald-500/10 p-2">
              <p className="text-[10px] font-bold text-muted-foreground">مستحق HR</p>
              <p className="text-sm font-black text-emerald-700 dark:text-emerald-300">{t.hrCommissionAmount.toLocaleString('ar-YE')}</p>
            </div>
            <div className="rounded-xl bg-sky-500/10 p-2">
              <p className="text-[10px] font-bold text-muted-foreground">مستحق الإدارة</p>
              <p className="text-sm font-black text-sky-700 dark:text-sky-300">{t.adminAmount.toLocaleString('ar-YE')}</p>
            </div>
          </div>
          <p className="mt-1.5 text-center text-[10px] font-bold text-muted-foreground">
            الراتب المرجعي {t.baseAmount.toLocaleString('ar-YE')}
            {t.feePercent != null ? ` — ${t.feePercent}٪ رسوم` : ' — مبلغ ثابت'} — عمولة HR {t.hrCommissionPercent}٪
          </p>
        </article>
      ))}
    </div>
  )
}

function EmptyMini({ icon: Icon, title, note }: { icon: React.ComponentType<{ className?: string }>; title: string; note: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed px-6 py-10 text-center">
      <span className="flex size-11 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-950/50">
        <Icon className="size-5 text-violet-600 dark:text-violet-300" />
      </span>
      <p className="text-sm font-black">{title}</p>
      <p className="max-w-xs text-xs text-muted-foreground">{note}</p>
    </div>
  )
}
