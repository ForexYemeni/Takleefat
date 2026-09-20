'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Briefcase,
  Building2,
  CalendarClock,
  ChevronLeft,
  ClipboardList,
  Coins,
  Eye,
  MapPin,
  PauseCircle,
  Pencil,
  PlayCircle,
  Search,
  Send,
  Sparkles,
  Users,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetcher, apiPatch, apiPost } from '@/lib/api-client'
import { formatDate } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { OpportunityWizard } from '@/components/forsah/opportunity-wizard'
import { ForsahBadge, formatSalary, InfoChip } from '@/components/forsah/opportunity-visuals'

/**
 * إدارة فرص HR — الجولة 66 | ميزة «فرصة»
 * قائمة فرصه حصراً + Wizard إنشاء/تعديل + تحولات الحالة (نشر/إيقاف/استئناف)
 * + إغلاق الفرصة بصلاحيته إن مُنحت — والتفاصيل في صفحة مستقلة.
 */

interface HrOpportunity {
  id: string
  number: number
  title: string
  status: string
  audience: string
  salaryAmount: number | null
  salaryType: string
  salaryCurrency: string
  positionsNeeded: number
  createdAt: string
  publishedAt: string | null
  hospital: { name: string }
  specialty: { name: string } | null
  department: { name: string } | null
  _count: { applications: number; selections: number; interviews: number }
}

