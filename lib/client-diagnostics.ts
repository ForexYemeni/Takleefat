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
 *   2) قاعدة البيانات مضبوطة لكن الاتصال/الجداول فاشلة → مراجعة DATABASE_URL + إعادة النشر
 *   3) مفتاح الجلسات (NEXTAUTH_SECRET / AUTH_SECRET) ناقص → خطوات الإضافة
 *   4) أي سبب آخر → /api/health للتشخيص الكامل
 *   5) فشل الوصول إلى /api/health نفسه → مشكلة إنترنت فعلية
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
