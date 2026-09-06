'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, Loader2, UserPlus, PhoneIcon, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { registerSchema, type RegisterInput, type RegisterFormValues } from '@/lib/validations/auth'
import { getServerIssueMessage } from '@/lib/client-diagnostics'

export default function RegisterPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const form = useForm<RegisterFormValues, unknown, RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      phone: '',
      password: '',
      confirmPassword: '',
      specialty: '',
      qualification: '',
      yearsOfExperience: '0',
    },
  })

  const onSubmit = async (values: RegisterInput) => {
    setError(null)

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })

      // أخطاء الخادم (500): نستعلم /api/health ونسمّي السبب الحقيقي
      // (قاعدة بيانات غير مضبوطة / مفتاح جلسات ناقص) بدلاً من رسالة عامة
      if (response.status >= 500) {
        setError(await getServerIssueMessage())
        return
      }

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        // أخطاء التحقق (422) أو تكرار رقم الهاتف (409) — رسائل عربية من الخادم
        setError(data?.error ?? 'تعذر إنشاء الحساب، حاول مرة أخرى')
        return
      }

      toast.success(data?.message ?? 'تم إنشاء الحساب بنجاح')
      router.push('/login')
    } catch {
      setError('حدث خطأ في الاتصال بالخدمة، حاول مرة أخرى')
    }
  }

  const err = form.formState.errors

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center lg:text-start">
        <h1 className="text-2xl font-extrabold">إنشاء حساب جديد</h1>
        <p className="text-sm text-muted-foreground">
          سجّل في منصة تكليفات | Takleefat — سيتم اعتماد حسابك بعد مراجعة بياناتك من الإدارة
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="name">الاسم الكامل</Label>
          <Input id="name" placeholder="مثال: أحمد محمد علي" {...form.register('name')} />
          {err.name && <p className="text-xs text-destructive">{err.name.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">رقم الهاتف</Label>
          <div className="relative">
            <PhoneIcon className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              dir="ltr"
              placeholder="7xxxxxxxx"
              className="ps-10 text-start"
              {...form.register('phone')}
            />
          </div>
          {err.phone && <p className="text-xs text-destructive">{err.phone.message}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="specialty">التخصص</Label>
            <Input id="specialty" placeholder="مثال: تمريض طوارئ" {...form.register('specialty')} />
            {err.specialty && <p className="text-xs text-destructive">{err.specialty.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="yearsOfExperience">سنوات الخبرة</Label>
            <Input
              id="yearsOfExperience"
              type="number"
              min={0}
              max={50}
              {...form.register('yearsOfExperience')}
            />
            {err.yearsOfExperience && (
              <p className="text-xs text-destructive">{err.yearsOfExperience.message}</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="qualification">المؤهل العلمي</Label>
          <Input id="qualification" placeholder="مثال: بكالوريوس تمريض" {...form.register('qualification')} />
          {err.qualification && <p className="text-xs text-destructive">{err.qualification.message}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="password">كلمة المرور</Label>
            <div className="relative">
              <Lock className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                className="ps-10 pe-10"
                {...form.register('password')}
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
            {err.password && <p className="text-xs text-destructive">{err.password.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">تأكيد كلمة المرور</Label>
            <Input
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              {...form.register('confirmPassword')}
            />
            {err.confirmPassword && (
              <p className="text-xs text-destructive">{err.confirmPassword.message}</p>
            )}
          </div>
        </div>

        <Button type="submit" className="w-full gap-2" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? (
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
        قبل تفعيل الحساب.
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
