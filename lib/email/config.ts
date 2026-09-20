import type { NotificationType } from '@prisma/client'

/**
 * إعدادات نظام البريد الإلكتروني المركزي — الجولة 51
 * =====================================================
 * قناة إشعارات رسمية إضافية عبر Google Apps Script + Gmail حصراً
 * (بلا أي خدمة بريد خارجية مدفوعة). الدخول يبقى هاتف + كلمة مرور.
 *
 * أقسام الإشعارات: كل نوع إشعار ينتمي لقسم واحد قابل للتحكم من المستخدم،
 * عدا قسم الأمان (security) — مقفول دائماً ولا يمكن تعطيله (سياسة النظام).
 */

/** أقسام إشعارات البريد القابلة للتحكم من المستخدم */
export const TOGGLEABLE_CATEGORIES = [
  'assignments',
  'requests',
  'updates',
  'documents',
  'admin',
  'account',
  'important',
] as const

export type ToggleableEmailCategory = (typeof TOGGLEABLE_CATEGORIES)[number]

/** قسم الأمان — إشعارات لا يمكن تعطيلها إطلاقاً (رموز التحقق وتغييرات الحساب الحساسة) */
export const SECURITY_CATEGORY = 'security' as const

export type EmailCategory = ToggleableEmailCategory | typeof SECURITY_CATEGORY

/** الأقسام المقفلة — لا تُقبل من الواجهة ولا تُحترم إذا أُرسلت معطّلة */
export const LOCKED_CATEGORIES: readonly string[] = [SECURITY_CATEGORY]

export interface EmailPreferences {
  assignments: boolean
  requests: boolean
  updates: boolean
  documents: boolean
  admin: boolean
  account: boolean
  important: boolean
}

/** الافتراضي: كل الأقسام القابلة للتحكم مفعّلة (تُطبق عند التأكيد وأي غياب صريح) */
export const DEFAULT_EMAIL_PREFERENCES: EmailPreferences = {
  assignments: true,
  requests: true,
  updates: true,
  documents: true,
  admin: true,
  account: true,
  important: true,
}

/** عناوين الأقسام كما تظهر في الإعدادات والسجلات */
export const EMAIL_CATEGORY_LABELS: Record<EmailCategory, string> = {
  assignments: 'إشعارات التكليفات',
  requests: 'الطلبات',
  updates: 'تحديثات التكليف',
  documents: 'المستندات',
  admin: 'الإشعارات الإدارية',
  account: 'إشعارات الحساب',
  important: 'التنبيهات المهمة',
  security: 'أمان الحساب (مقفل دائماً)',
}

/** أنواع البريد المباشرة — لا تمر عبر إشعارات التطبيق الداخلية */
export type DirectEmailType =
  | 'EMAIL_VERIFICATION'
  | 'ACCOUNT_SECURITY'
  | 'IMPORTANT_ALERT'
  | 'ADMIN_ALERT'
  | 'SYSTEM_NOTIFICATION'
  | 'TEST'

export type EmailNotificationType = NotificationType | DirectEmailType

