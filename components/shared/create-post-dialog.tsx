'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useForm, type FieldErrors } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  BadgeCheck,
  BriefcaseMedical,
  Building2,
  CalendarDays,
  Clock,
  Coins,
  Layers,
  MapPin,
  MessagesSquare,
  Send,
  Sparkles,
  Stethoscope,
  Star,
  TrendingUp,
  UserCheck,
  Users,
  type LucideIcon,
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

/** بطاقات جمهور التكليف الفاخرة — كل طريقة توزيع ببطاقة أيقونة ووصف مختصر */
const DISTRIBUTION_CARDS: Array<{
  key: CreatePostInput['distribution']
  icon: LucideIcon
  title: string
  desc: string
  cls: string
}> = [
  {
    key: 'ALL_MATCHING',
    icon: Users,
    title: 'الجميع المطابق',
    desc: 'يصل التكليف لكل الكوادر المطابقين للجنس المطلوب',
    cls: 'text-teal-600 bg-teal-100 dark:bg-teal-950/50 dark:text-teal-300',
  },
  {
    key: 'AUTO_MATCH',
    icon: Sparkles,
    title: 'مطابقة ذكية',
    desc: 'كوادر القسم المطلوب والمرتبطون بالجهة الصحية حصراً',
    cls: 'text-violet-600 bg-violet-100 dark:bg-violet-950/50 dark:text-violet-300',
  },
  {
    key: 'INVITE_SELECTED',
    icon: UserCheck,
    title: 'استدعاء محدد',
    desc: 'اختر كوادر بعينهم — يصلهم استدعاء بالقبول أو الرفض',
    cls: 'text-blue-600 bg-blue-100 dark:bg-blue-950/50 dark:text-blue-300',
  },
  {
    key: 'FAVORITES',
    icon: Star,
    title: 'المفضلون فقط',
    desc: 'حصرياً لكوادرك المفضلين المطابقين للجنس',
    cls: 'text-amber-600 bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300',
  },
  {
    key: 'SAME_ORG',
    icon: Building2,
    title: 'كوادر الجهة',
    desc: 'حصرياً للعاملين بالجهة الصحية المختارة',
    cls: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300',
  },
  {
    key: 'ENDORSED',
    icon: BadgeCheck,
    title: 'المعتمدون',
    desc: 'حصرياً للكوادر المعتمدين لدى الجهة الصحية',
    cls: 'text-cyan-600 bg-cyan-100 dark:bg-cyan-950/50 dark:text-cyan-300',
  },
  {
    key: 'INTERVIEWED',
    icon: MessagesSquare,
    title: 'المتقابلون',
    desc: 'حصرياً لمن تمت مقابلته مسبقاً لدى الجهة',
    cls: 'text-indigo-600 bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-300',
  },
  {
    key: 'PROGRESSIVE',
    icon: TrendingUp,
    title: 'نشر تدريجي',
    desc: 'المفضلون ← الجهة ← المعتمدون ← الجميع — تلقائياً',
    cls: 'text-rose-600 bg-rose-100 dark:bg-rose-950/50 dark:text-rose-300',
  },
]



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
  /** رقم التكليف التالي — عند تمريره يظهر العنوان الاختياري «التكليف رقم N» (وضع المستلم الإداري) */
  nextNumber?: number
}

