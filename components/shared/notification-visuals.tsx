import {
  Bell,
  BellRing,
  ClipboardList,
  FileCheck2,
  Gift,
  KeyRound,
  ShieldCheck,
  UserCheck,
  UserPlus,
  UserX,
  Wallet,
} from 'lucide-react'

/**
 * المرئيات المشتركة للإشعارات حسب النوع — الجولة السادسة عشرة
 * مصدر وحيد للحقائق يستخدمه جرس الإشعارات والطبقة الفورية المنبثقة معاً
 */

const TYPE_STYLE: Record<string, { icon: React.ComponentType<{ className?: string }>; tint: string }> = {
  ACCOUNT_APPROVED: { icon: UserCheck, tint: 'bg-emerald-500/10 text-emerald-600' },
  ACCOUNT_REJECTED: { icon: UserX, tint: 'bg-red-500/10 text-red-600' },
  DOCUMENT_UPLOADED: { icon: FileCheck2, tint: 'bg-sky-500/10 text-sky-600' },
  DOCUMENT_REVIEWED: { icon: FileCheck2, tint: 'bg-sky-500/10 text-sky-600' },
  ASSIGNMENT_CREATED: { icon: ClipboardList, tint: 'bg-violet-500/10 text-violet-600' },
  ASSIGNMENT_RECEIVED: { icon: ClipboardList, tint: 'bg-violet-500/10 text-violet-600' },
  ASSIGNMENT_COMPLETED: { icon: Wallet, tint: 'bg-emerald-500/10 text-emerald-600' },
  ASSIGNMENT_CANCELLED: { icon: UserX, tint: 'bg-amber-500/10 text-amber-600' },
  POST_CREATED: { icon: ClipboardList, tint: 'bg-teal-500/10 text-teal-600' },
  APPLICATION_SUBMITTED: { icon: BellRing, tint: 'bg-teal-500/10 text-teal-600' },
  APPLICATION_APPROVED: { icon: Wallet, tint: 'bg-emerald-500/10 text-emerald-600' },
  APPLICATION_REJECTED: { icon: UserX, tint: 'bg-red-500/10 text-red-600' },
  // ---------- الجولة 61: خصوصية المستندات ----------
  DOCUMENT_ACCESS_REQUESTED: { icon: KeyRound, tint: 'bg-amber-500/10 text-amber-600' },
  DOCUMENT_ACCESS_DECIDED: { icon: ShieldCheck, tint: 'bg-emerald-500/10 text-emerald-600' },
  DOCUMENT_ACCESS_GRANTED: { icon: ShieldCheck, tint: 'bg-emerald-500/10 text-emerald-600' },
  DOCUMENT_ACCESS_REVOKED: { icon: UserX, tint: 'bg-red-500/10 text-red-600' },
  // ---------- الجولة 75: برنامج إحالة تكليفات (إضافي بحت) ----------
  REFERRAL_REGISTERED: { icon: UserPlus, tint: 'bg-sky-500/10 text-sky-600' },
  REFERRAL_VERIFIED: { icon: ShieldCheck, tint: 'bg-teal-500/10 text-teal-600' },
  REFERRAL_ASSIGNED: { icon: ClipboardList, tint: 'bg-violet-500/10 text-violet-600' },
  REFERRAL_REWARD_ACCRUED: { icon: Gift, tint: 'bg-emerald-500/10 text-emerald-600' },
  REFERRAL_REWARD_USED: { icon: Wallet, tint: 'bg-sky-500/10 text-sky-600' },
  REFERRAL_DIRECT_INVITE: { icon: UserPlus, tint: 'bg-amber-500/10 text-amber-600' },
}

export function notificationVisuals(type: string): {
  icon: React.ComponentType<{ className?: string }>
  tint: string
} {
  return TYPE_STYLE[type] ?? { icon: Bell, tint: 'bg-primary/10 text-primary' }
}
