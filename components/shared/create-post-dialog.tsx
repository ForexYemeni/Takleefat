'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  BriefcaseMedical,
  CalendarDays,
  CheckSquare,
  Clock,
  Coins,
  Layers,
  MapPin,
  Send,
  Square,
  Stethoscope,
  Star,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetcher, apiPost } from '@/lib/api-client'
import { POST_GENDER_LABELS } from '@/lib/utils'
import { AFFILIATION_STATUS_LABELS, DISTRIBUTION_LABELS, MATCH_PRIORITY_LABELS } from '@/lib/network'
import {
  createPostSchema,
  type CreatePostInput,
  type CreatePostFormValues,
} from '@/lib/validations/post'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { FavoriteStar } from '@/components/shared/favorite-star'
import { NursePickList, type SuggestedNurse } from '@/components/shared/nurse-pick-list'
import { AudiencePreviewCard } from '@/components/shared/audience-preview-card'
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
 * نافذة إنشاء تكليف مُعلن — تُستخدم في حساب المستلم الإداري وحساب الإدارة:
 * الجهة الصحية من قوائم الإدارة (الموقع يُعبأ تلقائياً) + القسم من قوائم الإدارة
 * + قيمة التكليف + عدد الساعات + الجنس المطلوب — بلا تاريخ انتهاء.
 */

interface HospitalOption {
  id: string
  name: string
  location: string | null
  lat: number | null
  lng: number | null
}

interface DepartmentOption {
  id: string
  name: string
  isActive: boolean
}



/** مصدر إعادة النشر — بيانات آخر تكليف مُعلن لملء النموذج تلقائياً (الجولة العاشرة) */
export interface RepostSource {
  title?: string | null
  description?: string | null
  hospitalId?: string | null
  department?: string | null
  gender?: string | null
  value?: number | null
  hours?: number | null
  nursesNeeded?: number | null
  distribution?: string | null
}

interface CreatePostDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (post: { id: string; title: string; number: number }) => void
  /** آخر تكليف — يُملأ به النموذج تلقائياً عند الفتح (زر «أعد نشر آخر تكليف») */
  repostSource?: RepostSource | null
}

