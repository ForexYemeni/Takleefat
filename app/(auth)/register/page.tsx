'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  UserPlus,
  PhoneIcon,
  Lock,
  User,
  Users,
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
  Check,
  Pencil,
  CheckCircle2,
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
 * صفحة التسجيل — معالج متعدد الخطوات (الجولة 53):
 * 4 خطوات قصيرة بدل نموذج واحد طويل — خطوة واحدة في كل مرة مع شريط تقدم حي،
 * تحقق فوري لكل خطوة قبل الانتقال، شاشة مراجعة قبل الإنشاء، وشاشة نجاح متحركة.
 *
 * العقد مع الخادم لم يُمس بذرة واحدة (منظومة الأطباء — نفس قواعد الجولات 30/32/45):
 *   الكادر: التخصص إجباري (أقسام الإدارة) | الطبيب: التخصص الطبي (كتالوج مستقل) ومؤهلات خاصة
 *   المستلم: الجهة من جهات الإدارة أو جهة جديدة تُرفع للاعتماد
 *   نفس حمولة POST /api/auth/register حرفياً + اهتزاز الحقول الخاطئة وتلوينها (الجولة 45)
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
    title: 'كادر صحي',
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

const ROLE_LABELS: Record<'NURSE' | 'RECEIVER' | 'DOCTOR', string> = {
  NURSE: 'كادر صحي',
  DOCTOR: 'طبيب',
  RECEIVER: 'مستلم إداري',
}

/** خطوات المعالج الأربع */
const STEPS = [
  { n: 1, title: 'نوع الحساب', desc: 'من أنت داخل المنصة؟', icon: Users },
  { n: 2, title: 'بياناتك الأساسية', desc: 'الاسم ورقم الهاتف', icon: User },
  { n: 3, title: 'بياناتك المهنية', desc: 'التخصص والمؤهل', icon: Stethoscope },
  { n: 4, title: 'أمان الحساب', desc: 'كلمة المرور والمراجعة', icon: ShieldCheck },
]

/** صياغة سنوات الخبرة بصياغة عربية سليمة في شاشة المراجعة */
function experienceLabel(raw: string): string {
  if (raw === '') return '—'
  const n = Number(raw)
  if (n === 0) return 'حديث التخرج — بلا خبرة'
  if (n === 1) return 'سنة واحدة'
  if (n === 2) return 'سنتان'
  if (n >= 3 && n <= 10) return `${n} سنوات`
  return `${n} سنة`
}