export function CreatePostDialog({
  open,
  onOpenChange,
  onCreated,
  repostSource,
  nextNumber,
}: CreatePostDialogProps) {
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
  // /api/departments يُعيد الأقسام النشطة فقط (فلتر isActive على الخادم) — لا فلترة إضافية هنا
  const departments = departmentsData?.departments ?? []

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
  const selectedDepartment = form.watch('department') || ''
  const { data: suggestedData } = useQuery({
    queryKey: ['suggested-nurses', selectedHospitalId, form.watch('gender'), selectedDepartment],
    queryFn: () =>
      apiFetcher<{ nurses: SuggestedNurse[]; priorityLabels: Record<string, string> }>(
        `/api/receiver/nurses?hospitalId=${selectedHospitalId}&gender=${form.watch('gender') || 'ANY'}&department=${encodeURIComponent(selectedDepartment)}`
      ),
    enabled: open && !!selectedHospitalId,
  })
  const suggested = useMemo(() => suggestedData?.nurses ?? [], [suggestedData])

  const toggleNurse = (id: string) => {
    setSelectedNurseIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  // ---------- ضمانة احترافية: لا فشل صامت أبداً ----------
  // إذا حجب التحقق النشر لأي سبب، يظهر فوراً تنبيه واضح برسالة الحقل المسبّب —
  // المستخدم يرى دائماً سبب عدم النشر بدل زر لا يستجيب
  const onInvalid = (errors: FieldErrors<CreatePostFormValues>) => {
    const first = Object.values(errors).find((e) => e && 'message' in e && e.message) as
      | { message?: string }
      | undefined
    toast.error(first?.message ?? 'تحقق من الحقول المطلوبة قبل النشر')
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
          <DialogTitle>
            {nextNumber ? `إنشاء تكليف جديد — التكليف رقم ${nextNumber}` : 'إضافة تكليف مُعلن'}
          </DialogTitle>
          <DialogDescription>
            {nextNumber
              ? `سيظهر العنوان تلقائياً «التكليف رقم ${nextNumber}» (ويمكن الإدارة تعديله لاحقاً) — الجهة الصحية تُختار من مستشفيات الإدارة والموقع يُعبأ تلقائياً — بدون تاريخ انتهاء`
              : 'يُنشر التكليف للكادر التمريضي للتقديم — العنوان يُولَّد تلقائياً «التكليف رقم N» والموقع يُعبأ تلقائياً من الجهة الصحية المختارة'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(submitMutation, onInvalid)} className="space-y-4" noValidate>
          {/* العنوان الاختياري — وضع المستلم الإداري (الترقيم التسلسلي التلقائي) */}
          {nextNumber != null && (
            <div className="space-y-2">
              <Label htmlFor="cp-title">عنوان التكليف (اختياري)</Label>
              <Input
                id="cp-title"
                placeholder={`اتركه فارغاً ليكون: التكليف رقم ${nextNumber}`}
                {...form.register('title')}
              />
              {form.formState.errors.title && (
                <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
              )}
            </div>
          )}
          {/* الجهة الصحية من قوائم الإدارة */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <BriefcaseMedical className="size-3.5" />
              الجهة الصحية (من قوائم الإدارة)
            </Label>
            <Select
              value={selectedHospitalId || undefined}
              onValueChange={(v) => {
                form.setValue('hospitalId', v, { shouldValidate: true })
                // الموقع الفعلي يُشتق على الخادم من الجهة الصحية حصراً (location: hospital.location) —
                // لا نُرسل الموقع من النموذج إطلاقاً لتفادي أي حجب صامت لاختلاف حدود التحقق
              }}
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

          {/* ---------- جمهور التكليف — بطاقات فاخرة لاختيار من يصله التكليف ---------- */}
          <div className="space-y-3 rounded-2xl border bg-gradient-to-bl from-secondary/40 to-transparent p-4">
            <div className="flex items-center justify-between gap-2">
              <Label className="flex items-center gap-1.5 text-sm font-extrabold">
                <Layers className="size-4 text-primary" />
                جمهور التكليف — من يصله؟
              </Label>
              <Badge variant="secondary" className="text-[11px]">
                {DISTRIBUTION_LABELS[distribution]}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {DISTRIBUTION_CARDS.map((card) => {
                const isActive = distribution === card.key
                const Icon = card.icon
                return (
                  <button
                    key={card.key}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => {
                      form.setValue('distribution', card.key)
                      if (card.key !== 'INVITE_SELECTED') setSelectedNurseIds([])
                    }}
                    className={`flex items-start gap-2.5 rounded-2xl border-2 p-3 text-start transition-all ${
                      isActive
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-transparent bg-background/70 hover:border-primary/30 hover:bg-background'
                    }`}
                  >
                    <span className={`rounded-xl p-1.5 shrink-0 ${card.cls}`}>
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-xs font-extrabold ${isActive ? 'text-primary' : ''}`}>
                        {card.title}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                        {card.desc}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>

            <p className="text-[11px] text-muted-foreground">
              {distribution === 'ALL_MATCHING' && 'يُنشر التكليف لكل الكوادر المطابقين للجنس المطلوب — الفلترة مطبقة على مستوى قاعدة البيانات والAPI'}
              {distribution === 'AUTO_MATCH' && 'يظهر فقط للكوادر المطابقين ذكاءً: أصحاب القسم المطلوب من أقسام عملهم أو المرتبطون بالجهة الصحية'}
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
                {form.formState.errors.progressiveStageHours && (
                  <p className="mt-1 text-xs text-destructive">{form.formState.errors.progressiveStageHours.message}</p>
                )}
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
                  department={selectedDepartment}
                  selected={selectedNurseIds}
                  onToggle={toggleNurse}
                  emptyText="لا يوجد كوادر مطابقون للجنس والقسم المطلوبين — أضف كوادر أو اختر جهة أخرى"
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
