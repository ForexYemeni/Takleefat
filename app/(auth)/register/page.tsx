'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Eye,
  EyeOff,
  Loader2,
  UserPlus,
  PhoneIcon,
  Lock,
  Stethoscope,
  ClipboardCheck,
  Hospital,
  PlusCircle,
  HeartPulse,
  BadgeCheck,
  ShieldCheck,
  FileCheck2,
  BellRing,
  Info,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { QUALIFICATION_OPTIONS, cn } from '@/lib/utils'
import { ORG_TYPE_LABELS } from '@/lib/network'
import { getServerIssueMessage } from '@/lib/client-diagnostics'

/**
 * صفحة التسجيل — تصميم احترافي ببطاقات أدوار غنية (جولة 30):
 * - بطاقات نوع الحساب: أيقونة بلون مميز + وصف + مزايا مصغرة + شارة «مُحدد»
 * - شريط «ماذا بعد التسجيل؟» يتبع نوع الحساب المختار
 * - أقسام مرقمة (النوع ← البيانات الأساسية ← المهنية/الجهة ← كلمة المرور)
 * - مؤشر قوة كلمة المرور الحي + شارات ثقة
 * - نفس قواعد التحقق والعقد مع الخادم دون أي تغيير (منظومة الأطباء):
 *   الكادر: التخصص إجباري (أقسام الإدارة) | الطبيب: التخصص الطبي (كتالوج مستقل) ومؤهلات خاصة
 *   المستلم: الجهة من جهات الإدارة أو جهة جديدة تُرفع للاعتماد
 */

interface PublicOrg {
  id: string
  name: string
  type: string
  city: string | null
}

const ORG_TYPE_OPTIONS = ['HOSPITAL', 'MEDICAL_CENTER', 'SPECIALIZED_CENTER', 'CLINIC', 'MEDICAL_COMPLEX', 'OTHER'] as const

/** مؤهلات الأطباء — خيارات خاصة بمنظومة الأطباء (نفس قيم DOCTOR_QUALIFICATION_VALUES) */
const DOCTOR_QUALIFICATION_OPTIONS = [
  { value: 'بكالوريوس طب وجراحة', label: 'بكالوريوس طب وجراحة' },
  { value: 'ماجستير', label: 'ماجستير' },
  { value: 'دكتوراه', label: 'دكتوراه' },
  { value: 'شهادة زمالة', label: 'شهادة زمالة' },
]

/** بطاقات نوع الحساب — أيقونة بلون مميز + وصف + مزايا مصغرة (الألوان ثابتة لـ Tailwind JIT) */
const ROLE_CARDS = [
  {
    id: 'NURSE' as const,
    title: 'كادر تمريضي',
    desc: 'قدّم على التكليفات المعلنة وابنِ سجلك المهني الموثّق',
    icon: Stethoscope,
    chips: ['تكليفات معلنة', 'بطاقة مهنية', 'استدعاء مباشر'],
    iconActive: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
    selected: 'border-teal-500 ring-teal-500/30 bg-teal-50/50 dark:bg-teal-950/20',
    badge: 'bg-teal-600',
  },
  {
    id: 'DOCTOR' as const,
    title: 'طبيب',
    desc: 'تكليفات طبية معلنة واستدعاء مباشر وبطاقة مهنية بالتخصص الطبي',
    icon: HeartPulse,
    chips: ['تخصصك الطبي', 'تكليفات معلنة', 'بطاقة مهنية'],
    iconActive: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    selected: 'border-emerald-500 ring-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20',
    badge: 'bg-emerald-600',
  },
  {
    id: 'RECEIVER' as const,
    title: 'مستلم إداري',
    desc: 'أنشئ التكليفات واستدعِ الكوادر الموثوقين لجهتك الصحية',
    icon: ClipboardCheck,
    chips: ['إنشاء التكليفات', 'شبكة الكوادر', 'استدعاء مباشر'],
    iconActive: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    selected: 'border-amber-500 ring-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20',
    badge: 'bg-amber-600',
  },
]