export function HrOpportunitiesManager() {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('ALL')
  // الفتح التلقائي من الزر المركزي (?new=1) — تهيئة أولية بلا أي setState داخل effect
  const searchParams = useSearchParams()
  const [wizardOpen, setWizardOpen] = useState(() => searchParams.get('new') === '1')
  const [editData, setEditData] = useState<Record<string, unknown> | null>(null)
  const [editFetching, setEditFetching] = useState(false)
  const [closeTarget, setCloseTarget] = useState<HrOpportunity | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['forsah-opportunities', q, status],
    queryFn: () =>
      apiFetcher<{ opportunities: HrOpportunity[]; total: number }>(
        `/api/opportunities?take=50${q ? `&q=${encodeURIComponent(q)}` : ''}${status !== 'ALL' ? `&status=${status}` : ''}`
      ),
  })

  const transition = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      apiPatch<{ message: string }>(`/api/opportunities/${id}`, { action }),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['forsah-opportunities'] })
      queryClient.invalidateQueries({ queryKey: ['forsah-dashboard'] })
      setCloseTarget(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const rows = data?.opportunities ?? []
  const counts = useMemo(
    () => ({
      ALL: undefined,
      DRAFT: rows.filter((o) => o.status === 'DRAFT').length,
      PUBLISHED: rows.filter((o) => o.status === 'PUBLISHED').length,
      PAUSED: rows.filter((o) => o.status === 'PAUSED').length,
      CLOSED: rows.filter((o) => o.status === 'CLOSED').length,
    }),
    [rows]
  )

  return (
    <div className="space-y-5">
      {/* الترويسة */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-black md:text-2xl">
            <span className="flex size-9 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-violet-500 text-white shadow-md">
              <Briefcase className="size-4.5" />
            </span>
            فرصي
          </h1>
          <p className="mt-1 text-xs font-bold text-muted-foreground">
            أنشئ الفرص وانشرها للمؤهلين وتابع متقدميها من مكان واحد
          </p>
        </div>
        <Button
          className="rounded-xl bg-gradient-to-l from-violet-600 to-violet-500 text-white shadow-md hover:from-violet-700 hover:to-violet-600"
          onClick={() => {
            setEditData(null)
            setWizardOpen(true)
          }}
        >
          <Sparkles className="size-4" />
          + نشر فرصة
        </Button>
      </header>

      {/* البحث والفلاتر */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث باسم الفرصة أو الجهة..." className="h-11 rounded-xl ps-9" />
        </div>
        <Tabs value={status} onValueChange={setStatus}>
          <TabsList className="flex h-auto w-full flex-wrap gap-1">
            {[
              ['ALL', 'الكل'],
              ['DRAFT', 'مسودة'],
              ['PUBLISHED', 'منشورة'],
              ['PAUSED', 'متوقفة'],
              ['CLOSED', 'مغلقة'],
            ].map(([value, label]) => (
              <TabsTrigger key={value} value={value} className="gap-1 text-[11px]">
                {label}
                {value !== 'ALL' && counts[value as keyof typeof counts] != null && (
                  <span className="rounded-full bg-muted px-1.5 text-[10px]">{counts[value as keyof typeof counts]}</span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* القائمة */}
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 rounded-3xl" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed bg-card/60 px-6 py-14 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-violet-100 dark:bg-violet-950/50">
            <Briefcase className="size-7 text-violet-600 dark:text-violet-300" />
          </span>
          <p className="text-sm font-black">لا توجد فرص بعد</p>
          <p className="max-w-xs text-xs text-muted-foreground">ابدأ بنشر أول فرصة عمل صحية لجهتك — سيصلها المؤهلون فوراً</p>
          <Button className="rounded-xl bg-violet-600 text-white hover:bg-violet-700" onClick={() => setWizardOpen(true)}>
            <Sparkles className="size-4" />
            نشر فرصة
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((o) => (
            <article key={o.id} className="relative overflow-hidden rounded-3xl border bg-card shadow-sm transition-shadow hover:shadow-md">
              <span
                className={`absolute inset-y-0 start-0 w-1 ${o.status === 'PUBLISHED' ? 'bg-emerald-500' : o.status === 'DRAFT' ? 'bg-slate-400' : o.status === 'PAUSED' ? 'bg-amber-500' : 'bg-rose-500'}`}
                aria-hidden
              />
              <div className="p-5 ps-6">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary">فرصة رقم {o.number}</Badge>
                      <ForsahBadge status={o.status} />
                    </div>
                    <h3 className="mt-1.5 truncate text-base font-black" title={o.title}>{o.title}</h3>
                    <p className="mt-0.5 flex items-center gap-1 text-xs font-bold text-muted-foreground">
                      <Building2 className="size-3 shrink-0" />
                      {o.hospital.name}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="text-sm font-black text-[var(--role-accent-strong)] dark:text-[var(--role-accent-glow)]">
                      {formatSalary(o.salaryAmount, o.salaryType, o.salaryCurrency).main}
                    </p>
                    <p className="mt-0.5 flex items-center justify-end gap-2 text-[11px] font-bold text-muted-foreground">
                      <span className="flex items-center gap-1"><Users className="size-3" />{o._count.applications} متقدم</span>
                      <span className="flex items-center gap-1"><CalendarClock className="size-3" />{o._count.interviews} مقابلة</span>
                      <span className="flex items-center gap-1"><UserCheckIcon className="size-3" />{o._count.selections}/{o.positionsNeeded}</span>
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                  {o.specialty && <InfoChip>{o.specialty.name}</InfoChip>}
                  {o.department && <InfoChip>{o.department.name}</InfoChip>}
                  <InfoChip>أُنشئت {formatDate(o.createdAt)}</InfoChip>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" className="rounded-xl" asChild>
                    <Link href={`/hr/opportunities/${o.id}`}>
                      <Eye className="size-4" />
                      المتقدمون والإدارة
                      <ChevronLeft className="size-3.5" />
                    </Link>
                  </Button>
                  {o.status === 'DRAFT' && (
                    <Button
                      size="sm"
                      className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                      disabled={transition.isPending}
                      onClick={() => transition.mutate({ id: o.id, action: 'publish' })}
                    >
                      <Send className="size-4" />
                      نشر
                    </Button>
                  )}
                  {(o.status === 'PUBLISHED' || o.status === 'ACTIVE') && (
                    <>
                      <Button size="sm" variant="outline" className="rounded-xl" disabled={transition.isPending} onClick={() => transition.mutate({ id: o.id, action: 'pause' })}>
                        <PauseCircle className="size-4" />
                        إيقاف مؤقت
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-xl text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40"
                        disabled={transition.isPending}
                        onClick={() => setCloseTarget(o)}
                      >
                        <XCircle className="size-4" />
                        إغلاق الفرصة
                      </Button>
                    </>
                  )}
                  {o.status === 'PAUSED' && (
                    <Button size="sm" variant="outline" className="rounded-xl" disabled={transition.isPending} onClick={() => transition.mutate({ id: o.id, action: 'resume' })}>
                      <PlayCircle className="size-4" />
                      استئناف
                    </Button>
                  )}
                  {(o.status === 'DRAFT' || o.status === 'PUBLISHED' || o.status === 'ACTIVE' || o.status === 'PAUSED') && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-xl"
                      disabled={editFetching}
                      onClick={async () => {
                        // جلب التفاصيل الكاملة أولاً (تشمل مراجع الكتالوج) ثم فتح المعالج
                        setEditFetching(true)
                        try {
                          const full = await apiFetcher<{ opportunity: Record<string, unknown> }>(`/api/opportunities/${o.id}`)
                          setEditData(full.opportunity as unknown as Record<string, unknown>)
                          setWizardOpen(true)
                        } catch (e) {
                          toast.error((e as Error).message)
                        } finally {
                          setEditFetching(false)
                        }
                      }}
                    >
                      <Pencil className="size-4" />
                      تعديل
                    </Button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Wizard إنشاء/تعديل — يُركَّب عند الفتح فقط بمفتاح فريد حتى تُهيأ حالاته من editData مباشرة */}
      {wizardOpen && (
        <OpportunityWizard
          key={String(editData?.id ?? 'new')}
          open
          onOpenChange={setWizardOpen}
          editData={editData as never}
        />
      )}

      {/* حوار تأكيد الإغلاق — المواصفة 14 حرفياً */}
      <Dialog open={!!closeTarget} onOpenChange={(o) => !o && setCloseTarget(null)}>
        <DialogContent className="rounded-3xl sm:max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-black">هل أنت متأكد من إغلاق هذه الفرصة؟</DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              «{closeTarget?.title}» — ستتوقف فوراً عن استقبال أي طلبات جديدة وتختفي من قوائم المؤهلين.
              جميع الطلبات والمقابلات والاختيارات والبيانات المالية محفوظة بلا أي حذف.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button
              className="flex-1 rounded-xl bg-rose-600 text-white hover:bg-rose-700"
              disabled={transition.isPending}
              onClick={() => closeTarget && transition.mutate({ id: closeTarget.id, action: 'close' })}
            >
              <XCircle className="size-4" />
              إغلاق الفرصة
            </Button>
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setCloseTarget(null)}>
              إلغاء
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function UserCheckIcon({ className }: { className?: string }) {
  return <ClipboardList className={className} />
}