/** خريطة أنواع إشعارات التطبيق → قسم البريد القابل للتحكم */
const TYPE_CATEGORY_MAP: Record<NotificationType, EmailCategory> = {
  POST_CREATED: 'assignments',
  INVITATION_RECEIVED: 'assignments',
  APPLICATION_SUBMITTED: 'requests',
  APPLICATION_APPROVED: 'requests',
  APPLICATION_REJECTED: 'requests',
  INVITATION_ACCEPTED: 'requests',
  INVITATION_DECLINED: 'requests',
  INVITATION_EXPIRED: 'requests',
  AFFILIATION_UPDATED: 'requests',
  ASSIGNMENT_CREATED: 'updates',
  ASSIGNMENT_RECEIVED: 'updates',
  ASSIGNMENT_STARTED: 'updates',
  ASSIGNMENT_COMPLETED: 'updates',
  ASSIGNMENT_CANCELLED: 'updates',
  DOCUMENT_UPLOADED: 'documents',
  DOCUMENT_REVIEWED: 'documents',
  // الجولة 61: خصوصية المستندات — طلبات الرؤية والقرارات تصنف ضمن المستندات
  DOCUMENT_ACCESS_REQUESTED: 'documents',
  DOCUMENT_ACCESS_DECIDED: 'documents',
  DOCUMENT_ACCESS_GRANTED: 'documents',
  DOCUMENT_ACCESS_REVOKED: 'documents',
  FAVORITE_ADDED: 'admin',
  // الجولة 63: تواصل الإدارة عبر واتساب — يصنف ضمن الإشعارات الإدارية
  ADMIN_WHATSAPP: 'admin',
  GENERIC: 'admin',
  ACCOUNT_APPROVED: 'account',
  ACCOUNT_REJECTED: 'account',
  // الجولة 66: ميزة «فرصة» — أحداث فرص العمل تصنف ضمن «التنبيهات المهمة»
  // (قنوات إشعار قائمة تُعاد استخدامها — لا نظام بريد جديد)
  OPPORTUNITY_PUBLISHED: 'important',
  OPPORTUNITY_APPLICATION_RECEIVED: 'requests',
  OPPORTUNITY_APPLICATION_REVIEWED: 'requests',
  OPPORTUNITY_INTERVIEW_INVITED: 'important',
  OPPORTUNITY_INTERVIEW_CONFIRMED: 'important',
  OPPORTUNITY_INTERVIEW_DECLINED: 'important',
  OPPORTUNITY_CANDIDATE_SELECTED: 'important',
  OPPORTUNITY_PAYMENT_PENDING: 'important',
  OPPORTUNITY_PAYMENT_COMPLETED: 'important',
  // الجولة 70: اختيار المرشح توقيت سداد الرسوم — مهم لجهة التوظيف
  OPPORTUNITY_PAYMENT_TIMING_SELECTED: 'important',
  OPPORTUNITY_CLOSED: 'important',
}

/** قسم نوع إشعار البريد — الأنواع المباشرة تُصنَّف يدوياً */
export function emailCategoryOf(type: EmailNotificationType): EmailCategory {
  if (type === 'EMAIL_VERIFICATION' || type === 'ACCOUNT_SECURITY') return SECURITY_CATEGORY
  if (type === 'IMPORTANT_ALERT' || type === 'SYSTEM_NOTIFICATION') return 'important'
  if (type === 'ADMIN_ALERT') return 'admin'
  if (type === 'TEST') return 'admin'
  return TYPE_CATEGORY_MAP[type as NotificationType] ?? 'admin'
}

/** قراءة تفضيلات المستخدم من تخزينها النصي JSON مع الافتراضات الآمنة */
export function parseEmailPreferences(raw: string | null | undefined): EmailPreferences {
  if (!raw) return { ...DEFAULT_EMAIL_PREFERENCES }
  try {
    const parsed = JSON.parse(raw) as Partial<EmailPreferences>
    return { ...DEFAULT_EMAIL_PREFERENCES, ...parsed }
  } catch {
    return { ...DEFAULT_EMAIL_PREFERENCES }
  }
}

/** هل قسم الإشعار مفعّل لمستخدم؟ — الأمان مقفول دائماً بمعزل عن كل المفاتيح */
export function isCategoryEnabled(
  category: EmailCategory,
  prefs: EmailPreferences,
  masterEnabled: boolean
): boolean {
  if (category === SECURITY_CATEGORY) return true // سياسة النظام: أمان الحساب دائماً
  if (!masterEnabled) return false
  return prefs[category as ToggleableEmailCategory] !== false
}

/**
 * إخفاء البريد للعرض المناسب — مثال: mo***@gmail.com
 * العرض الافتراضي مُقنَّع في كل الواجهات.
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return '***'
  const head = local.slice(0, 2)
  return `${head}${'*'.repeat(Math.max(3, Math.min(8, local.length - 2)))}@${domain}`
}

/** عنوان التطبيق المطلق لأزرار «عرض التفاصيل» — يُقرأ من البيئة حصراً */
export function resolveAppUrl(): string | null {
  const url = process.env.APP_URL
    ?? process.env.NEXTAUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null)
  return url ? url.replace(/\/$/, '') : null
}

/** بناء رابط مطلق آمن لأزرار البريد — يُرجع null إذا لا يوجد أساس آمن للرابط */
export function absoluteAppLink(link: string | null | undefined): string | null {
  if (!link) return null
  if (/^https:\/\//i.test(link)) return link
  const base = resolveAppUrl()
  if (!base) return null
  return `${base}${link.startsWith('/') ? '' : '/'}${link}`
}
