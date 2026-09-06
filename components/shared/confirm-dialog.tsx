'use client'

import {
  AlertTriangle,
  BadgeCheck,
  Ban,
  KeyRound,
  MapPin,
  Trash2,
  UserX,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

/**
 * بطاقة تأكيد احترافية — تكليفات | Takleefat
 * نافذة تأكيد أنيقة تُستخدم بدل نافذة المتصفح المبتدئة confirm()
 * مع أيقونة وتدرّج لوني حسب نوع الإجراء (حذف / إيقاف / اعتماد...).
 */

export type ConfirmTone = 'danger' | 'warning' | 'success' | 'neutral'

const TONE_STYLES: Record<
  ConfirmTone,
  { icon: React.ComponentType<{ className?: string }>; ring: string; bg: string; action: string }
> = {
  danger: {
    icon: Trash2,
    ring: 'ring-destructive/20',
    bg: 'bg-destructive/10 text-destructive',
    action: 'bg-destructive text-white hover:bg-destructive/90',
  },
  warning: {
    icon: Ban,
    ring: 'ring-amber-500/20',
    bg: 'bg-amber-500/10 text-amber-600',
    action: 'bg-amber-600 text-white hover:bg-amber-600/90',
  },
  success: {
    icon: BadgeCheck,
    ring: 'ring-emerald-500/20',
    bg: 'bg-emerald-500/10 text-emerald-600',
    action: 'bg-emerald-600 text-white hover:bg-emerald-600/90',
  },
  neutral: {
    icon: AlertTriangle,
    ring: 'ring-primary/20',
    bg: 'bg-primary/10 text-primary',
    action: 'bg-primary text-primary-foreground hover:bg-primary/90',
  },
}

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** عنوان البطاقة — مثال: «حذف الحساب نهائياً» */
  title: string
  /** الوصف التفصيلي للنتيجة */
  description: string
  /** نص زر التأكيد — مثال: «نعم، احذف نهائياً» */
  confirmLabel?: string
  cancelLabel?: string
  tone?: ConfirmTone
  /** أيقونة مخصصة تُغلب الافتراضي */
  icon?: React.ComponentType<{ className?: string }>
  processing?: boolean
  onConfirm: () => void
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  tone = 'neutral',
  icon,
  processing = false,
  onConfirm,
}: ConfirmDialogProps) {
  const style = TONE_STYLES[tone]
  const Icon = icon ?? style.icon

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent dir="rtl" className={cn('max-w-md rounded-3xl ring-8', style.ring)}>
        <AlertDialogHeader className="items-center gap-4 text-center sm:items-center">
          <span className={cn('flex size-16 items-center justify-center rounded-2xl', style.bg)}>
            <Icon className="size-8" />
          </span>
          <AlertDialogTitle className="text-lg font-extrabold leading-snug">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-relaxed">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:justify-center">
          <AlertDialogCancel disabled={processing} className="rounded-xl">
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={processing}
            onClick={(e) => {
              e.preventDefault()
              onConfirm()
            }}
            className={cn('rounded-xl shadow-sm transition-all active:scale-[0.98]', style.action)}
          >
            {processing ? 'جارٍ التنفيذ...' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** نغمات جاهزة للحالات الشائعة */
export const ConfirmTones = {
  delete: 'danger' as ConfirmTone,
  suspend: 'warning' as ConfirmTone,
  approve: 'success' as ConfirmTone,
  resetPassword: 'neutral' as ConfirmTone,
  location: 'neutral' as ConfirmTone,
}

/** أيقونات جاهزة */
export const ConfirmIcons = { Trash2, Ban, BadgeCheck, KeyRound, UserX, MapPin }
