'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  Clock,
  Hourglass,
  MapPin,
  Plus,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetcher, apiPost } from '@/lib/api-client'
import { formatDate } from '@/lib/utils'
import { ORG_TYPE_LABELS } from '@/lib/network'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/**
 * بطاقة «جهاتي الصحية» في ملف المسؤول — الجولة 44
 * =====================================================
 * «في حساب المستلم الإداري الملف الشخصي يجب ان تظهر الجهه الصحية التي يعمل
 * فيها ويمكنه اضافه جهه صحية اخرى بشرط الموافقة عليها من حساب الادارة»:
 *  - تعرض الجهة الأساسية (من بيانات التسجيل) + الجهات المعتمدة الإضافية
 *  + الطلبات المعلقة «بانتظار موافقة الإدارة»
 *  - زر «إضافة جهة صحية أخرى»: اختيار من كتالوج الإدارة أو اقتراح جهة جديدة
 *  — يُنشئ طلباً معلقاً ويصل الإدارة فوراً ولا تصبح الجهة فعّالة إلا بعد موافقتهم
 * تُستخدم في ملف المستلم الإداري وملف مشرف الأطباء.
 */

interface OrgLite {
  id: string
  name: string
  type: string
  city: string | null
  status: string
}

interface OrgLink {
  id: string
  status: string
  note: string | null
  createdAt: string
  hospital: OrgLite
}

interface MyOrgs {
  orgs: OrgLite[]
  primaryName: string | null
  links: OrgLink[]
}

interface HospitalOption {
  id: string
  name: string
  status: string
  isActive: boolean
}

