'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import type { Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Briefcase,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Coins,
  FileText,
  Send,
  Sparkles,
} from 'lucide-react'
import { apiFetcher, apiPost, apiPatch } from '@/lib/api-client'
import { opportunitySchema, type OpportunityInput } from '@/lib/validations/forsah'
import { FORSAH_DOCUMENT_OPTIONS } from '@/lib/forsah/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
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
import { cn } from '@/lib/utils'

/**
 * معالج إنشاء/تعديل فرصة — الجولة 66/67 | ميزة «فرصة» (المواصفة 5)
 * ============================================================
 * 4 خطوات: الأساسيات → الراتب والدوام → المتطلبات → المحتوى والنشر.
 * الجولة 67: اسم الفرصة يُولّد تلقائياً «فرصة + القسم/التخصص» — بلا حقل يدوي،
 * والقسم الطبي إجباري للكادر والتخصص إجباري للأطباء (بدل «بلا قيد»).
 * التخصص/القسم/المؤهل من الكتالوجات الحالية حصراً (FK — لا نسخ).
 */

const STEPS = [
  { key: 'basics', label: 'الأساسيات', icon: Building2 },
  { key: 'salary', label: 'الراتب والدوام', icon: Coins },
  { key: 'requirements', label: 'المتطلبات', icon: ClipboardList },
  { key: 'content', label: 'المحتوى', icon: FileText },
] as const

interface CatalogItem {
  id: string
  name: string
  audience?: string
  isActive?: boolean
}

interface EditData extends Partial<OpportunityInput> {
  id?: string
  number?: number
  audience?: 'NURSE' | 'DOCTOR'
  salaryType?: 'MONTHLY' | 'DAILY' | 'NEGOTIABLE'
  salaryCurrency?: 'YER' | 'SAR' | 'USD'
  gender?: 'MALE' | 'FEMALE' | 'ANY'
}

