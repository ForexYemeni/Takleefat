/**
 * ثوابت وتسميات برنامج إحالة تكليفات — الجولة 75 | تكليفات | Takleefat
 * ============================================================
 * وحدة نقية بلا أي استيراد خادم (db/notifications/crypto) — آمنة للاستهلاك
 * من مكوّنات العميل ومن محرك الخادم معاً. المنطق الحساسي يبقى حصراً في
 * lib/referrals.ts (خادم فقط).
 *
 * الجولة 79: مُنسّقات حتمية للأرقام والتواريخ (جافاسكربت خالص بلا Intl)
 * السبب: بعض بيئات المتصفح (WebView قديم / سفاري قديم) يتجاهل امتداد -u-nu-latn
 * في Intl فتُخرج toLocaleString('ar-...') أرقاماً هندية-عربية (٠-٩) على جهاز
 * المستخدم رغم أن الخادم يُخرج أرقاماً لاتينية — هذه الدوال تضمن 0-9 على كل جهاز.
 */

/** الأدوار المؤهلة لاستخدام نظام الإحالة — الإدارة (ADMIN) مستثناة نهائياً */
export const REFERRAL_ELIGIBLE_ROLES = [
  'NURSE',
  'DOCTOR',
  'DOCTOR_SUPERVISOR',
  'RECEIVER',
  'HR',
] as const

export type ReferralEligibleRole = (typeof REFERRAL_ELIGIBLE_ROLES)[number]

export function isReferralEligibleRole(role: string): boolean {
  return (REFERRAL_ELIGIBLE_ROLES as readonly string[]).includes(role)
}

/** كوكي رابط الدعوة — httpOnly لمدة 30 يوماً */
export const REFERRAL_COOKIE = 'tkf_ref'
export const REFERRAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 30

// ---------- التسميات العربية الموحدة ----------

export const REFERRAL_STATUS_LABELS: Record<string, string> = {
  INVITED: 'مدعو',
  REGISTERED: 'أنشأ حساباً',
  VERIFIED: 'موثق',
  REWARDED: 'تم احتساب الاستحقاق',
  BLOCKED: 'مستبعد',
  CLOSED: 'أُغلقت — سجّل الرقم عبر دعوة أخرى',
}

export const REFERRAL_REWARD_STATUS_LABELS: Record<string, string> = {
  PENDING_REVIEW: 'بانتظار المراجعة',
  ACCRUED: 'مستحق',
  PARTIALLY_USED: 'استُخدم جزء منه',
  USED: 'استُخدم بالكامل',
  CANCELLED: 'ملغى',
}

export const REFERRAL_SOURCE_LABELS: Record<string, string> = {
  LINK: 'رابط دعوة',
  DIRECT: 'دعوة مباشرة',
}

export const REFERRAL_ORIGIN_LABELS: Record<string, string> = {
  ASSIGNMENT: 'تكليف',
  OPPORTUNITY: 'فرصة عمل',
}

/** أوصاف أفعال سجل التدقيق للعرض الإداري */
export const REFERRAL_AUDIT_ACTION_LABELS: Record<string, string> = {
  REFERRAL_CODE_CREATED: 'إنشاء كود إحالة شخصي',
  REFERRAL_TRACK_VISIT: 'زيارة صفحة دعوة',
  REFERRAL_DIRECT_INVITE: 'دعوة مباشرة جديدة',
  REFERRAL_BOUND_LINK: 'ربط مُحال من رابط دعوة',
  REFERRAL_BOUND_DIRECT: 'ربط مُحال من دعوة مباشرة',
  REFERRAL_DUPLICATES_CLOSED: 'إغلاق آلي لدعوات مكررة بنفس الرقم',
  REFERRAL_SELF_REFERRAL_BLOCKED: 'منع إحالة ذاتية',
  REFERRAL_VERIFIED: 'توثيق حساب مُحال',
  REFERRAL_REWARD_ACCRUED: 'احتساب ميزة إحالة',
  REFERRAL_REWARD_SKIPPED: 'تخطي احتساب (شرط غير مستوفى)',
  REFERRAL_REWARD_DECIDED: 'قرار مراجعة استحقاق',
  REFERRAL_BENEFITS_USED: 'استخدام مزايا كخصم من الرسوم',
  REFERRAL_STATUS_CHANGED: 'تغيير حالة إحالة',
  REFERRAL_SETTINGS_UPDATED: 'تحديث إعدادات برنامج الإحالة',
}

/** نسبة الإحالة الفعالة حسب دور المُحيل — تعمل على كائن أي شكل يحمل الحقول */
export function referralPercentForRolePure(
  settings: {
    percentNURSE: number
    percentDOCTOR: number
    percentDOCTOR_SUPERVISOR: number
    percentRECEIVER: number
    percentHR: number
  },
  role: string
): number {
  switch (role) {
    case 'NURSE':
      return settings.percentNURSE
    case 'DOCTOR':
      return settings.percentDOCTOR
    case 'DOCTOR_SUPERVISOR':
      return settings.percentDOCTOR_SUPERVISOR
    case 'RECEIVER':
      return settings.percentRECEIVER
    case 'HR':
      return settings.percentHR
    default:
      return 0
  }
}

// ---------- الجولة 79: تنسيق حتمي بلا Intl — أرقام لاتينية 0-9 مضمونة على كل جهاز ----------

/** تحويل الأرقام الهندية-العربية (٠-٩) والفارسية (۰-۹) في أي نص إلى أرقام لاتينية 0-9 */
export function toLatinDigits(input: string): string {
  return input
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
}

/** تنسيق رقم بفواصل آلاف وأرقام لاتينية مضمونة — جافاسكربت خالص بلا Intl */
export function formatLatinNumber(value: number | null | undefined, maxDecimals = 0): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const negative = value < 0
  const abs = Math.abs(value)
  const fixed = maxDecimals > 0 ? abs.toFixed(maxDecimals) : String(Math.round(abs))
  const [intPart, decPart] = fixed.split('.')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}${grouped}${decPart ? `.${decPart}` : ''}`
}

/** تنسيق مبلغ بالريال اليمني — مطابق لسلوك formatCurrency لكن حتمي بلا Intl */
export function formatReferralCurrency(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return '—'
  return `${formatLatinNumber(amount)} ريال`
}

/** أسماء الشهور الميلادية العربية — ثابتة بدل الاعتماد على ICU المتصفح */
const MONTHS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
] as const

/** تاريخ عربي بأرقام لاتينية مضمونة — بتوقيت مكة المكرمة (+03 ثابت) — بلا Intl */
export function formatReferralDate(
  iso: string | Date | null | undefined,
  withTime = false
): string {
  if (!iso) return '—'
  try {
    const d = iso instanceof Date ? iso : new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    // توقيت مكة المكرمة (+03:00 ثابت) — نفس منطق MECCA_TIME_ZONE في المنصة
    const mecca = new Date(d.getTime() + 3 * 60 * 60 * 1000)
    const day = mecca.getUTCDate()
    const month = MONTHS_AR[mecca.getUTCMonth()]
    const year = mecca.getUTCFullYear()
    if (!withTime) return `${day} ${month} ${year}`
    const h24 = mecca.getUTCHours()
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12
    const minutes = String(mecca.getUTCMinutes()).padStart(2, '0')
    const period = h24 < 12 ? 'ص' : 'م'
    return `${day} ${month} ${year}، ${h12}:${minutes} ${period}`
  } catch {
    return '—'
  }
}
