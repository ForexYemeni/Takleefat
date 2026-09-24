'use client'

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BadgeCheck,
  Ban,
  CheckCircle2,
  FilePenLine,
  GraduationCap,
  Hourglass,
  Info,
  Loader2,
  Send,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetcher, apiPost } from '@/lib/api-client'
import { formatDate, formatDateTime } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
 * بطاقة طلب تعديل الملف المهني — الجولة 74 (إضافي بحت كلياً)
 * ============================================================
 * «إمكانية المستخدم من طلب التعديل على ملفه الشخصي — سنوات الخبرة،
 *  المؤهل العلمي، وأشياء أخرى — بشكل احترافي جداً»
 *  - عرض القيم الحالية (مقفلة — التعديل بطلب مُراجَع حصراً)
 *  - نموذج طلب: التخصص + المؤهل (من كتالوج الإدارة) + سنوات الخبرة + ملاحظة
 *  - سجل الطلبات بحالاتها وملاحظات المراجعة
 *  - طلب واحد قيد المراجعة كحد أقصى (الحماية من التكدس على الخادم أيضاً)
 * يعمل لحسابي الكادر الصحي والطبيب (الجمهور يُحدد من الدور للكتالوج).
 */

interface EditRequest {
  id: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  requestedSpecialty: string | null
  requestedQualification: string | null
  requestedYearsOfExperience: number | null
  appliedSpecialty: string | null
  appliedQualification: string | null
  appliedYearsOfExperience: number | null
  note: string | null
  reviewNote: string | null
  reviewedAt: string | null
  createdAt: string
  reviewer: { name: string } | null
}

interface Payload {
  requests: EditRequest[]
  pendingRequest: EditRequest | null
  current: {
    specialty: string | null
    qualification: string | null
    yearsOfExperience: number | null
    photoUrl: string | null
  }
}

interface MyProfileLite {
  user: { role: string }
}

