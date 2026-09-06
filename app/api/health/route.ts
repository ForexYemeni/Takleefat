import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * نقطة تشخيص النظام — تكليفات | Takleefat
 * تعرض حالة الإعدادات والمتغيرات المطلوبة (بدون كشف أي قيم سرية)
 * لاستكشاف أخطاء النشر على Vercel بسرعة.
 * مثال: افتح https://<موقعك>.vercel.app/api/health
 *
 * force-dynamic: فحص قاعدة البيانات يجب أن يعمل وقت الطلب فعلياً
 * وليس أثناء البناء أو من ذاكرة التخزين المؤقت.
 */
export const dynamic = 'force-dynamic'

/// انزياح المخطط: عمود/جدول موجود في الكود وغائب عن قاعدة البيانات
function isSchemaDrift(error?: string): boolean {
  if (!error) return false
  return /does not exist|P2021|P2022|missing column|unknown column/i.test(error)
}

export async function GET() {
  const env = (key: string) => {
    const value = process.env[key]
    return value && value.trim() !== '' ? 'set' : 'MISSING'
  }

  // هل تم ضبط رابط قاعدة البيانات إطلاقاً؟ (مع دعم متغيرات Vercel Marketplace البديلة)
  const databaseUrlConfigured = Boolean(
    process.env.DATABASE_URL?.trim() ||
      process.env.POSTGRES_PRISMA_URL?.trim() ||
      process.env.POSTGRES_URL?.trim() ||
      process.env.POSTGRESQL_URL?.trim()
  )

  let database = 'error'
  let databaseError: string | undefined

  try {
    // فحص الاتصال + وجود الجداول + تطابق الأعمدة معاً
    // (count() لا يقرأ الأعمدة فلن يكشف انزياح المخطط مثل عمود مُضاف في الكود وغائب في القاعدة)
    await db.user.findMany({ take: 1 })
    database = 'ok'
  } catch (error) {
    databaseError = error instanceof Error ? error.message.split('\n')[0] : 'Unknown error'
  }

  // خطوات الإصلاح الجاهزة عندما لا تكون قاعدة البيانات جاهزة
  const setupSteps = [
    '1) من لوحة Vercel: افتح مشروعك ← تبويب Storage ← Create Database ← Postgres ← Connect (يُضبط DATABASE_URL تلقائياً)',
    '2) تأكد من وجود NEXTAUTH_SECRET (أو AUTH_SECRET) في Settings ← Environment Variables',
    '3) من تبويب Deployments اضغط Redeploy — أثناء البناء تُنشأ الجداول والحسابات التجريبية تلقائياً',
    '4) أعد فتح /api/health حتى ترى database: ok ثم سجّل الدخول (المدير: 773178684)',
  ]

  const body = {
    name: 'تكليفات | Takleefat',
    status: database === 'ok' ? 'healthy' : 'degraded',
    time: new Date().toISOString(),
    database,
    databaseUrlConfigured,
    ...(databaseError ? { databaseError } : {}),
    ...(database !== 'ok'
      ? { setup: setupSteps, ...(isSchemaDrift(databaseError) ? { schemaDrift: true } : {}) }
      : {}),
    env: {
      DATABASE_URL: env('DATABASE_URL'),
      AUTH_SECRET: env('AUTH_SECRET'),
      NEXTAUTH_SECRET: env('NEXTAUTH_SECRET'),
      NEXTAUTH_URL: env('NEXTAUTH_URL'),
      ADMIN_PHONE: env('ADMIN_PHONE'),
      ADMIN_PASSWORD: env('ADMIN_PASSWORD'),
      SEED_DEMO: env('SEED_DEMO'),
      STORAGE_ACCESS_KEY: env('STORAGE_ACCESS_KEY'),
      STORAGE_SECRET_KEY: env('STORAGE_SECRET_KEY'),
      STORAGE_BUCKET: env('STORAGE_BUCKET'),
      STORAGE_ENDPOINT: env('STORAGE_ENDPOINT'),
    },
    hints: {
      database_url_missing:
        'DATABASE_URL غير مضبوط — أنشئ قاعدة Postgres من تبويب Storage في لوحة Vercel واربطها بالمشروع ثم أعد النشر (Redeploy)، وسيتم إنشاء الجداول والحسابات التجريبية تلقائياً أثناء البناء',
      auth_secret_missing:
        'إن كان AUTH_SECRET و NEXTAUTH_SECRET كلاهما MISSING فلن يعمل تسجيل الدخول — أنشئ مفتاحاً بالأمر: openssl rand -base64 32',
      database_error:
        'تأكد من صحة DATABASE_URL ثم أعد النشر — أثناء البناء تُنفَّذ prisma db push + seed تلقائياً (لا حاجة لأوامر يدوية)',
      schema_drift:
        'بنية قاعدة البيانات غير متزامنة مع الكود (عمود أو جدول مفقود) — اضغط Redeploy من تبويب Deployments في Vercel وسيُزامن المخطط تلقائياً أثناء البناء؛ لا تحاول تعديل قاعدة البيانات يدوياً',
      login_not_working:
        'الشروط الثلاثة لتسجيل الدخول: (1) مفتاح سري NEXTAUTH_SECRET (2) قاعدة بيانات متصلة (3) إعادة نشر بعد ربط القاعدة — الحسابات التجريبية تُنشأ تلقائياً',
    },
  }

  return NextResponse.json(body)
}
