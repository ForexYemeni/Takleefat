import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ---------- واتساب | WhatsApp deep-links (الجولة العاشرة) ----------

/** رمز الدولة الافتراضي — قابل للتغيير عبر NEXT_PUBLIC_WHATSAPP_COUNTRY_CODE */
const WHATSAPP_COUNTRY_CODE = process.env.NEXT_PUBLIC_WHATSAPP_COUNTRY_CODE ?? '967'

/**
 * رابط واتساب جاهز (wa.me) — أرقام الهواتف مخزنة بدون رمز الدولة (9 أرقام).
 * بلا رقم → مشاركة عامة يختار فيها المرسل المحادثة بنفسه.
 */
export function whatsappLink(phone: string | null | undefined, message: string): string {
  const digits = (phone ?? '').replace(/\D/g, '')
  const text = encodeURIComponent(message)
  if (!digits) return `https://wa.me/?text=${text}`
  const local = digits.startsWith('0') ? digits.slice(1) : digits
  return `https://wa.me/${WHATSAPP_COUNTRY_CODE}${local}?text=${text}`
}

/** رسالة مشاركة تكليف مُعلن جاهزة للإرسال عبر واتساب */
export function buildPostShareMessage(post: {
  title: string
  facility: string
  department?: string | null
  value?: number | null
  hours?: number | null
  startDate?: string | null
  gender?: string | null
}, genderLabel?: (g: string) => string, origin?: string): string {
  const lines = [
    'تكليف جديد في منصة تكليفات | Takleefat',
    `${post.title} — ${post.facility}${post.department ? ` (${post.department})` : ''}`,
  ]
  if (post.value != null) lines.push(`قيمة التكليف: ${formatCurrency(post.value)}`)
  if (post.hours != null) lines.push(`عدد الساعات: ${post.hours}`)
  if (post.startDate) lines.push(`تاريخ البدء: ${formatDate(post.startDate)}`)
  if (post.gender && post.gender !== 'ANY' && genderLabel) lines.push(`الجنس المطلوب: ${genderLabel(post.gender)}`)
  if (origin) lines.push(`التقديم عبر المنصة: ${origin}/nurse/assignments`)
  return lines.join('\n')
}

// ---------- التسميات العربية الموحدة ----------

export const USER_STATUS_LABELS: Record<string, string> = {
  PENDING: 'قيد المراجعة',
  APPROVED: 'معتمد',
  REJECTED: 'مرفوض',
  SUSPENDED: 'موقوف',
}

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'مدير النظام',
  NURSE: 'الكادر التمريضي',
  RECEIVER: 'المستلم الإداري',
}

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  ID_CARD: 'البطاقة الشخصية',
  PRACTICE_LICENSE: 'صورة المزاولة',
  EXPERIENCE_CERT: 'شهادة الخبرة',
  OTHER: 'مستند آخر',
}

export const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'قيد المراجعة',
  APPROVED: 'معتمد',
  REJECTED: 'مرفوض',
}

export const ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'جاري',
  RECEIVED: 'تم الاستلام',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغي',
}

export const POST_STATUS_LABELS: Record<string, string> = {
  OPEN: 'متاح للتقديم',
  ASSIGNED: 'تم اختيار الكادر',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغي',
}

export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  PENDING: 'قيد المراجعة',
  APPROVED: 'مقبول',
  REJECTED: 'مرفوض',
}

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  UNPAID: 'غير مدفوع',
  PAID: 'مدفوع',
}

export const WITHDRAWAL_STATUS_LABELS: Record<string, string> = {
  PENDING: 'قيد المعالجة',
  PAID: 'تم الصرف',
  REJECTED: 'مرفوض',
}

export const GENDER_LABELS: Record<string, string> = {
  MALE: 'ذكر',
  FEMALE: 'أنثى',
}

/**
 * المؤهل العلمي — ثلاثة خيارات ثابتة فقط (الجولة الثامنة):
 * أورديلي سنة / دبلوم ثلاث سنوات / بكالوريوس أربع سنوات
 * القيمة تُخزّن كما هي (نص عربي) للتوافق الكامل مع البيانات السابقة الحرة.
 */
export const QUALIFICATION_OPTIONS = [
  { value: 'أورديلي سنة', label: 'أورديلي — سنة دراسية', hint: 'مساعد تمريض' },
  { value: 'دبلوم ثلاث سنوات', label: 'دبلوم — ثلاث سنوات', hint: 'معهد صحي' },
  { value: 'بكالوريوس أربع سنوات', label: 'بكالوريوس — أربع سنوات', hint: 'كلية العلوم الطبية' },
] as const

export type QualificationValue = (typeof QUALIFICATION_OPTIONS)[number]['value']

export const POST_GENDER_LABELS: Record<string, string> = {
  MALE: 'ذكر',
  FEMALE: 'أنثى',
  ANY: 'أي جنس',
}

// ---------- ألوان الحالات (Tailwind classes) ----------

