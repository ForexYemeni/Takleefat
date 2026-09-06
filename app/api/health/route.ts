import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * نقطة تشخيص النظام — تكليفات | Takleefat
 * تعرض حالة الإعدادات والمتغيرات المطلوبة (بدون كشف أي قيم سرية)
 * لاستكشاف أخطاء النشر على Vercel بسرعة.
 * مثال: افتح https://<موقعك>.vercel.app/api/health
 */
export async function GET() {
  const env = (key: string) => {
    const value = process.env[key]
    return value && value.trim() !== '' ? 'set' : 'MISSING'
  }

  let database = 'error'
  let databaseError: string | undefined

  try {
    await db.$queryRaw`SELECT 1`
    database = 'ok'
  } catch (error) {
    databaseError = error instanceof Error ? error.message.split('\n')[0] : 'Unknown error'
  }

  const body = {
    name: 'تكليفات | Takleefat',
    status: database === 'ok' ? 'healthy' : 'degraded',
    time: new Date().toISOString(),
    database,
    ...(databaseError ? { databaseError } : {}),
    env: {
      DATABASE_URL: env('DATABASE_URL'),
      AUTH_SECRET: env('AUTH_SECRET'),
      NEXTAUTH_SECRET: env('NEXTAUTH_SECRET'),
      NEXTAUTH_URL: env('NEXTAUTH_URL'),
      ADMIN_PHONE: env('ADMIN_PHONE'),
      ADMIN_PASSWORD: env('ADMIN_PASSWORD'),
      STORAGE_ACCESS_KEY: env('STORAGE_ACCESS_KEY'),
      STORAGE_SECRET_KEY: env('STORAGE_SECRET_KEY'),
      STORAGE_BUCKET: env('STORAGE_BUCKET'),
      STORAGE_ENDPOINT: env('STORAGE_ENDPOINT'),
    },
    hints: {
      auth_secret_missing:
        'إن كان AUTH_SECRET و NEXTAUTH_SECRET كلاهما MISSING فلن يعمل تسجيل الدخول — أنشئ مفتاحاً بالأمر: openssl rand -base64 32',
      database_error:
        'تأكد من صحة DATABASE_URL ومن تنفيذ: npx prisma db push ثم npx prisma db seed',
      login_not_working:
        'الشروط الثلاثة لتسجيل الدخول: (1) مفتاح سري AUTH_SECRET (2) قاعدة بيانات متصلة (3) حساب مدير موجود — جرّب npx prisma db seed',
    },
  }

  return NextResponse.json(body)
}
