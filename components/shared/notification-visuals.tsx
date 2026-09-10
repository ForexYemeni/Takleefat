import {
  Bell,
  BellRing,
  ClipboardList,
  FileCheck2,
  UserCheck,
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
}

export function notificationVisuals(type: string): {
  icon: React.ComponentType<{ className?: string }>
  tint: string
} {
  return TYPE_STYLE[type] ?? { icon: Bell, tint: 'bg-primary/10 text-primary' }
}