export function MyOrgsCard() {
  const queryClient = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [hospitalId, setHospitalId] = useState('')
  const [note, setNote] = useState('')
  const [newOrg, setNewOrg] = useState({ name: '', type: 'HOSPITAL', city: '', address: '', phone: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['my-orgs'],
    queryFn: () => apiFetcher<MyOrgs>('/api/receiver/orgs'),
  })

  const { data: hospitalsData } = useQuery({
    queryKey: ['hospitals-catalog'],
    queryFn: () => apiFetcher<{ hospitals: HospitalOption[] }>('/api/hospitals'),
    enabled: addOpen && mode === 'existing',
  })

  const requestMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiPost<{ message: string }>('/api/receiver/orgs', payload),
    onSuccess: (res) => {
      toast.success(res.message)
      setAddOpen(false)
      setHospitalId('')
      setNote('')
      setNewOrg({ name: '', type: 'HOSPITAL', city: '', address: '', phone: '' })
      queryClient.invalidateQueries({ queryKey: ['my-orgs'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const orgs = data?.orgs ?? []
  const links = data?.links ?? []
  const primaryName = data?.primaryName ?? null
  const pendingLinks = links.filter((l) => l.status === 'PENDING')

  const submit = () => {
    if (mode === 'existing') {
      if (!hospitalId) {
        toast.error('اختر الجهة الصحية من القائمة')
        return
      }
      requestMutation.mutate({ hospitalId, note })
    } else {
      if (newOrg.name.trim().length < 2) {
        toast.error('أدخل اسم الجهة الصحية الجديدة')
        return
      }
      requestMutation.mutate({ newOrg, note })
    }
  }

  return (
    <div className="rounded-2xl border bg-card shadow-sm">
      {/* رأس البطاقة */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-gradient-to-l from-teal-600/10 via-teal-500/5 to-transparent px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-teal-500/10 p-1.5 text-teal-700 dark:text-teal-300">
            <Building2 className="size-4" />
          </span>
          <div>
            <p className="text-sm font-extrabold">جهاتي الصحية</p>
            <p className="text-[11px] text-muted-foreground">
              الجهات التي تدير كوادرها وتكليفاتها — الجديدة تحتاج موافقة الإدارة
            </p>
          </div>
        </div>
        <Button size="sm" className="gap-1 text-[11px]" onClick={() => setAddOpen(true)}>
          <Plus className="size-3.5" />
          إضافة جهة صحية أخرى
        </Button>
      </div>

      <div className="grid gap-2 p-4">
        {isLoading && <p className="py-2 text-center text-xs text-muted-foreground">جارٍ التحميل...</p>}

        {/* الجهات الفعّالة */}
        {!isLoading && orgs.length === 0 && (
          <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
            لا توجد جهة صحية مرتبطة بحسابك — أضف جهة وانتظر موافقة الإدارة
          </p>
        )}
        {orgs.map((org, i) => {
          const isPrimary = primaryName === org.name
          return (
            <div
              key={org.id}
              className="flex flex-wrap items-center gap-2.5 rounded-xl border bg-gradient-to-bl from-teal-50/60 to-transparent px-3.5 py-3 dark:border-teal-900 dark:from-teal-950/20"
            >
              <span className="shrink-0 rounded-lg bg-teal-500/10 p-2 text-teal-700 dark:text-teal-300">
                <Building2 className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-extrabold">
                  {org.name}
                  {isPrimary && (
                    <Badge className="gap-1 bg-teal-600 text-white">
                      <ShieldCheck className="size-3" />
                      جهتك الأساسية
                    </Badge>
                  )}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                  {org.type && <span>{ORG_TYPE_LABELS[org.type] ?? org.type}</span>}
                  {org.city && (
                    <span className="flex items-center gap-0.5">
                      <MapPin className="size-2.5" />
                      {org.city}
                    </span>
                  )}
                </p>
              </div>
            </div>
          )
        })}

        {/* الطلبات المعلقة */}
        {pendingLinks.map((l) => (
          <div
            key={l.id}
            className="flex flex-wrap items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50/50 px-3.5 py-3 dark:border-amber-900 dark:bg-amber-950/20"
          >
            <span className="shrink-0 rounded-lg bg-amber-500/10 p-2 text-amber-700 dark:text-amber-300">
              <Hourglass className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5 text-sm font-extrabold text-amber-800 dark:text-amber-200">
                {l.hospital.name}
                <Badge variant="outline" className="gap-1 border-amber-300 text-[10px] text-amber-800 dark:border-amber-800 dark:text-amber-300">
                  <Clock className="size-3" />
                  بانتظار موافقة الإدارة
                </Badge>
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                طلب الإضافة بتاريخ {formatDate(l.createdAt)} — ستصلك الموافقة فور مراجعتها
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* حوار إضافة جهة */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إضافة جهة صحية أخرى</DialogTitle>
            <DialogDescription>
              اختر جهة من كتالوج الإدارة أو اقترح جهة جديدة — يصل الطلب للإدارة فوراً
              ولا ترتبط الجهة بحسابك إلا بعد موافقتهم
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode('existing')}
              className={`rounded-xl border-2 px-3 py-2 text-xs font-bold transition-colors ${
                mode === 'existing' ? 'border-primary bg-primary/5 text-primary' : 'text-muted-foreground'
              }`}
            >
              جهة من كتالوج الإدارة
            </button>
            <button
              type="button"
              onClick={() => setMode('new')}
              className={`rounded-xl border-2 px-3 py-2 text-xs font-bold transition-colors ${
                mode === 'new' ? 'border-primary bg-primary/5 text-primary' : 'text-muted-foreground'
              }`}
            >
              جهة جديدة
            </button>
          </div>

          {mode === 'existing' ? (
            <div className="space-y-2">
              <Label>الجهة الصحية</Label>
              <Select value={hospitalId || undefined} onValueChange={setHospitalId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر الجهة" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {(hospitalsData?.hospitals ?? [])
                    .filter((h) => h.status !== 'INACTIVE')
                    .map((h) => (
                      <SelectItem key={h.id} value={h.id}>
                        {h.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="grid gap-3">
              <div className="space-y-2">
                <Label>اسم الجهة *</Label>
                <Input
                  placeholder="مثال: مستشفى الأمل العام"
                  value={newOrg.name}
                  onChange={(e) => setNewOrg({ ...newOrg, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label>النوع</Label>
                  <Select
                    value={newOrg.type}
                    onValueChange={(v) => setNewOrg({ ...newOrg, type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ORG_TYPE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>المدينة</Label>
                  <Input
                    placeholder="مثال: صنعاء"
                    value={newOrg.city}
                    onChange={(e) => setNewOrg({ ...newOrg, city: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>ملاحظة للإدارة (اختياري)</Label>
            <Textarea
              rows={2}
              placeholder="مثال: أعمل مسؤولاً إدارياً في هذه الجهة أيضاً"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              إلغاء
            </Button>
            <Button
              onClick={submit}
              disabled={requestMutation.isPending}
              className="gap-1.5"
            >
              {requestMutation.isPending ? (
                <>
                  <Hourglass className="size-3.5 animate-spin" />
                  جارٍ الإرسال...
                </>
              ) : (
                <>
                  <Plus className="size-3.5" />
                  إرسال طلب الإضافة
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