export function CreatePostDialog({ open, onOpenChange, onCreated, repostSource }: CreatePostDialogProps) {
  const form = useForm<CreatePostFormValues, unknown, CreatePostInput>({
    resolver: zodResolver(createPostSchema),
    defaultValues: {
      title: '',
      description: '',
      hospitalId: '',
      department: '',
      location: '',
      startDate: '',
      nursesNeeded: '1',
      hours: '',
      gender: 'ANY',
      value: '',
      distribution: 'ALL_MATCHING',
      progressiveStageHours: '',
    },
  })

  const { data: hospitalsData } = useQuery({
    queryKey: ['hospitals'],
    queryFn: () => apiFetcher<{ hospitals: HospitalOption[] }>('/api/hospitals'),
    enabled: open,
  })
  const { data: departmentsData } = useQuery({
    queryKey: ['departments'],
    queryFn: () => apiFetcher<{ departments: DepartmentOption[] }>('/api/departments'),
    enabled: open,
  })

  const hospitals = hospitalsData?.hospitals ?? []
  const departments = (departmentsData?.departments ?? []).filter((d) => d.isActive)

  // إعادة نشر: ملء النموذج من آخر تكليف (العنوان يُترك فارغاً ليأخذ الرقم الجديد تلقائياً)
  useEffect(() => {
    if (open && repostSource) {
      form.reset({
        title: '',
        description: repostSource.description ?? '',
        hospitalId: repostSource.hospitalId ?? '',
        department: repostSource.department ?? '',
        location: '',
        startDate: new Date().toISOString().slice(0, 10),
        nursesNeeded: repostSource.nursesNeeded != null ? String(repostSource.nursesNeeded) : '1',
        hours: repostSource.hours != null ? String(repostSource.hours) : '',
        gender: (repostSource.gender as 'MALE' | 'FEMALE' | 'ANY') ?? 'ANY',
        value: repostSource.value != null ? String(repostSource.value) : '',
        distribution: (repostSource.distribution as CreatePostInput['distribution']) ?? 'ALL_MATCHING',
        progressiveStageHours: '',
      })
    }
  }, [open, repostSource])

  const selectedHospitalId = form.watch('hospitalId')
  const selectedHospital = hospitals.find((h) => h.id === selectedHospitalId)
  const distribution = form.watch('distribution') || 'ALL_MATCHING'

  // ---------- اختيار الكوادر عند التوزيع المحدد/الاستدعاء ----------
  const [selectedNurseIds, setSelectedNurseIds] = useState<string[]>([])
  const { data: suggestedData } = useQuery({
    queryKey: ['suggested-nurses', selectedHospitalId, form.watch('gender')],
    queryFn: () =>
      apiFetcher<{ nurses: SuggestedNurse[]; priorityLabels: Record<string, string> }>(
        `/api/receiver/nurses?hospitalId=${selectedHospitalId}&gender=${form.watch('gender') || 'ANY'}`
      ),
    enabled: open && !!selectedHospitalId,
  })
  const suggested = useMemo(() => suggestedData?.nurses ?? [], [suggestedData])

  const toggleNurse = (id: string) => {
    setSelectedNurseIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const submitMutation = async (values: CreatePostInput) => {
    try {
      const res = await apiPost<{ message: string; post: { id: string; title: string; number: number } }>(
        '/api/posts',
        {
          ...values,
          ...(values.distribution === 'INVITE_SELECTED' ? { invitedNurseIds: selectedNurseIds } : {}),
        }
      )
      toast.success(`${res.message} (${res.post.title})`)
      onOpenChange(false)
      form.reset()
      setSelectedNurseIds([])
      onCreated?.(res.post)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>إضافة تكليف مُعلن</DialogTitle>
          <DialogDescription>
            يُنشر التكليف للكادر التمريضي للتقديم — العنوان يُولَّد تلقائياً «التكليف رقم N»
            والموقع يُعبأ تلقائياً من الجهة الصحية المختارة
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(submitMutation)} className="space-y-4" noValidate>
          {/* الجهة الصحية من قوائم الإدارة */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <BriefcaseMedical className="size-3.5" />
              الجهة الصحية (من قوائم الإدارة)
            </Label>
            <Select
              value={selectedHospitalId || undefined}
              onValueChange={(v) => form.setValue('hospitalId', v, { shouldValidate: true })}
            >
              <SelectTrigger>
                <SelectValue placeholder="اختر الجهة الصحية" />
              </SelectTrigger>
              <SelectContent>
                {hospitals.map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.hospitalId && (
              <p className="text-xs text-destructive">{form.formState.errors.hospitalId.message}</p>
            )}
            {/* الموقع يُعبأ تلقائياً 100% من الجهة المختارة */}
            {selectedHospital?.location && (
              <p className="flex items-center gap-1.5 rounded-lg bg-secondary/70 px-3 py-2 text-xs font-semibold">
                <MapPin className="size-3.5 text-primary" />
                الموقع (تلقائي): {selectedHospital.location}
                {selectedHospital.lat != null && selectedHospital.lng != null && (
                  <a
                    href={`https://www.google.com/maps?q=${selectedHospital.lat},${selectedHospital.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="ms-auto font-bold text-teal-600 hover:underline"
                  >
                    عرض على الخريطة
                  </a>
                )}
              </p>
            )}
          </div>

          {/* القسم من قوائم الإدارة */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Stethoscope className="size-3.5" />
                القسم (من قوائم الإدارة)
              </Label>
              <Select
                value={form.watch('department') || undefined}
                onValueChange={(v) => form.setValue('department', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر القسم" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.name}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <CalendarDays className="size-3.5" />
                تاريخ البدء
              </Label>
              <Input type="date" {...form.register('startDate')} />
              {form.formState.errors.startDate && (
                <p className="text-xs text-destructive">{form.formState.errors.startDate.message}</p>
              )}
            </div>
          </div>

          {/* المبلغ + الساعات + الكادر + الجنس */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cp-value" className="flex items-center gap-1.5">
                <Coins className="size-3.5" />
                قيمة التكليف (ريال يمني)
              </Label>
              <Input id="cp-value" type="number" min={1} placeholder="مثال: 120000" {...form.register('value')} />
              {form.formState.errors.value && (
                <p className="text-xs text-destructive">{form.formState.errors.value.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cp-hours" className="flex items-center gap-1.5">
                <Clock className="size-3.5" />
                عدد الساعات
              </Label>
              <Input id="cp-hours" type="number" min={1} placeholder="مثال: 8" {...form.register('hours')} />
              {form.formState.errors.hours && (
                <p className="text-xs text-destructive">{form.formState.errors.hours.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Users className="size-3.5" />
                عدد الكادر المطلوب
              </Label>
              <Input type="number" min={1} max={50} {...form.register('nursesNeeded')} />
              {form.formState.errors.nursesNeeded && (
                <p className="text-xs text-destructive">{form.formState.errors.nursesNeeded.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>الجنس المطلوب</Label>
              <Select
                value={form.watch('gender') || 'ANY'}
                onValueChange={(v) => form.setValue('gender', v as 'MALE' | 'FEMALE' | 'ANY')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['ANY', 'MALE', 'FEMALE'] as const).map((g) => (
                    <SelectItem key={g} value={g}>
                      {POST_GENDER_LABELS[g]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cp-desc">وصف التكليف (اختياري)</Label>
            <Textarea
              id="cp-desc"
              rows={3}
              placeholder="تفاصيل الوردية والمهام المطلوبة..."
              {...form.register('description')}
            />
          </div>

          {/* ---------- طريقة توزيع التكليف — شبكة الكوادر الصحية المعتمدة ---------- */}
          <div className="space-y-2 rounded-2xl border bg-secondary/30 p-4">
            <Label className="flex items-center gap-1.5 text-sm font-extrabold">
              <Layers className="size-4 text-primary" />
              طريقة توزيع التكليف
            </Label>
            <Select
              value={distribution}
              onValueChange={(v) => {
                form.setValue('distribution', v as CreatePostInput['distribution'])
                if (v !== 'INVITE_SELECTED') setSelectedNurseIds([])
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DISTRIBUTION_LABELS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {distribution === 'ALL_MATCHING' && 'يُنشر التكليف لكل الكوادر المطابقين للجنس المطلوب — الفلترة مطبقة على مستوى قاعدة البيانات والAPI'}
              {distribution === 'AUTO_MATCH' && 'يظهر فقط للكوادر المطابقين ذكاءً: تخصص يوافق القسم أو مرتبطون بالجهة الصحية'}
              {distribution === 'INVITE_SELECTED' && 'استدعاء مباشر: اختر كادراً أو أكثر من القائمة أدناه — يصلهم إشعار بالقبول/الرفض'}
              {distribution === 'FAVORITES' && 'يظهر حصراً لكوادرك المفضلين المطابقين للجنس'}
              {distribution === 'SAME_ORG' && 'يظهر حصراً للكوادر المرتبطين بالجهة الصحية المختارة'}
              {distribution === 'ENDORSED' && 'يظهر حصراً للكوادر المعتمدين لدى الجهة'}
              {distribution === 'INTERVIEWED' && 'يظهر حصراً للكوادر الذين تمت مقابلتهم لدى الجهة'}
              {distribution === 'PROGRESSIVE' && 'النشر التدريجي: المفضلون ← نفس الجهة ← المعتمدون ← الخارجيون المؤهلون — ينتقل تلقائياً كل مرحلة'}
            </p>

            {/* مدة المرحلة التدريجية */}
            {distribution === 'PROGRESSIVE' && (
              <div className="max-w-48">
                <Label htmlFor="cp-stage-hours">مدة كل مرحلة (ساعات)</Label>
                <Input id="cp-stage-hours" type="number" min={1} max={720} placeholder="24" {...form.register('progressiveStageHours')} />
              </div>
            )}

            {/* المعاينة الحية لجمهور التكليف (الجولة العاشرة) — لكل طرق التوزيع عدا الاستدعاء المحدد */}
            {distribution !== 'INVITE_SELECTED' && (
              <AudiencePreviewCard
                hospitalId={selectedHospitalId}
                gender={form.watch('gender') || 'ANY'}
                department={form.watch('department') || ''}
                distribution={distribution}
                enabled={open}
              />
            )}

            {/* الاستدعاء المحدد: اختيار تفاعلي */}
            {distribution === 'INVITE_SELECTED' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-xs font-bold">
                    <Users className="size-3.5" />
                    اختيار الكوادر المستدعين ({selectedNurseIds.length})
                  </p>
                  <Badge variant="secondary">مرتبون بالمطابقة الذكية</Badge>
                </div>
                <NursePickList
                  hospitalId={selectedHospitalId}
                  gender={form.watch('gender')}
                  selected={selectedNurseIds}
                  onToggle={toggleNurse}
                  emptyText="لا يوجد كوادر مطابقون للجنس المطلوب — أضف كوادر أو اختر جهة أخرى"
                />
                {selectedNurseIds.length === 0 && (
                  <p className="text-xs font-bold text-amber-600">اختر كادراً واحداً على الأقل قبل النشر</p>
                )}
              </div>
            )}

            {/* جمهور التوزيع الآلي: معاينة فقط */}
            {distribution !== 'INVITE_SELECTED' && distribution !== 'ALL_MATCHING' && distribution !== 'AUTO_MATCH' && distribution !== 'PROGRESSIVE' && (
              <div className="space-y-1.5">
                <p className="text-xs font-bold">معاينة الجمهور المستهدف ({suggested.length} كادر مطابق للجنس):</p>
                <div className="max-h-36 space-y-1 overflow-y-auto rounded-xl border bg-background p-2">
                  {suggested.slice(0, 8).map((n) => (
                    <div key={n.id} className="flex items-center gap-2 text-xs">
                      <span className="text-amber-500" title={n.priorityLabel}>{'★'.repeat(Math.max(1, n.priority))}</span>
                      <span className="font-semibold">{n.name}</span>
                      {n.affiliationStatus && <Badge variant="outline" className="text-[10px]">{AFFILIATION_STATUS_LABELS[n.affiliationStatus]}</Badge>}
                      <FavoriteStar nurseId={n.id} isFavorite={n.isFavorite} size="sm" />
                    </div>
                  ))}
                  {suggested.length === 0 && <p className="p-2 text-center text-xs text-muted-foreground">لا يوجد كوادر مطابقون بعد</p>}
                  {suggested.length > 8 && <p className="p-1 text-center text-[11px] text-muted-foreground">+{suggested.length - 8} كادر آخر</p>}
                </div>
              </div>
            )}

            {/* معاينة مراحل النشر التدريجي */}
            {distribution === 'PROGRESSIVE' && (
              <ol className="space-y-1 rounded-xl border bg-background p-3 text-xs">
                <li>1️⃣ الكوادر المفضلون لديك</li>
                <li>2️⃣ العاملون في نفس الجهة الصحية</li>
                <li>3️⃣ المعتمدون والمتقابَل معهم</li>
                <li>4️⃣ كل الكوادر المؤهلين المطابقين للجنس</li>
              </ol>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button
              type="submit"
              disabled={form.formState.isSubmitting || (distribution === 'INVITE_SELECTED' && selectedNurseIds.length === 0)}
              className="gap-2"
            >
              <Send className="size-4" />
              {form.formState.isSubmitting ? 'جارٍ النشر...' : distribution === 'INVITE_SELECTED' ? 'إنشاء وإرسال الاستدعاء' : 'نشر التكليف'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
