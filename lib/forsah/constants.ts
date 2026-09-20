import type {
  OpportunityApplicationStatus,
  OpportunityFeeType,
  OpportunityInterviewMode,
  OpportunityInterviewResponse,
  OpportunityPaymentTiming,
  OpportunitySalaryType,
  OpportunityStatus,
  OpportunityTransactionStatus,
} from '@prisma/client'

/**
 * ثوابت ومسرد «فرصة | Forsah» — الجولة 66 | تكليفات | Takleefat
 * ============================================================
 * Domain مستقل تماماً عن التكليفات — كل التسميات العربية المعرّفة مرة واحدة
 * وتُستهلك من الواجهات وAPI معاً حتى لا يختلف نص أي حالة بين الخادم والعميل.
 */

// ---------------- الصلاحيات (المواصفة 22) ----------------

/** مفاتيح صلاحيات «فرصة» — تُمنح من الإدارة لكل حساب HR على حدة */
export const FORSAH_PERMISSIONS = [
  'opportunity.view',
  'opportunity.create',
  'opportunity.edit',
  'opportunity.publish',
  'opportunity.pause',
  'opportunity.close',
  'opportunity.viewApplicants',
  'opportunity.inviteInterview',
  'opportunity.selectCandidate',
  'opportunity.viewFinancials',
  'opportunity.viewCommission',
  'opportunity.manage',
] as const

export type ForsahPermission = (typeof FORSAH_PERMISSIONS)[number]

/** الصلاحيات الافتراضية عند إنشاء حساب HR جديد — الإغلاق (close) والإدارة العليا (manage) تُمنح يدوياً من الإدارة فقط */
export const DEFAULT_HR_PERMISSIONS: ForsahPermission[] = [
  'opportunity.view',
  'opportunity.create',
  'opportunity.edit',
  'opportunity.publish',
  'opportunity.pause',
  'opportunity.viewApplicants',
  'opportunity.inviteInterview',
  'opportunity.selectCandidate',
  'opportunity.viewFinancials',
  'opportunity.viewCommission',
]

/** هل الحالة «مفتوحة للتقديم» على مستوى الخادم؟ — PUBLISHED وACTIVE فقط */
export function isOpportunityOpen(status: OpportunityStatus | string): boolean {
  return status === 'PUBLISHED' || status === 'ACTIVE'
}

// ---------------- المسرد العربي ----------------

export const OPPORTUNITY_STATUS_LABELS: Record<OpportunityStatus, string> = {
  DRAFT: 'مسودة',
  PUBLISHED: 'منشورة',
  ACTIVE: 'نشطة',
  PAUSED: 'متوقفة مؤقتاً',
  CLOSED: 'مغلقة',
  ARCHIVED: 'مؤرشفة',
}

export const OPPORTUNITY_SALARY_TYPE_LABELS: Record<OpportunitySalaryType, string> = {
  MONTHLY: 'شهري',
  DAILY: 'يومي',
  NEGOTIABLE: 'حسب الاتفاق',
}

export const OPPORTUNITY_APPLICATION_STATUS_LABELS: Record<
  OpportunityApplicationStatus,
  string
> = {
  PENDING: 'قيد المراجعة',
  REVIEWED: 'تمت المراجعة',
  INTERVIEW_INVITED: 'مرشح للمقابلة',
  INTERVIEW_CONFIRMED: 'مقابلة مؤكدة',
  INTERVIEW_DECLINED: 'اعتذر عن المقابلة',
  SELECTED: 'تم الاختيار',
  REJECTED: 'غير مقبول',
  WITHDRAWN: 'منسحب',
}

export const OPPORTUNITY_INTERVIEW_MODE_LABELS: Record<OpportunityInterviewMode, string> = {
  ONSITE: 'حضورية',
  ONLINE: 'عن بُعد',
}

export const OPPORTUNITY_INTERVIEW_RESPONSE_LABELS: Record<
  OpportunityInterviewResponse,
  string
> = {
  PENDING: 'بانتظار الرد',
  CONFIRMED: 'أكّد الحضور',
  DECLINED: 'اعتذر عن الحضور',
}

export const OPPORTUNITY_FEE_TYPE_LABELS: Record<OpportunityFeeType, string> = {
  PERCENTAGE: 'نسبة من الراتب',
  FIXED: 'مبلغ ثابت',
}

/** الجولة 70 — توقيت سداد رسوم الخدمة الذي يختاره المرشح بعد اختياره */
export const OPPORTUNITY_PAYMENT_TIMING_LABELS: Record<OpportunityPaymentTiming, string> = {
  WITHIN_FIRST_TEN_DAYS: 'خلال أول 10 أيام من الدوام',
  DIRECT: 'دفع مباشر',
  AFTER_THREE_DAYS: 'بعد ثلاثة أيام',
}

export const OPPORTUNITY_TRANSACTION_STATUS_LABELS: Record<OpportunityTransactionStatus, string> =
  {
    PENDING: 'معلقة',
    AWAITING_PAYMENT: 'بانتظار السداد',
    PAID: 'مسددة',
    PARTIALLY_PAID: 'مسددة جزئياً',
    FAILED: 'فاشلة',
    CANCELLED: 'ملغاة',
    REFUNDED: 'مستردة',
    COMPLETED: 'مكتملة',
  }

export const FORSAH_CURRENCY_LABELS: Record<string, string> = {
  YER: 'ريال يمني',
  SAR: 'ريال سعودي',
  USD: 'دولار أمريكي',
}

/** رموز العملات لعرض الراتب باختصار */
export const FORSAH_CURRENCY_SYMBOLS: Record<string, string> = {
  YER: 'ريال',
  SAR: 'ريال سعودي',
  USD: '$',
}