export default function RegisterPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState(false)

  // حالة المعالج: الخطوة الحالية + اتجاه الانتقال لحركة انزلاق اتجاهية
  const [step, setStep] = useState(1)
  const [dir, setDir] = useState<1 | -1>(1)

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

  // حقول الكادر الصحي
  const [specialty, setSpecialty] = useState('') // إجباري — من أقسام الإدارة
  const [qualification, setQualification] = useState('')
  const [yearsOfExperience, setYearsOfExperience] = useState('') // إجباري — يبدأ فارغاً
  const [gender, setGender] = useState('')

  // الجهة الصحية للمستلم الإداري
  const [orgMode, setOrgMode] = useState<'existing' | 'new'>('existing')
  const [orgId, setOrgId] = useState('')
  const [newOrg, setNewOrg] = useState({ name: '', type: 'HOSPITAL', city: '', address: '', phone: '' })

  // الجولة 45 — «عند وجود اي خطاء في اي حقل يجب ان يهتز الحقل ويتلون للون الاحمر
  // مع عودة الى نفس الحقل»: fieldErrors + shakeTick لإعادة تشغيل الاهتزاز
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [shakeTick, setShakeTick] = useState(0)

  /** تسجيل خطأ حقل: تلوينه أحمر + اهتزازه + تركيزه */
  const failField = (field: string, message: string): false => {
    setFieldErrors((prev) => ({ ...prev, [field]: message }))
    setError(message)
    setShakeTick((t) => t + 1)
    window.setTimeout(() => {
      const wrap = document.getElementById(`reg-${field}-wrap`)
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

  /** صنف غلاف الحقل: اهتزاز + أحمر عند وجود خطأ */
  const fieldWrap = (field: string) =>
    cn('space-y-2', fieldErrors[field] && 'field-error field-error-shake')

  /** مفتاح إعادة تركيب غلاف الحقل لإعادة تشغيل حركة الاهتزاز (React 19: key يُمرّر مباشرة) */
  const fk = (field: string) => `${field}-${fieldErrors[field] ? shakeTick : 'ok'}`

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

  // مؤشرات الصلاحية الحية للحقول (علامة خضراء فورية أثناء الكتابة)
  const nameValid = useMemo(() => {
    const words = name.trim().split(/\s+/).filter(Boolean)
    return name.trim().length >= 3 && words.length === 2
  }, [name])
  const phoneValid = /^7\d{8}$/.test(phone)
  const passwordValid = password.length >= 8 && /[A-Za-z]/.test(password) && /[0-9]/.test(password)

  /** الانتقال بين الخطوات مع اتجاه الحركة */
  const gotoStep = (target: 1 | 2 | 3 | 4) => {
    setDir(target > step ? 1 : -1)
    setStep(target)
    setError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ---------- تحقق كل خطوة (نفس قواعد الخادم حرفياً) ----------
  const validateStep2 = (): boolean => {
    // الجولة 45 — «حقل الاسم واللقب يجب ان يكون اسمين فقط لا يقبل اكثر»
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
    return true
  }

  const validateStep3 = (): boolean => {
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
    return true
  }

  const validateStep4 = (): boolean => {
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      return failField('password', 'كلمة المرور يجب أن تكون 8 أحرف على الأقل وتحتوي حروفاً وأرقاماً')
    }
    return true
  }

  const goNext = () => {
    setError(null)
    if (step === 2 && !validateStep2()) return
    if (step === 3 && !validateStep3()) return
    gotoStep((step + 1) as 2 | 3 | 4)
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Enter في أي خطوة = «متابعة» — الإنشاء الفعلي في الخطوة 4 فقط
    if (step < 4) {
      goNext()
      return
    }
    setError(null)
    if (!validateStep4()) return

    // ---------- بناء الحمولة — نفس العقد الحرفي مع /api/auth/register ----------
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
        // الجولة 45: أخطاء الخادم تُفلش إلى الحقل المعنيّ (اهتزاز + أحمر)
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
      setCreated(true)
      window.setTimeout(() => router.push('/login'), 2800)
    } catch {
      setError('حدث خطأ في الاتصال بالخدمة، حاول مرة أخرى')
    } finally {
      setSubmitting(false)
    }
  }

  // ============ شاشة النجاح — بعد إنشاء الحساب ============
  if (created) {
    return (
      <div className="auth-rise mx-auto max-w-md space-y-7 py-8 text-center">
        <div className="success-pop mx-auto flex size-24 items-center justify-center rounded-full bg-emerald-100 shadow-lg shadow-emerald-500/20 dark:bg-emerald-950">
          <svg viewBox="0 0 52 52" fill="none" className="size-12" aria-hidden="true">
            <circle cx="26" cy="26" r="23" strokeWidth="2.5" className="stroke-emerald-400/60" />
            <path
              d="M15 27l8 8 15-15"
              strokeWidth="4.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="draw-check stroke-emerald-500 dark:stroke-emerald-400"
            />
          </svg>
        </div>
        <div className="space-y-2.5">
          <h1 className="text-2xl font-black sm:text-3xl">تم إنشاء حسابك بنجاح</h1>
          <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
            حسابك الآن <span className="font-extrabold text-foreground">بانتظار اعتماد الإدارة</span> —
            سيصلك إشعار فوري بعد المراجعة، وعندها يمكنك تسجيل الدخول مباشرة.
          </p>
        </div>
        <Button
          size="lg"
          onClick={() => router.push('/login')}
          className="brand-gradient h-12 w-full gap-2 rounded-xl text-base font-extrabold text-white shadow-lg shadow-primary/30"
        >
          تسجيل الدخول الآن
          <ArrowLeft className="size-5" />
        </Button>
        <p className="text-xs text-muted-foreground">سيتم تحويلك تلقائياً إلى صفحة الدخول خلال لحظات...</p>
      </div>
    )
  }

  // ============ المعالج — 4 خطوات ============
  const stepMeta = STEPS[step - 1]
  const StepIcon = stepMeta.icon
  const step3Title = role === 'RECEIVER' ? 'جهتك الصحية' : 'بياناتك المهنية'
  const step3Desc = role === 'RECEIVER' ? 'الجهة التي تمثلها' : 'التخصص والمؤهل'
  const progressPct = Math.round(((step - 1) / 3) * 100)

  // صفوف شاشة المراجعة — حسب نوع الحساب
  const REVIEW_ROWS: Array<{ label: string; value: string; editStep: 1 | 2 | 3 }> = [
    { label: 'نوع الحساب', value: ROLE_LABELS[role], editStep: 1 },
    { label: 'الاسم واللقب', value: name.trim(), editStep: 2 },
    { label: 'رقم الهاتف', value: phone, editStep: 2 },
  ]
  if (role === 'NURSE' || role === 'DOCTOR') {
    REVIEW_ROWS.push(
      { label: role === 'DOCTOR' ? 'التخصص الطبي' : 'التخصص / القسم', value: specialty, editStep: 3 },
      { label: 'سنوات الخبرة', value: experienceLabel(yearsOfExperience), editStep: 3 },
      { label: 'المؤهل العلمي', value: qualification, editStep: 3 },
      { label: 'الجنس', value: gender === 'MALE' ? 'ذكر' : gender === 'FEMALE' ? 'أنثى' : '—', editStep: 3 }
    )
  } else {
    REVIEW_ROWS.push({
      label: 'الجهة الصحية',
      value: orgMode === 'existing' ? (orgs.find((o) => o.id === orgId)?.name ?? '—') : newOrg.name.trim(),
      editStep: 3,
    })
  }

  return (
    <div className="space-y-6">
      {/* ---------- رأس مختصر ---------- */}
      <div className="auth-rise space-y-3 text-center lg:text-start">
        <span className="relative mx-auto flex size-14 items-center justify-center lg:mx-0" aria-hidden="true">
          <span className="brand-gradient absolute inset-0 flex items-center justify-center rounded-2xl text-white shadow-lg shadow-primary/30">
            <UserPlus className="size-7" />
          </span>
          <span className="absolute inset-0 animate-ping rounded-2xl bg-primary/25 [animation-duration:2.4s]" />
        </span>
        <div className="space-y-1.5">
          <h1 className="text-2xl font-black sm:text-3xl">أنشئ حسابك المهني</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            أربع خطوات سريعة فقط تفصلك عن حسابك — خطوة واحدة في كل مرة، ويمكنك العودة للخلف في أي وقت
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ---------- مؤشر الخطوات + شريط التقدم ---------- */}
      <div className="auth-rise rounded-3xl border bg-card/70 p-4 shadow-sm backdrop-blur-sm sm:p-5" style={{ animationDelay: '60ms' }}>
        <div className="flex items-center" role="list" aria-label="خطوات التسجيل">
          {STEPS.map((s, i) => {
            const done = step > s.n
            const active = step === s.n
            const Icon = s.icon
            const title = s.n === 3 ? step3Title : s.title
            return (
              <div key={s.n} className="contents">
                {/* دائرة الخطوة */}
                <button
                  type="button"
                  role="listitem"
                  aria-current={active ? 'step' : undefined}
                  aria-label={`الخطوة ${s.n}: ${title}${done ? ' — مكتملة' : ''}`}
                  onClick={() => step > s.n && gotoStep(s.n as 1 | 2 | 3)}
                  disabled={s.n >= step}
                  className={cn(
                    'group relative flex shrink-0 flex-col items-center gap-1.5 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                    step > s.n && 'cursor-pointer'
                  )}
                >
                  <span
                    className={cn(
                      'flex size-10 items-center justify-center rounded-full border-2 text-sm font-black transition-all duration-300 sm:size-11',
                      done && 'brand-gradient border-transparent text-white shadow-md shadow-primary/25',
                      active && 'brand-gradient step-pulse border-transparent text-white shadow-md shadow-primary/30',
                      !done && !active && 'border-border bg-muted text-muted-foreground'
                    )}
                  >
                    {done ? <Check className="size-5" strokeWidth={3} /> : <Icon className="size-5" />}
                  </span>
                  <span
                    className={cn(
                      'hidden text-[11px] font-bold transition-colors sm:block',
                      active ? 'text-primary' : done ? 'text-foreground/70' : 'text-muted-foreground'
                    )}
                  >
                    {title}
                  </span>
                </button>
                {/* موصل بين الخطوتين */}
                {i < STEPS.length - 1 && (
                  <div className="relative mx-1.5 h-0.5 flex-1 overflow-hidden rounded-full bg-border sm:mx-2" aria-hidden="true">
                    <span
                      className={cn(
                        'absolute inset-0 origin-right rounded-full transition-all duration-700',
                        step > s.n ? 'brand-gradient scale-x-100' : 'scale-x-0 bg-transparent'
                      )}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {/* شريط التقدم الإجمالي + النسبة */}
        <div className="mt-4 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
            <div className="brand-gradient h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="shrink-0 text-[11px] font-extrabold text-muted-foreground" aria-live="polite">
            الخطوة {step} من 4 — {progressPct}%
          </span>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        {/* ---------- لوحة الخطوة الحالية — انزلاق اتجاهي ---------- */}
        <div key={step} className={cn('rounded-3xl border bg-card/70 p-5 shadow-sm backdrop-blur-sm sm:p-6', dir === 1 ? 'step-in-next' : 'step-in-back')}>
          {/* عنوان الخطوة */}
          <div className="mb-5 flex items-start gap-3 border-b pb-4">
            <span className="brand-gradient flex size-9 shrink-0 items-center justify-center rounded-xl text-white shadow-md shadow-primary/25">
              <StepIcon className="size-4.5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-extrabold leading-tight">
                {step === 3 ? step3Title : stepMeta.title}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{step === 3 ? step3Desc : stepMeta.desc}</p>
            </div>
          </div>

          {/* ================= الخطوة ① نوع الحساب ================= */}
          {step === 1 && (
            <div className="space-y-4">
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
                      className={`group relative flex items-center gap-3 rounded-2xl border-2 p-3.5 text-start transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                        active ? `${r.selected} shadow-md ring-2` : 'border-border bg-card hover:border-primary/40'
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
                  <p className="text-xs font-extrabold text-primary">ماذا بعد التسجيل كـ{ROLE_LABELS[role]}؟</p>
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
            </div>
          )}

          {/* ================= الخطوة ② البيانات الأساسية ================= */}
          {step === 2 && (
            <div className="space-y-5">
              {/* الاسم مع اللقب — حقل واحد: اسمين حصراً (الجولة 45) */}
              <div id="reg-name-wrap" key={fk('name')} className={fieldWrap('name')}>
                <Label htmlFor="name" className="flex items-center justify-between gap-2">
                  <span>الاسم واللقب — اسمين فقط *</span>
                  {nameValid && <CheckCircle2 className="size-4 text-emerald-500" aria-hidden="true" />}
                </Label>
                <div className="relative">
                  <User className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="name"
                    placeholder="مثال: أحمد صالح"
                    className="h-11 rounded-xl ps-10 pe-10"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value)
                      clearFieldError('name')
                    }}
                  />
                  {nameValid && (
                    <CheckCircle2 className="absolute end-3 top-1/2 size-4.5 -translate-y-1/2 text-emerald-500" aria-hidden="true" />
                  )}
                </div>
                {fieldErrors.name ? (
                  <p className="text-[11px] font-bold text-red-600">{fieldErrors.name}</p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    الاسم واللقب فقط — كلمتان اثنتان (مثال: أحمد صالح) دون أسماء وسطى
                  </p>
                )}
              </div>

              {/* الهاتف — 9 أرقام حصراً */}
              <div id="reg-phone-wrap" key={fk('phone')} className={fieldWrap('phone')}>
                <Label htmlFor="phone" className="flex items-center justify-between gap-2">
                  <span>رقم الهاتف *</span>
                  {phoneValid && <CheckCircle2 className="size-4 text-emerald-500" aria-hidden="true" />}
                </Label>
                <div className="relative">
                  <PhoneIcon className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    dir="ltr"
                    maxLength={9}
                    placeholder="7xxxxxxxx"
                    className="h-11 rounded-xl ps-10 pe-10 text-start"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value.replace(/\D/g, '').slice(0, 9))
                      clearFieldError('phone')
                    }}
                  />
                  {phoneValid && (
                    <CheckCircle2 className="absolute end-3 top-1/2 size-4.5 -translate-y-1/2 text-emerald-500" aria-hidden="true" />
                  )}
                </div>
                {fieldErrors.phone ? (
                  <p className="text-[11px] font-bold text-red-600">{fieldErrors.phone}</p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">9 أرقام فقط تبدأ بـ 7 — مثال: 773178684</p>
                )}
              </div>

              <p className="flex items-start gap-2 rounded-xl bg-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
                هذا الرقم هو معرّفك لتسجيل الدخول — تأكد من صحته فلا يمكن تغييره لاحقاً بسهولة
              </p>
            </div>
          )}

          {/* ================= الخطوة ③ البيانات المهنية / الجهة الصحية ================= */}
          {step === 3 && (
            <div className="space-y-5">
              {/* ---------- حقول الكادر الصحي والطبيب (منظومة الأطباء) ---------- */}
              {(role === 'NURSE' || role === 'DOCTOR') && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {/* التخصص — إجباري من كتالوجات الإدارة */}
                    <div id="reg-specialty-wrap" key={fk('specialty')} className={fieldWrap('specialty')}>
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
                            <SelectTrigger id="specialty" className="h-11 rounded-xl">
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
                    <div id="reg-yearsOfExperience-wrap" key={fk('yearsOfExperience')} className={fieldWrap('yearsOfExperience')}>
                      <Label htmlFor="yearsOfExperience">سنوات الخبرة *</Label>
                      <Input
                        id="yearsOfExperience"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={50}
                        placeholder="مثال: 5 — أو 0 للمتخرج الجديد"
                        className="h-11 rounded-xl"
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
                    {/* المؤهل العلمي — خيارات الدور */}
                    <div id="reg-qualification-wrap" key={fk('qualification')} className={fieldWrap('qualification')}>
                      <Label htmlFor="qualification">المؤهل العلمي *</Label>
                      <Select
                        value={qualification}
                        onValueChange={(v) => {
                          setQualification(v)
                          clearFieldError('qualification')
                        }}
                      >
                        <SelectTrigger id="qualification" className="h-11 rounded-xl">
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
                    <div id="reg-gender-wrap" key={fk('gender')} className={fieldWrap('gender')}>
                      <Label>الجنس *</Label>
                      <Select
                        value={gender}
                        onValueChange={(v) => {
                          setGender(v)
                          clearFieldError('gender')
                        }}
                      >
                        <SelectTrigger id="reg-gender" aria-label="الجنس" className="h-11 rounded-xl">
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
                        <SelectTrigger id="reg-org" className="h-11 rounded-xl">
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
            </div>
          )}

          {/* ================= الخطوة ④ أمان الحساب + المراجعة ================= */}
          {step === 4 && (
            <div className="space-y-5">
              {/* مراجعة سريعة — كل شيء قابل للتعديل */}
              <div className="space-y-1 rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-4">
                <p className="mb-2.5 flex items-center gap-2 text-xs font-extrabold text-primary">
                  <CheckCircle2 className="size-4" />
                  راجع بياناتك قبل الإنشاء — كل صف قابل للتعديل
                </p>
                <dl className="divide-y divide-border/60">
                  {REVIEW_ROWS.map((row) => (
                    <div key={row.label} className="flex items-center justify-between gap-3 py-2">
                      <dt className="shrink-0 text-[11px] font-bold text-muted-foreground">{row.label}</dt>
                      <dd className="flex min-w-0 flex-1 items-center justify-end gap-2 text-end">
                        <span className="truncate text-xs font-extrabold">{row.value || '—'}</span>
                        <button
                          type="button"
                          onClick={() => gotoStep(row.editStep)}
                          className="flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-primary transition-colors hover:bg-primary/10"
                          aria-label={`تعديل ${row.label}`}
                        >
                          <Pencil className="size-3" />
                          تعديل
                        </button>
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* كلمة المرور */}
              <div id="reg-password-wrap" key={fk('password')} className={fieldWrap('password')}>
                <Label htmlFor="password" className="flex items-center justify-between gap-2">
                  <span>كلمة المرور *</span>
                  {passwordValid && <CheckCircle2 className="size-4 text-emerald-500" aria-hidden="true" />}
                </Label>
                <div className="relative">
                  <Lock className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="8 أحرف على الأقل مع حروف وأرقام"
                    className="h-11 rounded-xl ps-10 pe-10"
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
                          className={`h-2 flex-1 rounded-full transition-all duration-500 ${
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
            </div>
          )}
        </div>

        {/* ---------- أزرار التنقل بين الخطوات ---------- */}
        <div className="flex items-center gap-3" style={{ animationDelay: '120ms' }}>
          {step > 1 && (
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => gotoStep((step - 1) as 1 | 2 | 3)}
              disabled={submitting}
              className="h-12 gap-1.5 rounded-xl px-5 text-sm font-extrabold"
            >
              <ArrowRight className="size-4.5" />
              السابق
            </Button>
          )}
          {step < 4 ? (
            <Button
              type="submit"
              size="lg"
              className="brand-gradient h-12 flex-1 gap-2 rounded-xl text-base font-extrabold text-white shadow-lg shadow-primary/30 transition-all enabled:hover:scale-[1.01] enabled:active:scale-[0.99]"
            >
              متابعة
              <ArrowLeft className="size-5" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="lg"
              disabled={submitting}
              className="brand-gradient h-12 flex-1 gap-2 rounded-xl text-base font-extrabold text-white shadow-lg shadow-primary/30 transition-all enabled:hover:scale-[1.01] enabled:active:scale-[0.99]"
            >
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
          )}
        </div>
      </form>

      {/* ---------- شارات الثقة ---------- */}
      <div className="auth-rise flex flex-wrap items-center justify-center gap-2" style={{ animationDelay: '160ms' }}>
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
        قبل تفعيل الحساب — سواء كان حساب كادر صحي أو طبيب أو مستلم إداري.
      </p>

      <p className="auth-rise text-center text-sm text-muted-foreground" style={{ animationDelay: '200ms' }}>
        لديك حساب بالفعل؟{' '}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          تسجيل الدخول
        </Link>
      </p>
    </div>
  )
}
