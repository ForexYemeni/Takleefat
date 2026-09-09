'use client'

import Link from 'next/link'
import { BellRing, ClipboardList, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * بطاقة «وجود تكليف» في نظرة عامة (الجولة العاشرة) — تظهر أعلى صفحة
 * نظرة العام لكل من الإدارة والمستلم الإداري والكادر التمريضي بحسب سياقه.
 */

export interface AssignmentAlertCardProps {
  /** active: تكليف جارٍ/بانتظار إجراء — open: تكليف مفتوح متاح — empty: لا يوجد تكليف */
  tone: 'active' | 'open' | 'empty'
  eyebrow: string
  title: string
  subtitle?: string
  /** شرائح معلومات صغيرة (قيمة/كادر/عدد تقديمات...) */
  chips?: React.ReactNode
  href: string
  ctaLabel: string
}

const TONE_STYLES = {
  active: {
    wrap: 'border-s-4 border-s-amber-400 bg-gradient-to-bl from-amber-50 to-transparent dark:from-amber-950/20',
    icon: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
    Icon: BellRing,
  },
  open: {
    wrap: 'border-s-4 border-s-teal-500 bg-gradient-to-bl from-teal-50 to-transparent dark:from-teal-950/20',
    icon: 'bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300',
    Icon: Sparkles,
  },
  empty: {
    wrap: 'border-s-4 border-s-border bg-secondary/40',
    icon: 'bg-secondary text-secondary-foreground',
    Icon: ClipboardList,
  },
} as const

export function AssignmentAlertCard({
  tone,
  eyebrow,
  title,
  subtitle,
  chips,
  href,
  ctaLabel,
}: AssignmentAlertCardProps) {
  const t = TONE_STYLES[tone]
  return (
    <div className={`flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center ${t.wrap}`}>
      <span className={`rounded-xl p-2.5 ${t.icon}`}>
        <t.Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{eyebrow}</p>
        <p className="mt-0.5 truncate text-base font-extrabold">{title}</p>
        {subtitle && <p className="mt-0.5 truncate text-sm text-muted-foreground">{subtitle}</p>}
        {chips && <div className="mt-2 flex flex-wrap items-center gap-1.5">{chips}</div>}
      </div>
      <Button asChild className="shrink-0 gap-2">
        <Link href={href}>
          {ctaLabel}
        </Link>
      </Button>
    </div>
  )
}
