'use client'

/**
 * تشخيص موحّد لأعطال الخادم في صفحات المصادقة (تسجيل الدخول / إنشاء حساب).
 *
 * عند فشل الطلب (استجابة 500 أو انقطاع شبكة) نستعلم /api/health
 * ونسمّي السبب الحقيقي برسالة عربية قابلة للتنفيذ — بدلاً من رسالة
 * «تعذر الاتصال بالخادم» المضللة التي لا تخبر المستخدم بما يجب فعله.
 *
 * أولويات التشخيص:
 *   1) قاعدة البيانات غير مضبوطة إطلاقاً (DATABASE_URL فارغ) → خطوات إنشاء Postgres من Vercel
 *   2) انزياح بنية قاعدة البيانات (عمود/جدول مفقود) → Redeploy لمزامنة المخطط تلقائياً
 *   3) قاعدة البيانات مضبوطة لكن الاتصال فاشل → مراجعة DATABASE_URL + إعادة النشر
 *   4) مفتاح الجلسات (NEXTAUTH_SECRET / AUTH_SECRET) ناقص → خطوات الإضافة
 *   5) أي سبب آخر → /api/health للتشخيص الكامل
 *   6) فشل الوصول إلى /api/health نفسه → مشكلة إنترنت فعلية
 */
export async function getServerIssueMessage(): Promise<string> {
  try {
    const res = await fetch('/api/health', { cache: 'no-store' })
    const h = await res.json()

    if (h?.database !== 'ok') {
      // الحالة الأشهر: DATABASE_URL فارغ — لم تُربط قاعدة بيانات بالمشروع بعد
      if (h?.databaseUrlConfigured === false) {
        return (
          'قاعدة البيانات غير مضبوطة بعد — الإصلاح من لوحة Vercel: ' +
          'تبويب Storage ← Create Database ← Postgres ← Connect، ' +
          'ثم أعد النشر (Redeploy) وسيتم إنشاء الجداول والحسابات التجريبية تلقائياً أثناء البناء'
        )
      }
      // انزياح المخطط: الكود يتوقع أعمدة/جداول غير موجودة في القاعدة
      // (يحدث عندما يُنشر كود جديد دون نجاح مزامنة المخطط أثناء البناء)
      if (h?.schemaDrift) {
        return (
          'بنية قاعدة البيانات غير متزامنة مع آخر تحديث للمنصة — الإصلاح: ' +
          'اضغط Redeploy من تبويب Deployments في لوحة Vercel ' +
          'وسيتم تحديث الجداول تلقائياً أثناء البناء ثم يعمل تسجيل الدخول'
        )
      }
      return (
        'تعذر الاتصال بقاعدة البيانات — تحقق من صحة DATABASE_URL في إعدادات Vercel ' +
        'ثم أعد النشر (راجع /api/health لعرض الخطأ التفصيلي)'
      )
    }

    const missing = Object.entries(h?.env ?? {})
      .filter(([, v]) => v === 'MISSING')
      .map(([k]) => k)

    if (missing.includes('AUTH_SECRET') && missing.includes('NEXTAUTH_SECRET')) {
      return (
        'المفتاح السري للجلسات غير مضبوط — أضف NEXTAUTH_SECRET في متغيرات البيئة على Vercel ' +
        '(أنشئه بالأمر: openssl rand -base64 32) ثم أعد النشر'
      )
    }

    return 'خطأ غير متوقع في الخادم — افتح المسار /api/health لعرض التشخيص الكامل'
  } catch {
    return 'تعذر الاتصال بالخادم — تحقق من اتصالك بالإنترنت ثم أعد المحاولة'
  }
}