const STATUS_UI: Record<EditRequest['status'], { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  PENDING: { label: 'قيد المراجعة', cls: 'border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300', icon: Hourglass },
  APPROVED: { label: 'معتمد', cls: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300', icon: CheckCircle2 },
  REJECTED: { label: 'مرفوض', cls: 'border-red-300 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300', icon: Ban },
}

export function ProfileEditRequestCard() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [specialty, setSpecialty] = useState('')
  const [qualification, setQualification] = useState('')
  const [years, setYears] = useState('')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['my-profile-edit-requests'],
    queryFn: () => apiFetcher<Payload>('/api/me/profile-edit-requests'),
  })

  // الدور لتحديد جمهور كتالوج المؤهلات (كادر / طبيب)
  const { data: profileData } = useQuery({
    queryKey: ['my-profile'],
    queryFn: () => apiFetcher<MyProfileLite>('/api/me/profile'),
  })
  const audience = profileData?.user.role === 'DOCTOR' ? 'DOCTOR' : 'NURSE'

  const { data: catalogData } = useQuery({
    queryKey: ['qualifications-public', audience],
    queryFn: () =>
      apiFetcher<{ qualifications: Array<{ id: string; name: string }> }>(
        `/api/qualifications/public?audience=${audience}`
      ),
  })

  const current = data?.current
  const pending = data?.pendingRequest ?? null

  const openDialog = () => {
    setSpecialty('')
    setQualification('')
    setYears('')
    setNote('')
    setOpen(true)
  }

  const nothingNew = useMemo(
    () =>
      !specialty.trim() &&
      !qualification &&
      (years === '' || Number(years) === current?.yearsOfExperience),
    [specialty, qualification, years, current?.yearsOfExperience]
  )

  const submit = async () => {
    setSending(true)
    try {
      const body: Record<string, unknown> = {}
      if (specialty.trim()) body.specialty = specialty.trim()
      if (qualification) body.qualification = qualification
      if (years !== '' && Number(years) !== current?.yearsOfExperience) {
        body.yearsOfExperience = Number(years)
      }
      if (note.trim()) body.note = note.trim()
      const res = await apiPost<{ message: string }>('/api/me/profile-edit-requests', body)
      toast.success(res.message)
      setOpen(false)
      qc.invalidateQueries({ queryKey: ['my-profile-edit-requests'] })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  return (
    <Card id="profile-edit-request" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-lg">
          <span className="flex items-center gap-2">
            <FilePenLine className="size-5 text-primary" />
            تعديل بياناتي المهنية
          </span>
          <Button size="sm" className="gap-2" onClick={openDialog} disabled={!!pending}>
            {pending ? <Hourglass className="size-4" /> : <FilePenLine className="size-4" />}
            {pending ? 'طلبك قيد المراجعة' : 'طلب تعديل'}
          </Button>
        </CardTitle>
        <CardDescription>
          التخصص والمؤهل وسنوات الخبرة بيانات موثقة — أرسل طلب التعديل ويُراجع من الإدارة أو
          الموارد البشرية، وتُطبَّق القيم المعتمدة تلقائياً على ملفك وسيرتك الذاتية
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* القيم الحالية — مقفلة بمراجعة */}
        {current && (
          <div className="grid gap-2.5 sm:grid-cols-3">
            <CurrentValue icon={Info} label="التخصص الحالي" value={current.specialty} />
            <CurrentValue icon={GraduationCap} label="المؤهل العلمي الحالي" value={current.qualification} />
            <CurrentValue
              icon={BadgeCheck}
              label="سنوات الخبرة الحالية"
              value={current.yearsOfExperience != null ? `${current.yearsOfExperience} سنة` : null}
            />
          </div>
        )}

        {isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            جارٍ تحميل سجل الطلبات...
          </p>
        )}

        {/* تنبيه وجود طلب قيد المراجعة */}
        {pending && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
            <Hourglass className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <div className="text-sm leading-relaxed text-amber-900 dark:text-amber-200">
              <p className="font-extrabold">لديك طلب تعديل قيد المراجعة منذ {formatDate(pending.createdAt)}</p>
              <p className="mt-1 text-[13px]">{describeRequest(pending)}</p>
              <p className="mt-1 text-[12px]">
                سيصلك إشعار فور حسم الطلب — لا يمكن إرسال طلب جديد قبل ذلك.
              </p>
            </div>
          </div>
        )}

        {/* سجل الطلبات */}
        {!isLoading && (data?.requests.length ?? 0) > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-extrabold text-muted-foreground">سجل طلبات التعديل</p>
            {data!.requests.map((r) => {
              const ui = STATUS_UI[r.status]
              const Icon = ui.icon
              return (
                <div key={r.id} className="rounded-2xl border p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`gap-1 text-[11px] ${ui.cls}`}>
                        <Icon className="size-3" />
                        {ui.label}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">{formatDateTime(r.createdAt)}</span>
                    </div>
                    {r.reviewer && r.reviewedAt && (
                      <span className="text-[10px] text-muted-foreground">
                        راجعه {r.reviewer.name} — {formatDate(r.reviewedAt)}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-[13px] leading-relaxed">{describeRequest(r)}</p>
                  {r.status === 'APPROVED' && (
                    <p className="mt-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                      ✓ طُبِّقت القيم على ملفك — تظهر الآن في سيرتك الذاتية والبطاقة المهنية
                    </p>
                  )}
                  {r.note && (
                    <p className="mt-2 rounded-xl bg-secondary/60 p-2.5 text-[12px] leading-relaxed">
                      <span className="font-extrabold">ملاحظتك: </span>
                      {r.note}
                    </p>
                  )}
                  {r.reviewNote && (
                    <p className="mt-2 rounded-xl border border-primary/20 bg-primary/5 p-2.5 text-[12px] leading-relaxed">
                      <span className="font-extrabold">ملاحظة المراجع: </span>
                      {r.reviewNote}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {!isLoading && (data?.requests.length ?? 0) === 0 && !pending && (
          <p className="rounded-2xl border border-dashed p-4 text-center text-xs text-muted-foreground">
            لا طلبات سابقة — عند الحاجة لتعديل تخصصك أو مؤهلك أو سنوات خبرتك أرسل طلباً من الزر أعلاه
          </p>
        )}
      </CardContent>

      {/* ============ نموذج الطلب ============ */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FilePenLine className="size-5 text-primary" />
              طلب تعديل الملف المهني
            </DialogTitle>
            <DialogDescription>
              املأ الحقول التي تريد تعديلها فقط — يُراجع الطلب من الإدارة أو الموارد البشرية
              قبل تطبيق أي تغيير
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-specialty">التخصص الجديد (اختياري)</Label>
              <Input
                id="edit-specialty"
                placeholder={`اتركه فارغاً لعدم التغيير — الحالي: ${current?.specialty ?? '—'}`}
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                maxLength={80}
              />
            </div>

            <div className="space-y-2">
              <Label>المؤهل العلمي الجديد (اختياري)</Label>
              <Select value={qualification} onValueChange={setQualification}>
                <SelectTrigger>
                  <SelectValue placeholder={`الحالي: ${current?.qualification ?? '—'} — اختر مؤهلاً جديداً`} />
                </SelectTrigger>
                <SelectContent>
                  {(catalogData?.qualifications ?? []).map((q) => (
                    <SelectItem key={q.id} value={q.name}>
                      {q.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                المؤهل يُختار من كتالوج المنصة المعتمد — تحقق من قيمته الحالية أولّد الطلب
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-years">سنوات الخبرة الجديدة (اختياري)</Label>
              <Input
                id="edit-years"
                type="number"
                min={0}
                max={50}
                inputMode="numeric"
                placeholder={`الحالي: ${current?.yearsOfExperience ?? '—'}`}
                value={years}
                onChange={(e) => setYears(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-note">ملاحظة تشرح طلبك (اختياري)</Label>
              <Textarea
                id="edit-note"
                rows={3}
                maxLength={400}
                placeholder="مثال: حصلت مؤخراً على مؤهل جديد وأرفقت مستند التحقق في مستنداتي"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            {nothingNew && (
              <p className="rounded-xl bg-amber-50 p-3 text-[12px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                أدخل قيمة جديدة لحقل واحد على الأقل مختلفة عن قيمتك الحالية
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={sending}>
              إلغاء
            </Button>
            <Button onClick={submit} disabled={sending || nothingNew} className="gap-2">
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              إرسال الطلب للمراجعة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function describeRequest(r: EditRequest): string {
  const parts = [
    r.requestedSpecialty && `التخصص → «${r.requestedSpecialty}»`,
    r.requestedQualification && `المؤهل → «${r.requestedQualification}»`,
    r.requestedYearsOfExperience != null && `سنوات الخبرة → ${r.requestedYearsOfExperience} سنة`,
  ].filter(Boolean)
  return parts.length > 0 ? `الطلب: ${parts.join(' · ')}` : 'طلب تعديل بيانات مهنية'
}

function CurrentValue({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | null
}) {
  return (
    <div className="rounded-2xl border bg-secondary/30 p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
        <Icon className="size-3.5 text-primary" />
        {label}
      </p>
      <p className="mt-1 text-sm font-extrabold">{value ?? '—'}</p>
    </div>
  )
}
