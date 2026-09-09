'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  CalendarClock,
  Clock3,
  Hourglass,
  Plus,
  PlusCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetcher, apiPost } from '@/lib/api-client'
import { ORG_STATUS_LABELS, ORG_TYPE_LABELS, AFFILIATION_STATUS_LABELS } from '@/lib/network'
import { StatusBadge } from '@/components/shared/status-badge'
import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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

/**
 * جهات العمل — السجل المهني للكادر التمريضي (الجولة الثامنة)
 * يضيف الكادر من ملفه الشخصي أكثر من جهة صحية (يعمل حالياً أو عمل سابقاً) مع سنوات العمل:
 * - جهة من قائمة الإدارة المعتمدة، أو جهة جديدة تُرفع للاعتماد مع بقية بياناتها
 * - الطلب يبقى «قيد المراجعة» حتى تعتمده الإدارة أو ترفضه
 * - يُعرض كسيرة ذاتية عند رؤية الكادر من المستلم الإداري
 */

interface MyAffiliation {
  id: string
  status: string
  statusLabel: string
  requestedStatus: string | null
  workYears: number | null
  note: string | null
  createdAt: string
  hospital: { id: string; name: string; type: string; city: string | null; status: string }
}

interface OrgOption {
  id: string
  name: string
  type: string
  city: string | null
  status: string
}

const ORG_TYPE_OPTIONS = ['HOSPITAL', 'MEDICAL_CENTER', 'SPECIALIZED_CENTER', 'CLINIC', 'MEDICAL_COMPLEX', 'OTHER'] as const