/** جمهور الفرصة — يُعيد استخدام التعداد الحالي Audience */
export const FORSAH_AUDIENCE_LABELS: Record<string, string> = {
  NURSE: 'كادر صحي',
  DOCTOR: 'طبيب',
}

export const FORSAH_GENDER_LABELS: Record<string, string> = {
  MALE: 'ذكور',
  FEMALE: 'إناث',
  ANY: 'الجنسان',
}

/** المستندات المقترحة للاختيار عند إنشاء فرصة (أسماء عامة معروضة على المتقدم) */
export const FORSAH_DOCUMENT_OPTIONS = [
  'الهوية الشخصية',
  'الترخيص المهني',
  'شهادة المؤهل العلمي',
  'شهادات الخبرة',
  'السيرة الذاتية',
  'شهادة حسن سيرة وسلوك',
  'الفحص الطبي',
] as const

// ---------------- أفعال سجل التدقيق (المواصفة 20) ----------------

export const FORSAH_AUDIT_ACTIONS = {
  OPPORTUNITY_CREATED: 'أنشأ فرصة',
  OPPORTUNITY_UPDATED: 'عدّل فرصة',
  OPPORTUNITY_PUBLISHED: 'نشر فرصة',
  OPPORTUNITY_PAUSED: 'أوقف فرصة مؤقتاً',
  OPPORTUNITY_RESUMED: 'استأنف فرصة',
  OPPORTUNITY_CLOSED_BY_HR: 'أغلق فرصة',
  OPPORTUNITY_CLOSED_BY_ADMIN: 'أغلق الإدارة فرصة',
  OPPORTUNITY_ARCHIVED: 'أرشف فرصة',
  // الجولة 69: الحذف النهائي للفرص المغلقة/المؤرشفة — بلقطة كاملة في أرشيف الحذف
  OPPORTUNITY_DELETED: 'حذفت الإدارة فرصة نهائياً (لقطة محفوظة)',
  OPPORTUNITY_VIEWED: 'شاهد فرصة',
  APPLICANT_PROFILE_VIEWED: 'شاهد ملف متقدم',
  APPLICANT_DOCUMENTS_VIEWED: 'شاهد مستندات متقدم',
  APPLICANT_CONTACT_VIEWED: 'شاهد بيانات تواصل متقدم',
  APPLICATION_SUBMITTED: 'قدّم على فرصة',
  APPLICATION_REVIEWED: 'راجع تقديم',
  APPLICATION_REJECTED: 'رفض تقديم',
  APPLICATION_WITHDRAWN: 'انسحب تقديم',
  INTERVIEW_INVITED: 'أرسل دعوة مقابلة',
  INTERVIEW_RESPONDED: 'رد على دعوة مقابلة',
  CANDIDATE_SELECTED: 'اختار مرشحاً',
  TRANSACTION_CREATED: 'أُنشئت عملية مالية',
  TRANSACTION_UPDATED: 'عُدّلت عملية مالية',
  // الجولة 70: اختيار المرشح توقيت سداد رسومه بعد الاختيار — شفافية كاملة
  PAYMENT_TIMING_SELECTED: 'اختار المرشح توقيت سداد الرسوم',
  FEE_SETTINGS_CHANGED: 'غيّر رسوم الفرصة',
  HR_CREATED: 'أنشأ الإدارة حساب موارد بشرية',
  HR_UPDATED: 'عدّلت الإدارة حساب موارد بشرية',
  HR_DISABLED: 'عطّلت الإدارة حساب موارد بشرية',
  HR_ENABLED: 'فعّلت الإدارة حساب موارد بشرية',
  HR_PASSWORD_RESET: 'أعادت الإدارة تعيين كلمة مرور HR',
  HR_PERMISSIONS_CHANGED: 'غيّرت الإدارة صلاحيات HR',
  // الجولة 68: الحذف النهائي لحساب HR بتأكيد كلمة مرور الإدارة
  HR_DELETED: 'حذفت الإدارة حساب موارد بشرية نهائياً',
  // الجولة 67: الإغلاق الكلي للنظام
  FORSAH_SYSTEM_CLOSED: 'أغلقت الإدارة نظام فرصة كلياً',
  FORSAH_SYSTEM_OPENED: 'أعادت الإدارة تشغيل نظام فرصة',
} as const

export type ForsahAuditAction = keyof typeof FORSAH_AUDIT_ACTIONS

// ---------------- رسائل الأخطاء والنجاح العربية الموحدة (المواصفة 28) ----------------

export const FORSAH_MESSAGES = {
  CLOSED_APPLY_BLOCK: 'هذه الفرصة مغلقة ولم تعد متاحة للتقديم.',
  NOT_AVAILABLE: 'هذه الفرصة لم تعد متاحة.',
  CANNOT_APPLY: 'لا يمكنك التقديم على هذه الفرصة.',
  APPLIED_OK: 'تم إرسال طلبك بنجاح.',
  APPLIED_BEFORE: 'لقد قدمت على هذه الفرصة مسبقاً.',
  SEND_FAILED: 'تعذر إرسال الطلب، حاول مرة أخرى.',
  NOT_ELIGIBLE: 'لا تستوفي شروط هذه الفرصة حالياً — راجع قائمة المطابقة أدناه.',
  SELECTIONS_FULL: 'اكتمل عدد الموظفين المختارين لهذه الفرصة.',
  NO_PERMISSION: 'ليست لديك صلاحية لتنفيذ هذا الإجراء.',
  // الجولة 67: الإغلاق الكلي لنظام «فرصة» من الإدارة
  SYSTEM_CLOSED: 'نظام «فرصة» مغلق حالياً من إدارة المنصة — تابعونا قريباً.',
} as const
