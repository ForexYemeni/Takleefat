import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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

export const GENDER_LABELS: Record<string, string> = {
  MALE: 'ذكر',
  FEMALE: 'أنثى',
}

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
