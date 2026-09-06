'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, Loader2, LogIn, PhoneIcon, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { loginSchema, type LoginInput } from '@/lib/validations/auth'

const ROLE_HOME: Record<string, string> = {
  ADMIN: '/admin',
  NURSE: '/nurse',
  RECEIVER: '/receiver',
}

/**
 * نموذج تسجيل الدخول — يقرأ callbackUrl من معاملات الرابط
 * لذلك يجب لفّه داخل Suspense boundary أثناء التوليد الساكن.
 */
function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { phone: '', password: '' },
  })

  const onSubmit = async (values: LoginInput) => {
    setError(null)

    // .catch() لالتقاط أعطال الشبكة — signIn يعيد null عند الفشل الكامل
    const result = await signIn('credentials', {
      phone: values.phone,
      password: values.password,
      redirect: false,
    }).catch(() => null)

    if (!result) {
      setError('تعذر الاتصال بالخادم — تحقق من اتصالك بالإنترنت ثم أعد المحاولة')
      return
    }

    if (result?.error) {
      // CredentialsSignin: بيانات خاطئة أو حساب غير معتمد
      // Configuration: مشكلة إعدادات الخادم (المفتاح السري / قاعدة البيانات)
      setError(
        result.error === 'CredentialsSignin'
          ? 'رقم الهاتف أو كلمة المرور غير صحيحة، أو أن الحساب بانتظار الاعتماد أو موقوف'
          : 'خطأ في إعدادات الخادم — افتح المسار /api/health للتحقق من متغيرات البيئة وقاعدة البيانات'
      )
      return
    }

    // جلب دور المستخدم لتوجيهه للوحة الصحيحة
    const sessionRes = await fetch('/api/auth/session')
    const session = await sessionRes.json()
    const role = session?.user?.role as string | undefined

    // حماية إضافية: جلسة بلا دور تعني خللاً في الإعدادات
    if (!role) {
      setError('تعذر جلب بيانات الجلسة — افتح المسار /api/health للتحقق من إعدادات الخادم')
      return
    }

    toast.success('تم تسجيل الدخول بنجاح — مرحباً بك في تكليفات')

    const callbackUrl = searchParams.get('callbackUrl')
    const destination =
      callbackUrl && callbackUrl.startsWith('/') ? callbackUrl : ROLE_HOME[role] ?? '/'

    router.push(destination)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center lg:text-start">
        <h1 className="text-2xl font-extrabold">تسجيل الدخول</h1>
        <p className="text-sm text-muted-foreground">
          ادخل إلى منصة تكليفات | Takleefat باستخدام رقم هاتفك وكلمة المرور
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="phone">رقم الهاتف</Label>
          <div className="relative">
            <PhoneIcon className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              dir="ltr"
              placeholder="05xxxxxxxx"
              className="ps-10 text-start"
              {...form.register('phone')}
            />
          </div>
          {form.formState.errors.phone && (
            <p className="text-xs text-destructive">{form.formState.errors.phone.message}</p>
          )}
        </div>

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
          {form.formState.errors.password && (
            <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
          )}
        </div>

        <Button type="submit" className="w-full gap-2" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              جارٍ تسجيل الدخول...
            </>
          ) : (
            <>
              <LogIn className="size-4" />
              تسجيل الدخول
            </>
          )}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        ليس لديك حساب؟{' '}
        <Link href="/register" className="font-semibold text-primary hover:underline">
          إنشاء حساب جديد
        </Link>
      </p>
    </div>
  )
}

/**
 * صفحة تسجيل الدخول — لفّ النموذج داخل Suspense
 * لأن useSearchParams() لا يعمل أثناء prerendering بدونه.
 */
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center gap-3 py-10 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <span className="text-sm">جارٍ تحميل نموذج تسجيل الدخول...</span>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
