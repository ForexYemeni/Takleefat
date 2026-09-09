'use client'

import { useEffect, useState } from 'react'
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
import { QUALIFICATION_OPTIONS } from '@/lib/utils'
import { ORG_TYPE_LABELS } from '@/lib/network'
import { getServerIssueMessage } from '@/lib/client-diagnostics'

/**
 * صفحة التسجيل — الجولة الثامنة:
 * - الاسم مع اللقب فقط (حقلان: الاسم + اللقب) للكادر والمستلم
 * - الهاتف 9 أرقام حصراً (maxLength=9)
 * - كلمة المرور مرة واحدة دون تأكيد
 * - الكادر: التخصص اختياري (أقسام الإدارة) + المؤهل من 3 خيارات + الجنس إجباري + خبرة بلا صفر افتراضي
 * - المستلم: الجهة من جهات الإدارة أو جهة جديدة مع بقية بياناتها تُرفع للاعتماد
 */

interface PublicOrg {
  id: string
  name: string
  type: string
  city: string | null
}

const ORG_TYPE_OPTIONS = ['HOSPITAL', 'MEDICAL_CENTER', 'SPECIALIZED_CENTER', 'CLINIC', 'MEDICAL_COMPLEX', 'OTHER'] as const

export default function RegisterPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // كتالوجات الإدارة للقوائم (نقاط نهاية عامة)
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([])
  const [orgs, setOrgs] = useState<PublicOrg[]>([])

  // حقول مشتركة
  const [role, setRole] = useState<'NURSE' | 'RECEIVER'>('NURSE')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')

  // حقول الكادر التمريضي
  const [specialty, setSpecialty] = useState('') // اختياري
  const [qualification, setQualification] = useState('')
  const [yearsOfExperience, setYearsOfExperience] = useState('') // فارغ بدل 0
  const [gender, setGender] = useState('')

  // الجهة الصحية للمستلم الإداري
  const [orgMode, setOrgMode] = useState<'existing' | 'new'>('existing')
  const [orgId, setOrgId] = useState('')
  const [newOrg, setNewOrg] = useState({ name: '', type: 'HOSPITAL', city: '', address: '', phone: '' })

  useEffect(() => {
    fetch('/api/departments/public')
      .then((r) => r.json())
      .then((d) => setDepartments(d.departments ?? []))
      .catch(() => null)
    fetch('/api/hospitals/public')
      .then((r) => r.json())
      .then((d) => setOrgs(d.hospitals ?? []))
      .catch(() => null)
  }, [])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // ---------- تحقق العميل (نفس قواعد الخادم) ----------
    if (firstName.trim().length < 2) return setError('أدخل الاسم الأول')
    if (lastName.trim().length < 2) return setError('أدخل اللقب — الاسم مع اللقب فقط')
    if (!/^7\d{8}$/.test(phone)) {
      return setError('رقم الهاتف يجب أن يبدأ بـ 7 ويتكوّن من 9 أرقام فقط — مثال: 773178684')
    }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      return setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل وتحتوي حروفاً وأرقاماً')
    }
    if (role === 'NURSE' && !qualification) {
      return setError('المؤهل العلمي مطلوب — اختر من القائمة (أورديلي / دبلوم / بكالوريوس)')
    }
    if (role === 'NURSE' && !gender) {
      return setError('الجنس مطلوب — اختر ذكر أو أنثى')
    }
    if (role === 'RECEIVER') {
      if (orgMode === 'existing' && !orgId) {
        return setError('اختر الجهة الصحية من القائمة أو أضفها كجهة جديدة')
      }
      if (orgMode === 'new' && newOrg.name.trim().length < 2) {
        return setError('أدخل اسم الجهة الصحية الجديدة')
      }
    }

    const name = `${firstName.trim()} ${lastName.trim()}`
    const payload: Record<string, unknown> = { role, name, phone, password }

    if (role === 'NURSE') {
      payload.specialty = specialty || undefined
      payload.qualification = qualification
      payload.yearsOfExperience = yearsOfExperience === '' ? 0 : Number(yearsOfExperience)
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
        setError(data?.error ?? 'تعذر إنشاء الحساب، حاول مرة أخرى')
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
      <div className="space-y-2 text-center lg:text-start">
        <h1 className="text-2xl font-extrabold">إنشاء حساب جديد</h1>
        <p className="text-sm text-muted-foreground">
          سجّل في منصة تكليفات | Takleefat — اختر نوع الحساب ثم أكمل البيانات، وسيتم اعتماد حسابك
          بعد مراجعته من الإدارة
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* اختيار نوع الحساب */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setRole('NURSE')}
          className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-colors ${
            role === 'NURSE'
              ? 'border-primary bg-primary/5 text-primary'
              : 'border-border text-muted-foreground hover:border-primary/40'
          }`}
        >
          <Stethoscope className="size-6" />
          <span className="text-sm font-bold">كادر تمريضي</span>
        </button>
        <button
          type="button"
          onClick={() => setRole('RECEIVER')}
          className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-colors ${
            role === 'RECEIVER'
              ? 'border-primary bg-primary/5 text-primary'
              : 'border-border text-muted-foreground hover:border-primary/40'
          }`}
        >
          <ClipboardCheck className="size-6" />
          <span className="text-sm font-bold">مستلم إداري</span>
        </button>
      </div>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {/* الاسم مع اللقب فقط */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="firstName">الاسم *</Label>
            <Input
              id="firstName"
              placeholder="مثال: أحمد"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">اللقب *</Label>
            <Input
              id="lastName"
              placeholder="مثال: صالح"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              الاسم مع اللقب فقط — دون الأسماء الوسطى
            </p>
          </div>
        </div>

        {/* الهاتف — 9 أرقام حصراً */}
        <div className="space-y-2">
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
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">9 أرقام فقط — يبدأ بـ 7</p>
        </div>

        {/* ---------- حقول الكادر التمريضي ---------- */}
        {role === 'NURSE' && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {/* التخصص — اختياري من أقسام الإدارة */}
              <div className="space-y-2">
                <Label htmlFor="specialty">التخصص (اختياري)</Label>
                <Select value={specialty} onValueChange={setSpecialty}>
                  <SelectTrigger id="specialty">
                    <SelectValue placeholder="اختر القسم إن وجد" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=" ">بلا تخصص محدد</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.name}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  نفس الأقسام التي تُعمل بها التكليفات — تُدار من حساب الإدارة
                </p>
              </div>
              {/* سنوات الخبرة — بلا صفر افتراضي */}
              <div className="space-y-2">
                <Label htmlFor="yearsOfExperience">سنوات الخبرة (اختياري)</Label>
                <Input
                  id="yearsOfExperience"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={50}
                  placeholder="أدخل عدد السنوات"
                  value={yearsOfExperience}
                  onChange={(e) => setYearsOfExperience(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* المؤهل العلمي — 3 خيارات ثابتة */}
              <div className="space-y-2">
                <Label htmlFor="qualification">المؤهل العلمي *</Label>
                <Select value={qualification} onValueChange={setQualification}>
                  <SelectTrigger id="qualification">
                    <SelectValue placeholder="اختر المؤهل" />
                  </SelectTrigger>
                  <SelectContent>
                    {QUALIFICATION_OPTIONS.map((q) => (
                      <SelectItem key={q.value} value={q.value}>
                        {q.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  أورديلي سنة — دبلوم ثلاث سنوات — بكالوريوس أربع سنوات
                </p>
              </div>
              {/* الجنس — إجباري */}
              <div className="space-y-2">
                <Label>الجنس *</Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الجنس" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MALE">ذكر</SelectItem>
                    <SelectItem value="FEMALE">أنثى</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">إجباري — ذكر أو أنثى</p>
              </div>
            </div>
          </>
        )}

        {/* ---------- الجهة الصحية للمستلم الإداري ---------- */}
        {role === 'RECEIVER' && (
          <div className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
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
                <Select value={orgId} onValueChange={setOrgId}>
                  <SelectTrigger>
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
                <p className="text-xs text-muted-foreground">
                  نفس الجهات الصحية المعتمدة المضافة من حساب الإدارة
                </p>
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
                    onChange={(e) => setNewOrg({ ...newOrg, name: e.target.value })}
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

        {/* كلمة المرور — مرة واحدة دون تأكيد */}
        <div className="space-y-2">
          <Label htmlFor="password">كلمة المرور *</Label>
          <div className="relative">
            <Lock className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="8 أحرف على الأقل مع حروف وأرقام"
              className="ps-10 pe-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
        </div>

        <Button type="submit" className="w-full gap-2" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              جارٍ إنشاء الحساب...
            </>
          ) : (
            <>
              <UserPlus className="size-4" />
              إنشاء الحساب
            </>
          )}
        </Button>
      </form>

      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        بإنشاء حسابك في تكليفات فإنك توافق على أن تتم مراجعة بياناتك ومستنداتك من قبل إدارة المنصة
        قبل تفعيل الحساب — سواء كان حساب كادر تمريضي أو مستلم إداري.
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