export function AffiliationsManager() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['my-professional-profile'],
    queryFn: () =>
      apiFetcher<{ affiliations: MyAffiliation[] }>('/api/me/professional-profile'),
  })

  const { data: orgsData } = useQuery({
    queryKey: ['hospitals', 'for-affiliation'],
    queryFn: () => apiFetcher<{ hospitals: OrgOption[] }>('/api/hospitals'),
  })

  // نموذج طلب جهة عمل
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [orgId, setOrgId] = useState('')
  const [workType, setWorkType] = useState<'WORKING' | 'FORMER'>('WORKING')
  const [workYears, setWorkYears] = useState('')
  const [newOrg, setNewOrg] = useState({ name: '', type: 'HOSPITAL', city: '', address: '', phone: '' })

  const requestMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiPost<{ message: string }>('/api/affiliations', payload),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['my-professional-profile'] })
      setOpen(false)
      resetForm()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const resetForm = () => {
    setMode('existing')
    setOrgId('')
    setWorkType('WORKING')
    setWorkYears('')
    setNewOrg({ name: '', type: 'HOSPITAL', city: '', address: '', phone: '' })
  }

  const submit = () => {
    if (mode === 'existing' && !orgId) {
      toast.error('اختر الجهة الصحية من القائمة أو أضفها كجهة جديدة')
      return
    }
    if (mode === 'new' && newOrg.name.trim().length < 2) {
      toast.error('أدخل اسم الجهة الصحية الجديدة')
      return
    }
    const payload: Record<string, unknown> = {
      requestedStatus: workType,
      workYears: workYears === '' ? undefined : Number(workYears),
    }
    if (mode === 'existing') payload.hospitalId = orgId
    else payload.newOrg = newOrg
    requestMutation.mutate(payload)
  }

  const affiliations = data?.affiliations ?? []
  const orgs = (orgsData?.hospitals ?? []).filter((o) => o.status === 'ACTIVE')

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-extrabold">
            <Building2 className="size-5 text-primary" />
            جهات عملي — السجل المهني
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            أضف الجهات الصحية التي تعمل بها حالياً أو عملت بها سابقاً مع سنوات العمل — تُعرض كسيرة
            ذاتية احترافية عند رؤيتك من المستلمين الإداريين
          </p>
        </div>
        <Button onClick={() => setOpen(true)} className="shrink-0 gap-2">
          <Plus className="size-4" />
          إضافة جهة عمل
        </Button>
      </div>

      {isLoading ? (
        <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          جارٍ تحميل السجل المهني...
        </p>
      ) : affiliations.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="لا توجد جهات عمل في سجلك بعد"
          description="أضف أول جهة صحية — يعتمدها حساب الإدارة ثم تظهر في سيرتك الذاتية أمام المستلمين."
          action={
            <Button onClick={() => setOpen(true)} className="gap-2">
              <Plus className="size-4" />
              إضافة جهة عمل
            </Button>
          }
        />
      ) : (
        <div className="grid gap-2">
          {affiliations.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-2xl border p-4">
              <span className="rounded-xl bg-secondary p-2.5">
                <Building2 className="size-5 text-primary" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-extrabold">
                  {a.hospital.name}
                  <Badge variant="outline">{ORG_TYPE_LABELS[a.hospital.type] ?? a.hospital.type}</Badge>
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {a.hospital.city && <span>{a.hospital.city}</span>}
                  <span className="flex items-center gap-1">
                    <Clock3 className="size-3" />
                    {a.workYears != null ? `${a.workYears} ${a.workYears === 1 ? 'سنة' : a.workYears === 2 ? 'سنتان' : 'سنوات'} عمل` : 'سنوات العمل غير محددة'}
                  </span>
                  {a.requestedStatus && a.status === 'PENDING' && (
                    <span className="flex items-center gap-1">
                      <CalendarClock className="size-3" />
                      نوع العمل المطلوب: {AFFILIATION_STATUS_LABELS[a.requestedStatus] ?? a.requestedStatus}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <StatusBadge status={a.status} labels={AFFILIATION_STATUS_LABELS} />
                {a.status === 'PENDING' && (
                  <span className="text-[10px] text-muted-foreground">
                    بانتظار اعتماد الإدارة
                  </span>
                )}
              </div>
            </div>
          ))}
          {affiliations.some((a) => a.hospital.status === 'PENDING') && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <Hourglass className="me-1 inline size-3.5" />
              بعض الجهات المضافة في سجلك جهات جديدة بانتظار اعتمادها من الإدارة — ستُفعّل تلقائياً بعد الاعتماد.
            </p>
          )}
        </div>
      )}

      {/* ---------- حوار إضافة جهة عمل ---------- */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm() }}>
        <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="size-4 text-primary" />
              إضافة جهة عمل إلى سجلك المهني
            </DialogTitle>
            <DialogDescription>
              اختر جهة من الجهات الصحية المعتمدة أو أضف جهة جديدة — يُراجع الطلب من الإدارة
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* التبديل: قائمة / جهة جديدة */}
            <div className="flex justify-center gap-1 rounded-lg border bg-secondary/40 p-1">
              <button
                type="button"
                onClick={() => setMode('existing')}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                  mode === 'existing' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                }`}
              >
                من الجهات المعتمدة
              </button>
              <button
                type="button"
                onClick={() => setMode('new')}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                  mode === 'new' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                }`}
              >
                جهة جديدة (غير موجودة)
              </button>
            </div>

            {mode === 'existing' ? (
              <div className="space-y-2">
                <Label>الجهة الصحية *</Label>
                <Select value={orgId} onValueChange={setOrgId}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الجهة الصحية" />
                  </SelectTrigger>
                  <SelectContent>
                    {orgs.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                        {o.city ? ` — ${o.city}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
                <p className="flex items-center gap-1.5 text-xs font-bold text-primary">
                  <PlusCircle className="size-3.5" />
                  جهة غير موجودة في القائمة؟ تُضاف لجهات الإدارة وتُعتمد أو تُرفض
                </p>
                <div className="space-y-2">
                  <Label htmlFor="aff-new-name">اسم الجهة *</Label>
                  <Input
                    id="aff-new-name"
                    placeholder="مثال: مركز الشفاء الطبي"
                    value={newOrg.name}
                    onChange={(e) => setNewOrg({ ...newOrg, name: e.target.value })}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>نوع الجهة</Label>
                    <Select value={newOrg.type} onValueChange={(v) => setNewOrg({ ...newOrg, type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ORG_TYPE_OPTIONS.map((t) => (
                          <SelectItem key={t} value={t}>{ORG_TYPE_LABELS[t]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="aff-new-city">المدينة</Label>
                    <Input
                      id="aff-new-city"
                      placeholder="مثال: عدن"
                      value={newOrg.city}
                      onChange={(e) => setNewOrg({ ...newOrg, city: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="aff-new-address">العنوان</Label>
                    <Input
                      id="aff-new-address"
                      placeholder="الحي / الشارع"
                      value={newOrg.address}
                      onChange={(e) => setNewOrg({ ...newOrg, address: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="aff-new-phone">رقم تواصل الجهة</Label>
                    <Input
                      id="aff-new-phone"
                      dir="ltr"
                      inputMode="tel"
                      maxLength={9}
                      placeholder="7xxxxxxxx"
                      className="text-start"
                      value={newOrg.phone}
                      onChange={(e) => setNewOrg({ ...newOrg, phone: e.target.value.replace(/\D/g, '').slice(0, 9) })}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* نوع العمل + سنوات العمل */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>نوع العمل *</Label>
                <Select value={workType} onValueChange={(v) => setWorkType(v as 'WORKING' | 'FORMER')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WORKING">أعمل فيها حالياً</SelectItem>
                    <SelectItem value="FORMER">عملت بها سابقاً</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="aff-years">سنوات العمل</Label>
                <Input
                  id="aff-years"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={50}
                  placeholder="مثال: 3"
                  value={workYears}
                  onChange={(e) => setWorkYears(e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={submit} disabled={requestMutation.isPending} className="gap-2">
              <Plus className="size-4" />
              {requestMutation.isPending ? 'جارٍ الإرسال...' : 'إرسال الطلب'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