/** ماذا يحدث بعد التسجيل؟ — خطوات مصغرة لكل نوع حساب */
const NEXT_STEPS: Record<'NURSE' | 'RECEIVER' | 'DOCTOR', string[]> = {
  NURSE: [
    'أنشئ حسابك وارفع مستنداتك (الهوية وغيرها)',
    'تُراجع الإدارة بياناتك ومستنداتك وتعتمد حسابك',
    'تصفح التكليفات المعلنة وقدّم عليها مباشرة',
  ],
  DOCTOR: [
    'أنشئ حسابك واختر تخصصك الطبي وارفع مستنداتك',
    'تُراجع الإدارة بياناتك ومستنداتك وتعتمد حسابك',
    'استقبل التكليفات الطبية المعلنة والاستدعاءات المباشرة',
  ],
  RECEIVER: [
    'أنشئ حسابك وحدّد جهتك الصحية (من القائمة أو جهة جديدة)',
    'تُراجع الإدارة جهتك وحسابك وتعتمدهما',
    'أنشئ تكليفاتك واستدعِ الكوادر والأطباء الموثوقين',
  ],
}

const TRUST_CHIPS = [
  { icon: ShieldCheck, text: 'اعتماد إداري لكل الحسابات' },
  { icon: FileCheck2, text: 'مستنداتك محمية ومراجَعة' },
  { icon: BellRing, text: 'إشعار فوري بحالة الاعتماد' },
]

