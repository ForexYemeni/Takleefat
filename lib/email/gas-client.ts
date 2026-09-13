/**
 * عميل Google Apps Script — الجولة 51
 * =====================================================
 * نقطة الإرسال المركزية الوحيدة: Web App واحد على Google Apps Script + Gmail.
 *
 * القواعد الصارمة:
 * - الرابط والسر من البيئة حصراً (GOOGLE_APPS_SCRIPT_URL / GOOGLE_APPS_SCRIPT_SECRET)
 *   — لا يظهران أبداً في الواجهة أو الاستجابات.
 * - الإرسال لا يرمي أخطاء أبداً (never throws) — يُرجع { ok, error? } فقط،
 *   فلا يتعطل أي مسار أساسي في التطبيق بسبب بطء Gmail أو تعطل السكربت.
 * - مهلة قصوى 8 ثوانٍ — بطء Google لا يبطئ التطبيق.
 */

/** رابط Web App الخاص بـ Google Apps Script — من البيئة فقط */
export function gasWebAppUrl(): string | null {
  const url = process.env.GOOGLE_APPS_SCRIPT_URL?.trim()
  return url ? url : null
}

/** سر التحقق بين التطبيق والسكربت — من البيئة فقط */
export function gasSecret(): string | null {
  const secret = process.env.GOOGLE_APPS_SCRIPT_SECRET?.trim()
  return secret ? secret : null
}

/** هل خدمة البريد مهيأة (الرابط + السر معاً)؟ */
export function isEmailServiceConfigured(): boolean {
  return Boolean(gasWebAppUrl() && gasSecret())
}

export interface GasSendResult {
  ok: boolean
  /** رسالة خطأ عربية مختصرة للسجل الإداري — بلا تفاصيل تقنية مبالغة */
  error?: string
}

/** مهلة الإرسال بالمللي ثانية — Google قد يكون بطيئاً ولا يجب أن ينتظره التطبيق طويلاً */
const GAS_TIMEOUT_MS = 8000

/**
 * إرسال حمولة بريد إلى Google Apps Script Web App.
 * لا يُلقي استثناءات إطلاقاً — كل فشل يُرجع نتيجة واضحة تُسجَّل في email_logs.
 */
export async function sendViaGas(payload: Record<string, unknown>): Promise<GasSendResult> {
  const url = gasWebAppUrl()
  const secret = gasSecret()

  if (!url || !secret) {
    return { ok: false, error: 'خدمة البريد غير مهيأة (رابط Google Apps Script أو السر مفقود)' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GAS_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, ...payload }),
      signal: controller.signal,
      // Google Apps Script يُعيد توجيه 302 إلى نطاق script.googleusercontent.com —
      // fetch يتبعه تلقائياً ويقرأ الاستجابة النهائية.
      redirect: 'follow',
    })

    if (!res.ok) {
      return { ok: false, error: `استجابة غير متوقعة من خدمة البريد (HTTP ${res.status})` }
    }

    const text = await res.text()
    try {
      const data = JSON.parse(text) as { ok?: boolean; error?: string }
      if (data.ok) return { ok: true }
      return { ok: false, error: data.error || 'رفضت خدمة البريد إرسال الرسالة' }
    } catch {
      // GAS قد يُعيد HTML عند أخطاء النشر — نعتبرها فشلاً واضحاً بلا تفاصيل تقنية
      return { ok: false, error: 'استجابة غير صالحة من خدمة البريد' }
    }
  } catch (e) {
    const err = e as Error
    if (err.name === 'AbortError') {
      return { ok: false, error: 'انتهت مهلة الاتصال بخدمة البريد (8 ثوانٍ)' }
    }
    return { ok: false, error: 'تعذر الوصول إلى خدمة البريد' }
  } finally {
    clearTimeout(timer)
  }
}
