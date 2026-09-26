/**
 * ثوابت وتسميات برنامج إحالة تكليفات — الجولة 75 | تكليفات | Takleefat
 * ============================================================
 * وحدة نقية بلا أي استيراد خادم (db/notifications/crypto) — آمنة للاستهلاك
 * من مكوّنات العميل ومن محرك الخادم معاً. المنطق الحساسي يبقى حصراً في
 * lib/referrals.ts (خادم فقط).
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
