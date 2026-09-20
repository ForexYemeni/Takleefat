/**
 * محدد معدل الطلبات (Rate Limiter) — الجولة 66 | تكليفات | Takleefat
 * ============================================================
 * نافذة منزلقة بسيطة في ذاكرة العملية — إضافي بحت:
 *  - يُستخدم على مسارات «فرصة» الحساسة (تقديم/نشر/مقابلات/اختيار) لمنع الضغط المتكرر.
 *  - يكفي على مستوى العملية الواحدة على Vercel (كل دالة بذاكرتها) كدفاع أول،
 *    والقواعد الصلبة (unique constraints) في القاعدة هي الضمان النهائي.
 *  - لا يعطل أي مسار قائم — يُستدعى فقط من مسارات «فرصة» الجديدة.
 */

interface Bucket {
  hits: number[]
}

const buckets = new Map<string, Bucket>()

/** آخر تنظيف للمفاتيح الميتة — يمنع تضخم الذاكرة */
let lastSweep = Date.now()

function sweep(now: number, windowMs: number) {
  if (now - lastSweep < 60_000) return
  lastSweep = now
  for (const [key, bucket] of buckets) {
    const recent = bucket.hits.filter((t) => now - t < windowMs)
    if (recent.length === 0) buckets.delete(key)
    else bucket.hits = recent
  }
}

/**
 * هل يُسمح بهذا الطلب؟
 * @param key معرف فريد للفاعل+الفعل (مثال: `apply:{userId}`)
 * @param limit أقصى عدد طلبات داخل النافذة
 * @param windowMs النافذة بالميلي ثانية
 * @returns true = مسموح
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  sweep(now, windowMs)
  const bucket = buckets.get(key) ?? { hits: [] }
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs)
  if (bucket.hits.length >= limit) {
    buckets.set(key, bucket)
    return false
  }
  bucket.hits.push(now)
  buckets.set(key, bucket)
  return true
}
