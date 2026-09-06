'use client'

import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * نجوم التقييم الاحترافية — تكليفات | Takleefat
 * Stars: عرض النجوم (ممتلئة/نصف) — StarRatingInput: إدخال بالضغط
 */

const SIZES = {
  sm: 'size-3.5',
  md: 'size-5',
  lg: 'size-8',
} as const

export function Stars({
  value,
  size = 'sm',
  className,
}: {
  value: number
  size?: keyof typeof SIZES
  className?: string
}) {
  const filled = Math.round(Math.max(0, Math.min(5, value)))
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} dir="ltr">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            SIZES[size],
            i <= filled ? 'fill-amber-400 text-amber-400' : 'fill-muted text-muted-foreground/30'
          )}
        />
      ))}
    </span>
  )
}

export function StarRatingInput({
  value,
  onChange,
  size = 'lg',
}: {
  value: number
  onChange: (v: number) => void
  size?: keyof typeof SIZES
}) {
  return (
    <div className="flex items-center gap-1" dir="ltr">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          aria-label={`${i} من 5`}
          className={cn(
            'transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full',
            i <= value ? '' : 'opacity-60'
          )}
          onClick={() => onChange(i)}
        >
          <Star
            className={cn(
              SIZES[size],
              i <= value ? 'fill-amber-400 text-amber-400 drop-shadow-sm' : 'text-muted-foreground/40'
            )}
          />
        </button>
      ))}
    </div>
  )
}