/** مستويات قوة كلمة المرور — من 0 (فارغة/ضعيفة جداً) إلى 4 (قوية) */
const PW_STRENGTH = [
  { label: 'ضعيفة جداً', text: 'text-red-600 dark:text-red-400', bar: 'bg-red-500' },
  { label: 'ضعيفة', text: 'text-orange-600 dark:text-orange-400', bar: 'bg-orange-500' },
  { label: 'مقبولة', text: 'text-amber-600 dark:text-amber-400', bar: 'bg-amber-500' },
  { label: 'جيدة', text: 'text-lime-700 dark:text-lime-400', bar: 'bg-lime-600' },
  { label: 'قوية', text: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500' },
]

/** رأس قسم مرقّم — يوحّد إيقاع الصفحة بصرياً */
function SectionHead({ step, title, hint }: { step: number; title: string; hint?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-extrabold text-primary">
        {step}
      </span>
      <div className="min-w-0">
        <h2 className="text-sm font-extrabold leading-tight">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  )
}

export default function RegisterPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // كتالوجات الإدارة للقوائم (نقاط نهاية عامة)
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([])
  const [specialties, setSpecialties] = useState<Array<{ id: string; name: string }>>([])
  const [orgs, setOrgs] = useState<PublicOrg[]>([])

  // كتالوج المؤهلات العلمية من حساب الإدارة (الجولة 32) — القوائم التاريخية احتياط عند تعذر الجلب
  const [nurseQuals, setNurseQuals] = useState<readonly { value: string; label: string }[]>(QUALIFICATION_OPTIONS)
  const [doctorQuals, setDoctorQuals] = useState<readonly { value: string; label: string }[]>(DOCTOR_QUALIFICATION_OPTIONS)

  // حقول مشتركة
  const [role, setRole] = useState<'NURSE' | 'RECEIVER' | 'DOCTOR'>('NURSE')
  const [name, setName] = useState('') // حقل واحد: الاسم مع اللقب
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')

  // حقول الكادر التمريضي
  const [specialty, setSpecialty] = useState('') // إجباري — من أقسام الإدارة
  const [qualification, setQualification] = useState('')
  const [yearsOfExperience, setYearsOfExperience] = useState('') // إجباري — يبدأ فارغاً
  const [gender, setGender] = useState('')

  // الجهة الصحية للمستلم الإداري
  const [orgMode, setOrgMode] = useState<'existing' | 'new'>('existing')
  const [orgId, setOrgId] = useState('')
  const [newOrg, setNewOrg] = useState({ name: '', type: 'HOSPITAL', city: '', address: '', phone: '' })

  // الجولة 45 — البلاغ الحرفي: «عند وجود اي خطاء في اي حقل يجب ان يهتز الحقل
  // ويتلون للون الاحمر مع عودة الى نفس الحقل»:
  //  - fieldErrors: خطأ كل حقل (يُظهر الحدود الحمراء + رسالة تحته)
  //  - shakeTick: عدّاد يعيد تشغيل حركة الاهتزاز عند كل محاولة فاشلة
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [shakeTick, setShakeTick] = useState(0)

  /** تسجيل خطأ حقل: تلوينه أحمر + اهتزازه + عودة التمرير إليه مع تركيزه */
  const failField = (field: string, message: string): false => {
    setFieldErrors((prev) => ({ ...prev, [field]: message }))
    setError(message)
    setShakeTick((t) => t + 1)
    window.setTimeout(() => {
      const wrap = document.getElementById(`reg-${field}-wrap`)
      wrap?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      wrap
        ?.querySelector<HTMLElement>('input, textarea, button[role="combobox"]')
        ?.focus({ preventScroll: true })
    }, 80)
    return false
  }

  /** محو خطأ حقل عند تعديله */
  const clearFieldError = (field: string) =>
    setFieldErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })

  /** صنف غلاف الحقل: اهتزاز + أحمر عند وجود خطأ (مع مفتاح يعيد الحركة) */
  const fieldWrap = (field: string) => ({
    key: `${field}-${fieldErrors[field] ? shakeTick : 'ok'}`,
    className: cn('space-y-2', fieldErrors[field] && 'field-error field-error-shake'),
  })

  useEffect(() => {
    fetch('/api/departments/public')
      .then((r) => r.json())
      .then((d) => setDepartments(d.departments ?? []))
      .catch(() => null)
    fetch('/api/specialties/public')
      .then((r) => r.json())
      .then((d) => setSpecialties(d.specialties ?? []))
      .catch(() => null)
    fetch('/api/hospitals/public')
      .then((r) => r.json())
      .then((d) => setOrgs(d.hospitals ?? []))
      .catch(() => null)
    fetch('/api/qualifications/public?audience=NURSE')
      .then((r) => r.json())
      .then((d) => {
        const list = (d.qualifications ?? []).map((q: { name: string }) => ({ value: q.name, label: q.name }))
        if (list.length > 0) setNurseQuals(list)
      })
      .catch(() => null)
    fetch('/api/qualifications/public?audience=DOCTOR')
      .then((r) => r.json())
      .then((d) => {
        const list = (d.qualifications ?? []).map((q: { name: string }) => ({ value: q.name, label: q.name }))
        if (list.length > 0) setDoctorQuals(list)
      })
      .catch(() => null)
  }, [])

  // مؤشر قوة كلمة المرور الحي — 4 معايير (طول 8+، حروف وأرقام، طول 12+، رمز خاص)
  const pwScore = useMemo(() => {
    if (!password) return 0
    let score = 0
    if (password.length >= 8) score++
    if (/[A-Za-z]/.test(password) && /[0-9]/.test(password)) score++
    if (password.length >= 12) score++
    if (/[^A-Za-z0-9]/.test(password)) score++
    return score
  }, [password])
  const pw = PW_STRENGTH[pwScore]

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // ---------- تحقق العميل (نفس قواعد الخادم) ----------
    // الجولة 45 — البلاغ الحرفي: «حقل الاسم واللقب يجب ان يكون اسمين فقط لا يقبل اكثر»
    const nameWords = name.trim().split(/\s+/).filter(Boolean)
    if (name.trim().length < 3 || nameWords.length !== 2) {
      return failField(
        'name',
        nameWords.length > 2
          ? 'اسمين فقط — لا يقبل أكثر من الاسم واللقب (مثال: أحمد صالح)'
          : 'أدخل اسماً ولقباً فقط — كلمتين حصراً في حقل واحد (مثال: أحمد صالح)'
      )
    }
    if (!/^7\d{8}$/.test(phone)) {
      return failField('phone', 'رقم الهاتف يجب أن يبدأ بـ 7 ويتكوّن من 9 أرقام فقط — مثال: 773178684')
    }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      return failField('password', 'كلمة المرور يجب أن تكون 8 أحرف على الأقل وتحتوي حروفاً وأرقاماً')
    }
    if (role === 'NURSE' || role === 'DOCTOR') {
      if (specialty.trim().length === 0) {
        return failField(
          'specialty',
          role === 'DOCTOR'
            ? 'التخصص مطلوب — اختر التخصص الطبي من القائمة'
            : 'التخصص مطلوب — اختر القسم من القائمة'
        )
      }
      if (yearsOfExperience === '') {
        return failField('yearsOfExperience', 'سنوات الخبرة مطلوبة — أدخل عدد السنوات (0 للمتخرج الجديد)')
      }
      if (!/^\d+$/.test(yearsOfExperience) || Number(yearsOfExperience) > 50) {
        return failField('yearsOfExperience', 'سنوات الخبرة يجب أن تكون رقماً صحيحاً بين 0 و 50')
      }
      if (!qualification) {
        return failField(
          'qualification',
          role === 'DOCTOR'
            ? 'المؤهل العلمي مطلوب — اختر من القائمة (بكالوريوس طب وجراحة / ماجستير / دكتوراه / شهادة زمالة)'
            : 'المؤهل العلمي مطلوب — اختر من القائمة (أورديلي / دبلوم / بكالوريوس)'
        )
      }
      if (!gender) {
        return failField('gender', 'الجنس مطلوب — اختر ذكر أو أنثى')
      }
    }
    if (role === 'RECEIVER') {
      if (orgMode === 'existing' && !orgId) {
        return failField('org', 'اختر الجهة الصحية من القائمة أو أضفها كجهة جديدة')
      }
      if (orgMode === 'new' && newOrg.name.trim().length < 2) {
        return failField('org', 'أدخل اسم الجهة الصحية الجديدة')
      }
    }

    const payload: Record<string, unknown> = { role, name: name.trim(), phone, password }

    if (role === 'NURSE' || role === 'DOCTOR') {
      payload.specialty = specialty.trim() // إجباري
      payload.qualification = qualification
      payload.yearsOfExperience = Number(yearsOfExperience) // إجباري (0 للمتخرج الجديد)
      payload.gender = gender
    } else if (orgMode === 'existing') {
      const org = orgs.find((o) => o.id === orgId)
      payload.hospitalName = org?.name ?? ''
    } else {
      payload.hospitalName = newOrg.name.trim()
      payload.newOrg = {
        type: newOrg.type,
        city: newOrg.city,
        address: newOrg.address,
        phone: newOrg.phone,
      }
    }

    setSubmitting(true)
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      // أخطاء الخادم (500): نستعلم /api/health ونسمّي السبب الحقيقي
      if (response.status >= 500) {
        setError(await getServerIssueMessage())
        return
      }

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        const msg: string = data?.error ?? 'تعذر إنشاء الحساب، حاول مرة أخرى'
        // الجولة 45: أخطاء الخادم تُفلش إلى الحقل المعنيّ (اهتزاز + أحمر + تمرير)
        const FIELD_MATCHERS: Array<[RegExp, string]> = [
          [/الاسم/, 'name'],
          [/الهاتف|رقم/, 'phone'],
          [/كلمة المرور/, 'password'],
          [/التخصص|القسم/, 'specialty'],
          [/سنوات|الخبرة/, 'yearsOfExperience'],
          [/المؤهل/, 'qualification'],
          [/الجهة/, 'org'],
        ]
        const hit = FIELD_MATCHERS.find(([re]) => re.test(msg))
        if (hit) failField(hit[1], msg)
        setError(msg)
        return
      }

      toast.success(data?.message ?? 'تم إنشاء الحساب بنجاح')
      router.push('/login')
    } catch {
      setError('حدث خطأ في الاتصال بالخدمة، حاول مرة أخرى')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* ---------- رأس الصفحة ---------- */}
      <div className="space-y-3 text-center lg:text-start">
        <span className="brand-gradient mx-auto flex size-12 items-center justify-center rounded-2xl text-white shadow-lg shadow-primary/25 lg:mx-0">
          <UserPlus className="size-6" />
        </span>
        <div className="space-y-1.5">
          <h1 className="text-2xl font-extrabold">إنشاء حساب جديد</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            سجّل في منصة تكليفات | Takleefat — اختر نوع الحساب المناسب لك ثم أكمل البيانات،
            وسيصلك إشعار فوري بعد مراجعة الإدارة واعتماد حسابك
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={onSubmit} className="space-y-7" noValidate>
        {/* ---------- ① اختيار نوع الحساب — بطاقات غنية ---------- */}
        <section className="space-y-3">
          <SectionHead step={1} title="اختر نوع الحساب" hint="نوع الحساب يحدد لوحتك وصلاحياتك داخل المنصة" />

          <div className="grid gap-2.5" role="radiogroup" aria-label="نوع الحساب">
            {ROLE_CARDS.map((r) => {
              const active = role === r.id
              const Icon = r.icon
              return (
                <button
                  key={r.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setRole(r.id)}
                  className={`group relative flex items-center gap-3 rounded-2xl border-2 p-3.5 text-start transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                    active ? `${r.selected} shadow-sm ring-2` : 'border-border bg-card hover:border-primary/40'
                  }`}
                >
                  <span
                    className={`flex size-12 shrink-0 items-center justify-center rounded-xl transition-colors ${
                      active ? r.iconActive : 'bg-secondary text-muted-foreground group-hover:text-primary'
                    }`}
                  >
                    <Icon className="size-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-extrabold">
                      {r.title}
                      {active && <BadgeCheck className="size-4 text-primary" />}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{r.desc}</span>
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      {r.chips.map((c) => (
                        <span
                          key={c}
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors ${
                            active ? r.iconActive : 'bg-secondary text-muted-foreground'
                          }`}
                        >
                          {c}
                        </span>
                      ))}
                    </span>
                  </span>
                  {active && (
                    <span
                      className={`absolute -top-2.5 end-3 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold text-white shadow-sm ${r.badge}`}
                    >
                      <BadgeCheck className="size-3" />
                      مُحدد
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* ماذا بعد التسجيل؟ — يتبع نوع الحساب المختار */}
          <div className="flex items-start gap-3 rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-3.5">
            <Info className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-extrabold text-primary">
                ماذا بعد التسجيل كـ{role === 'NURSE' ? 'كادر تمريضي' : role === 'DOCTOR' ? 'طبيب' : 'مستلم إداري'}؟
              </p>
              <ol className="mt-1.5 space-y-1.5">
                {NEXT_STEPS[role].map((s, i) => (
                  <li key={s} className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                    <span className="mt-px flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-extrabold text-primary">
                      {i + 1}
                    </span>
                    {s}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* ---------- ② البيانات الأساسية ---------- */}
        <section className="space-y-4">
          <SectionHead step={2} title="البيانات الأساسية" hint="بيانات الدخول والتواصل — تأكد من صحتها" />

          {/* الاسم مع اللقب — حقل واحد: اسمين حصراً (الجولة 45) */}
          <div id="reg-name-wrap" {...fieldWrap('name')}>
            <Label htmlFor="name">الاسم واللقب — اسمين فقط *</Label>
            <Input
              id="name"
              placeholder="مثال: أحمد صالح — لا تُضف أسماء وسطى"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                clearFieldError('name')
              }}
            />
            {fieldErrors.name ? (
              <p className="text-[11px] font-bold text-red-600">{fieldErrors.name}</p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                الاسم واللقب فقط — كلمتان اثنتان ولا يقبل أكثر أو أقل
              </p>
            )}
          </div>

          {/* الهاتف — 9 أرقام حصراً */}
          <div id="reg-phone-wrap" {...fieldWrap('phone')}>
            <Label htmlFor="phone">رقم الهاتف *</Label>
            <div className="relative">
              <PhoneIcon className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="phone"
                type="tel"
                inputMode="numeric"
                dir="ltr"
                maxLength={9}
                placeholder="7xxxxxxxx"
                className="ps-10 text-start"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value.replace(/\D/g, '').slice(0, 9))
                  clearFieldError('phone')
                }}
              />
            </div>
            {fieldErrors.phone ? (
              <p className="text-[11px] font-bold text-red-600">{fieldErrors.phone}</p>
            ) : (
              <p className="text-[11px] text-muted-foreground">9 أرقام فقط — يبدأ بـ 7</p>
            )}
          </div>
        </section>

        {/* ---------- ③ البيانات المهنية / الجهة الصحية ---------- */}
        <section className="space-y-4">
          {(role === 'NURSE' || role === 'DOCTOR') ? (
            <SectionHead
              step={3}
              title={role === 'DOCTOR' ? 'البيانات المهنية — الطبيب' : 'البيانات المهنية — الكادر'}
              hint={role === 'DOCTOR' ? 'تخصصك الطبي ومؤهلك من كتالوج الإدارة' : 'قسم عملك ومؤهلك من كتالوج الإدارة'}
            />
          ) : (
            <SectionHead step={3} title="الجهة الصحية" hint="الجهة التي تمثلها وتُنشر تكليفاتك باسمها" />
          )}

          {/* ---------- حقول الكادر التمريضي والطبيب (منظومة الأطباء) ---------- */}
          {(role === 'NURSE' || role === 'DOCTOR') && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                {/* التخصص — إجباري من كتالوجات الإدارة (أقسام للكادر / تخصصات طبية للطبيب) */}
                <div id="reg-specialty-wrap" {...fieldWrap('specialty')}>
                  <Label htmlFor="specialty">{role === 'DOCTOR' ? 'التخصص الطبي *' : 'التخصص *'}</Label>
                  {(role === 'DOCTOR' ? specialties : departments).length === 0 ? (
                    <>
                      <Input
                        id="specialty"
                        placeholder={role === 'DOCTOR' ? 'مثال: باطنية' : 'مثال: تمريض طوارئ'}
                        value={specialty}
                        onChange={(e) => {
                          setSpecialty(e.target.value)
                          clearFieldError('specialty')
                        }}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        القائمة غير متوفرة حالياً — اكتب تخصصك يدوياً
                      </p>
                    </>
                  ) : (
                    <>
                      <Select
                        value={specialty}
                        onValueChange={(v) => {
                          setSpecialty(v)
                          clearFieldError('specialty')
                        }}
                      >
                        <SelectTrigger id="specialty">
                          <SelectValue placeholder={role === 'DOCTOR' ? 'اختر التخصص الطبي' : 'اختر القسم / التخصص'} />
                        </SelectTrigger>
                        <SelectContent>
                          {(role === 'DOCTOR' ? specialties : departments).map((d) => (
                            <SelectItem key={d.id} value={d.name}>
                              {d.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {fieldErrors.specialty && (
                        <p className="text-[11px] font-bold text-red-600">{fieldErrors.specialty}</p>
                      )}
                    </>
                  )}
                </div>
                {/* سنوات الخبرة — إجبارية */}
                <div id="reg-yearsOfExperience-wrap" {...fieldWrap('yearsOfExperience')}>
                  <Label htmlFor="yearsOfExperience">سنوات الخبرة *</Label>
                  <Input
                    id="yearsOfExperience"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={50}
                    placeholder="مثال: 5 — أو 0 للمتخرج الجديد"
                    value={yearsOfExperience}
                    onChange={(e) => {
                      setYearsOfExperience(e.target.value)
                      clearFieldError('yearsOfExperience')
                    }}
                  />
                  {fieldErrors.yearsOfExperience ? (
                    <p className="text-[11px] font-bold text-red-600">{fieldErrors.yearsOfExperience}</p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      إجباري — أدخل 0 إذا كنت متخرجاً جديداً بلا خبرة
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* المؤهل العلمي — خيارات الدور (3 للكادر / 4 للطبيب) */}
                <div id="reg-qualification-wrap" {...fieldWrap('qualification')}>
                  <Label htmlFor="qualification">المؤهل العلمي *</Label>
                  <Select
                    value={qualification}
                    onValueChange={(v) => {
                      setQualification(v)
                      clearFieldError('qualification')
                    }}
                  >
                    <SelectTrigger id="qualification">
                      <SelectValue placeholder="اختر المؤهل" />
                    </SelectTrigger>
                    <SelectContent>
                      {(role === 'DOCTOR' ? doctorQuals : nurseQuals).map((q) => (
                        <SelectItem key={q.value} value={q.value}>
                          {q.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldErrors.qualification ? (
                    <p className="text-[11px] font-bold text-red-600">{fieldErrors.qualification}</p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      {role === 'DOCTOR'
                        ? 'بكالوريوس طب وجراحة — ماجستير — دكتوراه — شهادة زمالة'
                        : 'أورديلي سنة — دبلوم ثلاث سنوات — بكالوريوس أربع سنوات'}
                    </p>
                  )}
                </div>
                {/* الجنس — إجباري */}
                <div id="reg-gender-wrap" {...fieldWrap('gender')}>
                  <Label>الجنس *</Label>
                  <Select
                    value={gender}
                    onValueChange={(v) => {
                      setGender(v)
                      clearFieldError('gender')
                    }}
                  >
                    <SelectTrigger id="reg-gender">
                      <SelectValue placeholder="اختر الجنس" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MALE">ذكر</SelectItem>
                      <SelectItem value="FEMALE">أنثى</SelectItem>
                    </SelectContent>
                  </Select>
                  {fieldErrors.gender ? (
                    <p className="text-[11px] font-bold text-red-600">{fieldErrors.gender}</p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">إجباري — ذكر أو أنثى</p>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ---------- الجهة الصحية للمستلم الإداري ---------- */}
          {role === 'RECEIVER' && (
            <div
              id="reg-org-wrap"
              className={cn(
                'space-y-4 rounded-2xl border p-4',
                fieldErrors.org
                  ? 'field-error field-error-shake border-red-400 bg-red-50/30'
                  : 'border-primary/20 bg-primary/5'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <Label className="flex items-center gap-2">
                  <Hospital className="size-4 text-primary" />
                  الجهة الصحية التي تمثلها *
                </Label>
                {/* التبديل بين قائمة الإدارة والجهة الجديدة */}
                <div className="flex gap-1 rounded-lg border bg-background p-0.5">
                  <button
                    type="button"
                    onClick={() => setOrgMode('existing')}
                    className={`rounded-md px-2.5 py-1 text-xs font-bold transition-colors ${
                      orgMode === 'existing' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    من القائمة
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrgMode('new')}
                    className={`rounded-md px-2.5 py-1 text-xs font-bold transition-colors ${
                      orgMode === 'new' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    جهة جديدة
                  </button>
                </div>
              </div>

              {orgMode === 'existing' ? (
                <div className="space-y-2">
                  <Select
                    value={orgId}
                    onValueChange={(v) => {
                      setOrgId(v)
                      clearFieldError('org')
                    }}
                  >
                    <SelectTrigger id="reg-org">
                      <SelectValue placeholder="اختر الجهة الصحية من قائمة الإدارة" />
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
                  {fieldErrors.org ? (
                    <p className="text-xs font-bold text-red-600">{fieldErrors.org}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      نفس الجهات الصحية المعتمدة المضافة من حساب الإدارة
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-primary">
                    <PlusCircle className="size-4" />
                    جهة صحية جديدة — تُضاف لجهات الإدارة وتُعتمد أو تُرفض بعد المراجعة
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newOrgName">اسم الجهة الصحية *</Label>
                    <Input
                      id="newOrgName"
                      placeholder="مثال: مستشفى الخير التخصصي"
                      value={newOrg.name}
                      onChange={(e) => {
                        setNewOrg({ ...newOrg, name: e.target.value })
                        clearFieldError('org')
                      }}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>نوع الجهة</Label>
                      <Select
                        value={newOrg.type}
                        onValueChange={(v) => setNewOrg({ ...newOrg, type: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ORG_TYPE_OPTIONS.map((t) => (
                            <SelectItem key={t} value={t}>
                              {ORG_TYPE_LABELS[t]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="newOrgCity">المدينة</Label>
                      <Input
                        id="newOrgCity"
                        placeholder="مثال: صنعاء"
                        value={newOrg.city}
                        onChange={(e) => setNewOrg({ ...newOrg, city: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="newOrgAddress">المنطقة / العنوان</Label>
                      <Input
                        id="newOrgAddress"
                        placeholder="مثال: شارع حدة"
                        value={newOrg.address}
                        onChange={(e) => setNewOrg({ ...newOrg, address: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="newOrgPhone">رقم تواصل الجهة</Label>
                      <Input
                        id="newOrgPhone"
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
            </div>
          )}
        </section>

        {/* ---------- ④ كلمة المرور + مؤشر القوة ---------- */}
        <section className="space-y-4">
          <SectionHead step={4} title="أمان الحساب" hint="كلمة مرور قوية تحمي حسابك المهني" />

          <div id="reg-password-wrap" {...fieldWrap('password')}>
            <Label htmlFor="password">كلمة المرور *</Label>
            <div className="relative">
              <Lock className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="8 أحرف على الأقل مع حروف وأرقام"
                className="ps-10 pe-10"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  clearFieldError('password')
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>

            {/* مؤشر قوة كلمة المرور الحي */}
            {password.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="flex gap-1" aria-hidden="true">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                        i < pwScore ? pw.bar : 'bg-secondary'
                      }`}
                    />
                  ))}
                </div>
                <p className={`text-[11px] font-extrabold ${pw.text}`}>
                  قوة كلمة المرور: {pw.label}
                  {pwScore < 4 && (
                    <span className="ms-1.5 font-normal text-muted-foreground">
                      (8+ أحرف، حروف وأرقام، 12+ حرفاً، رمز خاص = الأقوى)
                    </span>
                  )}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* ---------- زر الإنشاء ---------- */}
        <Button type="submit" size="lg" className="w-full gap-2 text-base" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="size-5 animate-spin" />
              جارٍ إنشاء الحساب...
            </>
          ) : (
            <>
              <UserPlus className="size-5" />
              إنشاء الحساب
            </>
          )}
        </Button>
      </form>

      {/* ---------- شارات الثقة ---------- */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {TRUST_CHIPS.map((t) => (
          <span
            key={t.text}
            className="flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-[11px] font-bold text-muted-foreground"
          >
            <t.icon className="size-3.5 text-primary" />
            {t.text}
          </span>
        ))}
      </div>

      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        بإنشاء حسابك في تكليفات فإنك توافق على أن تتم مراجعة بياناتك ومستنداتك من قبل إدارة المنصة
        قبل تفعيل الحساب — سواء كان حساب كادر تمريضي أو طبيب أو مستلم إداري.
      </p>

      <p className="text-center text-sm text-muted-foreground">
        لديك حساب بالفعل؟{' '}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          تسجيل الدخول
        </Link>
      </p>
    </div>
  )
}
