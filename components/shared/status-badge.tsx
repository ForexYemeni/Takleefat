import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  status: string
  labels: Record<string, string>
  className?: string
}

/**
 * شارة حالة موحدة (حساب / مستند / تكليف)
 */
export function StatusBadge({ status, labels, className }: StatusBadgeProps) {
  const label = labels[status] ?? status
  const colorClass =
    status === 'PENDING'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : status === 'APPROVED' || status === 'COMPLETED'
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : status === 'ACTIVE'
          ? 'bg-teal-50 text-teal-700 border-teal-200'
          : status === 'RECEIVED'
            ? 'bg-cyan-50 text-cyan-700 border-cyan-200'
            : status === 'REJECTED'
              ? 'bg-red-50 text-red-700 border-red-200'
              : 'bg-gray-100 text-gray-600 border-gray-200'

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
        colorClass,
        className
      )}
    >
      {label}
    </span>
  )
}