export function OpportunityWizard({
  open,
  onOpenChange,
  editData,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editData?: EditData | null
}) {
  const [step, setStep] = useState(0)
  const router = useRouter()
  const queryClient = useQueryClient()
  const isEdit = !!editData?.id

  const { data: hospitalsData } = useQuery({
    queryKey: ['forsah-hospitals'],
    queryFn: () => apiFetcher<{ hospitals: CatalogItem[] }>('/api/hospitals'),
    enabled: open,
  })
  const { data: specialtiesData } = useQuery({
    queryKey: ['forsah-specialties'],
    queryFn: () => apiFetcher<{ specialties: CatalogItem[] }>('/api/specialties'),
    enabled: open,
  })
  const { data: departmentsData } = useQuery({
    queryKey: ['forsah-departments'],
    queryFn: () => apiFetcher<{ departments: CatalogItem[] }>('/api/departments'),
    enabled: open,
  })
  const { data: qualificationsData } = useQuery({
    queryKey: ['forsah-qualifications'],
    queryFn: () => apiFetcher<{ qualifications: CatalogItem[] }>('/api/qualifications/public'),
    enabled: open,
  })

  const form = useForm<OpportunityInput>({
    // التحويل اليدوي: مخطط Zod يحتوي حقول coerce (دخل/خرج مختلفان) —
    // النوع الناتج (output) هو ما يستخدمه النموذج، والكاست آمن هنا
    resolver: zodResolver(opportunitySchema) as unknown as Resolver<OpportunityInput>,
    defaultValues: {
      hospitalId: (editData as { hospitalId?: string } | null)?.hospitalId ?? '',
      audience: (editData?.audience as 'NURSE' | 'DOCTOR') ?? 'NURSE',
      specialtyId: (editData?.specialtyId as string) ?? '',
      departmentId: (editData?.departmentId as string) ?? '',
      qualificationId: (editData?.qualificationId as string) ?? '',
      salaryAmount: editData?.salaryAmount ?? null,
      salaryType: (editData?.salaryType as 'MONTHLY' | 'DAILY' | 'NEGOTIABLE') ?? 'MONTHLY',
      salaryCurrency: (editData?.salaryCurrency as 'YER' | 'SAR' | 'USD') ?? 'YER',
      workStartTime: editData?.workStartTime ?? '',
      workEndTime: editData?.workEndTime ?? '',
      positionsNeeded: editData?.positionsNeeded ?? 1,
      gender: (editData?.gender as 'MALE' | 'FEMALE' | 'ANY') ?? 'ANY',
      vacations: editData?.vacations ?? '',
      procedureSharePercent: editData?.procedureSharePercent ?? null,
      minYearsExperience: editData?.minYearsExperience ?? null,
      licenseRequired: editData?.licenseRequired ?? false,
      requiredDocuments: (editData?.requiredDocuments as string[]) ?? [],
      description: editData?.description ?? '',
      responsibilities: editData?.responsibilities ?? '',
      benefits: editData?.benefits ?? '',
      notes: editData?.notes ?? '',
    },
  })

  // حالة محلية متزامنة مع النموذج للحقول المتفاعلة — بدل form.watch
  // (نفس القيمة تُكتب في النموذج عبر setValue — البيانات المرسلة من النموذج حصراً)
  // تهيئة فورية من بيانات التعديل — المكوّن يُركَّب من جديد عند كل فتح (key) فلا حاجة لأي مزامنة effect
  const [audienceState, setAudienceState] = useState<'NURSE' | 'DOCTOR'>(() => (editData?.audience as 'NURSE' | 'DOCTOR') ?? 'NURSE')
  const [salaryTypeState, setSalaryTypeState] = useState<'MONTHLY' | 'DAILY' | 'NEGOTIABLE'>(() => (editData?.salaryType as 'MONTHLY' | 'DAILY' | 'NEGOTIABLE') ?? 'MONTHLY')
  const [docsState, setDocsState] = useState<string[]>(() => (editData?.requiredDocuments as string[]) ?? [])
  const [licenseState, setLicenseState] = useState<boolean>(() => editData?.licenseRequired ?? false)
  const [hospitalIdState, setHospitalIdState] = useState<string>(() => (editData as { hospitalId?: string } | null)?.hospitalId ?? '')
  const [specialtyIdState, setSpecialtyIdState] = useState<string>(() => (editData?.specialtyId as string) ?? '')
  const [departmentIdState, setDepartmentIdState] = useState<string>(() => (editData?.departmentId as string) ?? '')
  const [qualificationIdState, setQualificationIdState] = useState<string>(() => (editData?.qualificationId as string) ?? '')
  const [genderState, setGenderState] = useState<'MALE' | 'FEMALE' | 'ANY'>(() => (editData?.gender as 'MALE' | 'FEMALE' | 'ANY') ?? 'ANY')
  const [currencyState, setCurrencyState] = useState<'YER' | 'SAR' | 'USD'>(() => (editData?.salaryCurrency as 'YER' | 'SAR' | 'USD') ?? 'YER')


  const saveMutation = useMutation({
    mutationFn: async (values: OpportunityInput) => {
      if (isEdit) {
        return apiPatch<{ message: string }>(`/api/opportunities/${editData!.id}`, {
          action: 'edit',
          data: values,
        })
      }
      return apiPost<{ message: string }>('/api/opportunities', values)
    },
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['forsah-opportunities'] })
      onOpenChange(false)
      form.reset()
      setStep(0)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const hospitals = hospitalsData?.hospitals ?? []
  const specialties = useMemo(
    () => (specialtiesData?.specialties ?? []).filter((s) => s.isActive !== false),
    [specialtiesData]
  )
  const departments = useMemo(
    () => (departmentsData?.departments ?? []).filter((d) => d.isActive !== false),
    [departmentsData]
  )
  const qualifications = useMemo(
    () => (qualificationsData?.qualifications ?? []).filter(
      (q) => q.isActive !== false && (!q.audience || q.audience === audienceState)
    ),
    [qualificationsData, audienceState]
  )

  const goNext = async () => {
    // فحص حقول الخطوة الحالية قبل التقدم
    if (step === 0) {
      const ok = await form.trigger(['hospitalId', 'audience', 'positionsNeeded'])
      if (!ok) return
    }
    if (step === 1) {
      const ok = await form.trigger(['salaryType', 'salaryCurrency'])
      if (!ok) return
    }
    if (step === 2) {
      // الجولة 67: القسم (للكادر) / التخصص (للأطباء) إجباري — لا تقدم بلا اختيار
      const ok = await form.trigger(audienceState === 'DOCTOR' ? ['specialtyId'] : ['departmentId'])
      if (!ok) return
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }

  const submit = form.handleSubmit((values) => saveMutation.mutate(values))

  // الجولة 67: معاينة حية لاسم الفرصة التلقائي — «فرصة + القسم (كادر) / التخصص (أطباء)»
  const autoTitle = useMemo(() => {
    if (audienceState === 'DOCTOR') {
      const name = specialties.find((s) => s.id === specialtyIdState)?.name
      return name ? `فرصة ${name}` : null
    }
    const name = departments.find((d) => d.id === departmentIdState)?.name
    return name ? `فرصة ${name}` : null
  }, [audienceState, specialtyIdState, departmentIdState, specialties, departments])

  const setAudience = (v: 'NURSE' | 'DOCTOR') => {
    setAudienceState(v)
    form.setValue('audience', v)
    // تغيير الجمهور يصفّر مرجع التخصص/القسم لتجنب مرجع لا يطابق الجمهور
    form.setValue(v === 'DOCTOR' ? 'departmentId' : 'specialtyId', '')
  }
  const setSalaryType = (v: 'MONTHLY' | 'DAILY' | 'NEGOTIABLE') => {
    setSalaryTypeState(v)
    form.setValue('salaryType', v)
  }
  const toggleDoc = (doc: string, on: boolean) => {
    const next = on ? [...docsState, doc] : docsState.filter((d) => d !== doc)
    setDocsState(next)
    form.setValue('requiredDocuments', next)
  }
  const setLicense = (v: boolean) => {
    setLicenseState(v)
    form.setValue('licenseRequired', v)
  }
  const setHospitalId = (v: string) => {
    setHospitalIdState(v)
    form.setValue('hospitalId', v)
  }
  const setSpecialtyId = (v: string) => {
    const value = v === 'none' ? '' : v
    setSpecialtyIdState(value)
    form.setValue('specialtyId', value)
  }
  const setDepartmentId = (v: string) => {
    const value = v === 'none' ? '' : v
    setDepartmentIdState(value)
    form.setValue('departmentId', value)
  }
  const setQualificationId = (v: string) => {
    const value = v === 'none' ? '' : v
    setQualificationIdState(value)
    form.setValue('qualificationId', value)
  }
  const setGender = (v: 'MALE' | 'FEMALE' | 'ANY') => {
    setGenderState(v)
    form.setValue('gender', v)
  }
  const setCurrency = (v: 'YER' | 'SAR' | 'USD') => {
    setCurrencyState(v)
    form.setValue('salaryCurrency', v)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onOpenChange(false); setStep(0) } }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-black">
            <span className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-violet-500 text-white">
              <Briefcase className="size-4" />
            </span>
            {isEdit ? `تعديل فرصة رقم ${editData?.number ?? ''}` : 'نشر فرصة جديدة'}
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            {isEdit
              ? 'حدّث بيانات الفرصة ثم احفظ — التعديلات تظهر فوراً للمؤهلين'
              : 'أكمل الخطوات الأربع — التخصص والقسم والمؤهل من كتالوج المنصة الحالي مباشرة'}
          </DialogDescription>
        </DialogHeader>

        {/* مؤشر الخطوات */}
        <div className="space-y-2">
          <Progress value={((step + 1) / STEPS.length) * 100} className="h-1.5" />
          <div className="flex justify-between">
            {STEPS.map((s, i) => (
              <button
                key={s.key}
                type="button"
                onClick={() => i < step && setStep(i)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-black transition-colors',
                  i === step
                    ? 'bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-200'
                    : i < step
                      ? 'text-emerald-600'
                      : 'text-muted-foreground/60'
                )}
              >
                {i < step ? <Check className="size-3" /> : <s.icon className="size-3" />}
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {/* ---------- الخطوة 1: الأساسيات ---------- */}
          {step === 0 && (
            <div className="space-y-3.5">
              {/* الجولة 67: اسم الفرصة تلقائي من القسم/التخصص — معاينة حية بدل الحقل اليدوي */}
              <div className="rounded-2xl border border-violet-200 bg-violet-50/70 p-3.5 dark:border-violet-800 dark:bg-violet-950/30">
                <p className="flex items-center gap-1.5 text-[11px] font-black text-violet-800 dark:text-violet-200">
                  <Sparkles className="size-3.5" />
                  اسم الفرصة يُولّد تلقائياً عند اختيار القسم أو التخصص
                </p>
                <p className="mt-1 text-sm font-black text-violet-900 dark:text-violet-100" dir="rtl">
                  {autoTitle ?? 'فرصة — يظهر الاسم بعد اختيار القسم/التخصص في خطوة المتطلبات'}
                </p>
              </div>
              <Field label="المنشأة / الجهة الصحية" required>
                <Select value={hospitalIdState || undefined} onValueChange={setHospitalId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="اختر الجهة من القائمة المعتمدة" />
                  </SelectTrigger>
                  <SelectContent>
                    {hospitals.map((h) => (
                      <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormError message={form.formState.errors.hospitalId?.message} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="نوع الكادر" required>
                  <Select value={audienceState} onValueChange={(v) => setAudience(v as 'NURSE' | 'DOCTOR')}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NURSE">كادر صحي</SelectItem>
                      <SelectItem value="DOCTOR">طبيب</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="عدد الموظفين المطلوب" required>
                  <Input type="number" min={1} max={500} {...form.register('positionsNeeded')} />
                  <FormError message={form.formState.errors.positionsNeeded?.message} />
                </Field>
              </div>
            </div>
          )}

          {/* ---------- الخطوة 2: الراتب والدوام ---------- */}
          {step === 1 && (
            <div className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <Field label="نوع الراتب" required>
                  <Select value={salaryTypeState} onValueChange={(v) => setSalaryType(v as OpportunityInput['salaryType'])}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MONTHLY">شهري</SelectItem>
                      <SelectItem value="DAILY">يومي</SelectItem>
                      <SelectItem value="NEGOTIABLE">حسب الاتفاق</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="العملة" required>
                  <Select value={currencyState} onValueChange={(v) => setCurrency(v as OpportunityInput['salaryCurrency'])}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="YER">ريال يمني</SelectItem>
                      <SelectItem value="SAR">ريال سعودي</SelectItem>
                      <SelectItem value="USD">دولار أمريكي</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              {salaryTypeState !== 'NEGOTIABLE' && (
                <Field label="قيمة الراتب">
                  <Input type="number" min={0} placeholder="مثال: 300000" {...form.register('salaryAmount')} />
                  <FormError message={form.formState.errors.salaryAmount?.message} />
                </Field>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="بداية الدوام">
                  <Input type="time" {...form.register('workStartTime')} />
                </Field>
                <Field label="نهاية الدوام">
                  <Input type="time" {...form.register('workEndTime')} />
                </Field>
              </div>
              <Field label="الإجازات">
                <Input placeholder="مثال: جمعة أسبوعياً + إجازة سنوية 21 يوماً" {...form.register('vacations')} />
              </Field>
              <Field label="النسبة من الفحوصات والإجراءات (٪) — إن وجدت">
                <Input type="number" min={0} max={100} placeholder="مثال: 15" {...form.register('procedureSharePercent')} />
                <FormError message={form.formState.errors.procedureSharePercent?.message} />
              </Field>
            </div>
          )}

          {/* ---------- الخطوة 3: المتطلبات ---------- */}
          {step === 2 && (
            <div className="space-y-3.5">
              {audienceState === 'DOCTOR' ? (
                <Field label="التخصص الطبي المطلوب" required>
                  <Select value={specialtyIdState || undefined} onValueChange={setSpecialtyId}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="اختر التخصص من الكتالوج" /></SelectTrigger>
                    <SelectContent>
                      {specialties.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {/* الجولة 67: التخصص إجباري للأطباء — أساس اسم الفرصة التلقائي وعرضها للمؤهلين حصراً */}
                  <FormError message={form.formState.errors.specialtyId?.message} />
                  <p className="mt-1 text-[10px] font-bold text-muted-foreground">تظهر الفرصة حصراً لأطباء هذا التخصص — ويدخل اسمها التلقائي من التخصص</p>
                </Field>
              ) : (
                <Field label="القسم الطبي المطلوب" required>
                  <Select value={departmentIdState || undefined} onValueChange={setDepartmentId}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="اختر القسم من الكتالوج" /></SelectTrigger>
                    <SelectContent>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {/* الجولة 67: القسم إجباري — لا «بلا قيد» بعد اليوم */}
                  <FormError message={form.formState.errors.departmentId?.message} />
                  <p className="mt-1 text-[10px] font-bold text-muted-foreground">تظهر الفرصة حصراً لكوادر هذا القسم — ويدخل اسمها التلقائي من القسم</p>
                </Field>
              )}
              <Field label="المؤهل المطلوب">
                <Select value={qualificationIdState || undefined} onValueChange={setQualificationId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="بلا قيد" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بلا قيد</SelectItem>
                    {qualifications.map((qq) => (
                      <SelectItem key={qq.id} value={qq.id}>{qq.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="الخبرة الدنيا (سنوات)">
                  <Input type="number" min={0} max={50} placeholder="مثال: 2" {...form.register('minYearsExperience')} />
                  <FormError message={form.formState.errors.minYearsExperience?.message} />
                </Field>
                <Field label="الجنس المطلوب">
                  <Select value={genderState} onValueChange={(v) => setGender(v as OpportunityInput['gender'])}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ANY">الجنسان</SelectItem>
                      <SelectItem value="MALE">ذكر</SelectItem>
                      <SelectItem value="FEMALE">أنثى</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <label className="flex items-center justify-between rounded-xl border p-3">
                <span className="text-xs font-black">التأكيد على الترخيص المهني الساري</span>
                <Switch checked={licenseState} onCheckedChange={setLicense} />
              </label>
              <Field label="المستندات المطلوبة">
                <div className="flex flex-wrap gap-2">
                  {FORSAH_DOCUMENT_OPTIONS.map((doc) => {
                    const checked = docsState.includes(doc)
                    return (
                      <label
                        key={doc}
                        className={cn(
                          'flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors',
                          checked ? 'border-violet-300 bg-violet-100 text-violet-800 dark:border-violet-700 dark:bg-violet-950/50 dark:text-violet-200' : 'bg-background text-muted-foreground hover:bg-accent'
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => toggleDoc(doc, v === true)}
                          className="size-3.5"
                        />
                        {doc}
                      </label>
                    )
                  })}
                </div>
              </Field>
            </div>
          )}

          {/* ---------- الخطوة 4: المحتوى ---------- */}
          {step === 3 && (
            <div className="space-y-3.5">
              <Field label="وصف الفرصة">
                <Textarea rows={3} placeholder="وصف موجز للوظيفة وأهم مميزاتها..." {...form.register('description')} />
              </Field>
              <Field label="المهام والمسؤوليات">
                <Textarea rows={3} placeholder="المهام اليومية والمسؤوليات الرئيسية..." {...form.register('responsibilities')} />
              </Field>
              <Field label="المزايا">
                <Textarea rows={2} placeholder="مثال: سكن إقامة + بدل نقل + تأمين طبي..." {...form.register('benefits')} />
              </Field>
              <Field label="ملاحظات">
                <Textarea rows={2} placeholder="أي ملاحظات إضافية تظهر للمتقدمين..." {...form.register('notes')} />
              </Field>
            </div>
          )}

          {/* أزرار التنقل */}
          <div className="flex items-center justify-between gap-2 border-t pt-3">
            <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => (step === 0 ? onOpenChange(false) : setStep(step - 1))}>
              <ChevronRight className="size-4" />
              {step === 0 ? 'إلغاء' : 'السابق'}
            </Button>
            {step < STEPS.length - 1 ? (
              <Button type="button" size="sm" className="rounded-xl bg-gradient-to-l from-violet-600 to-violet-500 text-white hover:from-violet-700 hover:to-violet-600" onClick={goNext}>
                التالي
                <ChevronLeft className="size-4" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="sm"
                disabled={saveMutation.isPending}
                className="rounded-xl bg-gradient-to-l from-violet-600 to-violet-500 text-white hover:from-violet-700 hover:to-violet-600"
              >
                <Send className="size-4" />
                {saveMutation.isPending ? 'جارٍ الحفظ...' : isEdit ? 'حفظ التعديلات' : 'حفظ كمسودة'}
              </Button>
            )}
          </div>
          <p className="text-center text-[10px] font-bold text-muted-foreground">
            تُحفظ الفرصة كمسودة — ثم تنشرها بضغطة واحدة من قائمة فرصك بعد المراجعة
          </p>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 block text-xs font-black">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </Label>
      {children}
    </div>
  )
}

function FormError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="mt-1 text-[11px] font-bold text-rose-600 dark:text-rose-400">{message}</p>
}