export const STATUS_BADGE_CLASSES: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900',
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900',
  ACTIVE: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-900',
  RECEIVED: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-900',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900',
  REJECTED: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900',
  SUSPENDED: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
  CANCELLED: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
  OPEN: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-900',
  ASSIGNED: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-900',
  UNPAID: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900',
  PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900',
}

// ---------- تنسيقات ----------

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('ar', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(date))
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('ar', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} بايت`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} كيلوبايت`
  return `${(bytes / (1024 * 1024)).toFixed(1)} ميجابايت`
}

/** تنسيق المبالغ بالريال اليمني */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return '—'
  return `${new Intl.NumberFormat('ar-YE-u-nu-latn', { maximumFractionDigits: 0 }).format(amount)} ريال`
}

export function timeAgo(date: string | Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'الآن'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `منذ ${minutes} دقيقة`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `منذ ${hours} ساعة`
  const days = Math.floor(hours / 24)
  if (days < 30) return `منذ ${days} يوم`
  return formatDate(date)
}

// ---------- الجولة 44: توقيت مكة المكرمة + نظام 12 ساعي (صباحاً/مساءً) ----------

/** المنطقة الزمنية الرسمية للمنصة — توقيت مكة المكرمة (UTC+3 ثابت) */
export const MECCA_TIME_ZONE = 'Asia/Riyadh'

/** وقت 12 ساعي (صباحاً/مساءً) بتوقيت مكة المكرمة — مثال: «8:30 مساءً» */
export function formatTime12(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('ar', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: MECCA_TIME_ZONE,
  }).format(new Date(date))
}

/** تاريخ + وقت 12 ساعي بتوقيت مكة المكرمة — مثال: «12 سبتمبر، 8:30 مساءً» */
export function formatDateTimeMecca(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('ar', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: MECCA_TIME_ZONE,
  }).format(new Date(date))
}

export interface Time12Parts {
  hour: string // 1..12
  minute: string // 00 | 15 | 30 | 45
  period: 'AM' | 'PM' // AM = صباحاً | PM = مساءً
}

/** تحويل مكونات 12 ساعي إلى نص 24 ساعي 'HH:mm' — يُرسل للخادم */
export function time12To24(p: Time12Parts): string {
  const h = Math.min(12, Math.max(1, Number(p.hour) || 12))
  const h24 = p.period === 'AM' ? (h === 12 ? 0 : h) : h === 12 ? 12 : h + 12
  const minute = ['00', '15', '30', '45'].includes(p.minute) ? p.minute : '00'
  return `${String(h24).padStart(2, '0')}:${minute}`
}

/** تحويل 'HH:mm' 24 ساعي إلى مكونات 12 ساعي — للعرض والتحرير */
export function time24To12(t: string): Time12Parts {
  const [h24Raw, mRaw] = t.split(':')
  const h24 = Math.min(23, Math.max(0, Number(h24Raw) || 0))
  const period: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return { hour: String(h12), minute: String(mRaw ?? '00').padStart(2, '0'), period }
}

/** تركيب تاريخ (YYYY-MM-DD) + وقت 24 ساعي (HH:mm) كتوقيت مكة المكرمة (+03:00 ثابت)
 *  — مستقل عن منطقة الخادم الزمنية نهائياً */
export function meccaDateTime(dateStr: string, timeStr: string): Date {
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(timeStr) ? timeStr : '00:00'
  return new Date(`${dateStr}T${time}:00+03:00`)
}

/** فرق الساعات بين وقتين 'HH:mm' — يدعم عبور منتصف الليل (وردية ليلية) */
export function hoursBetween(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  let mins = eh * 60 + em - (sh * 60 + sm)
  if (mins <= 0) mins += 24 * 60
  return Math.round((mins / 60) * 100) / 100
}

/** إضافة ساعات إلى وقت 'HH:mm' — يعيد 'HH:mm' ويدعم عبور منتصف الليل */
export function addHoursToTime(startTime: string, hours: number): string {
  const [h, m] = startTime.split(':').map(Number)
  const total = (h * 60 + m + Math.round(hours * 60)) % (24 * 60)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** حقول العرض بدون الرسوم — تُستخدم في العميل والخادم (آمنة للاستيراد من العميل) */
export interface PromoFields {
  promoActive?: boolean
  promoUntil?: string | null
}

/**
 * هل العرض بدون الرسوم نشط الآن؟ — الجولة 44
 * نشط = promoActive + (promoUntil فارغ أو لم يحن بعده)
 * تعيش هنا في utils لصحتها للاستيراد من مكونات العميل — lib/settings تُعيد تصديرها
 */
export function isPromoActive(
  settings: PromoFields,
  now: Date = new Date()
): boolean {
  if (!settings.promoActive) return false
  if (!settings.promoUntil) return true
  const until = new Date(settings.promoUntil)
  return !Number.isNaN(until.getTime()) && now.getTime() <= until.getTime()
}
