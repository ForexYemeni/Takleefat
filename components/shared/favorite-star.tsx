'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Star } from 'lucide-react'
import { toast } from 'sonner'
import { apiDelete, apiPost } from '@/lib/api-client'
import { cn } from '@/lib/utils'

/**
 * زر المفضلة ⭐/★ — يظهر في كل مكان يظهر فيه الكادر للمستلم الإداري:
 * نتائج البحث، المطابقة الذكية، التقديمات، صفحة المفضلة.
 * القائمة خاصة بكل مستلم ولا تظهر لغيره.
 */
export function FavoriteStar({
  nurseId,
  isFavorite,
  size = 'md',
  showLabel = false,
  onChanged,
}: {
  nurseId: string
  isFavorite: boolean
  size?: 'sm' | 'md'
  showLabel?: boolean
  onChanged?: () => void
}) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async () => {
      if (isFavorite) {
        return apiDelete<{ message: string }>(`/api/receiver/favorites?nurseId=${nurseId}`)
      }
      return apiPost<{ message: string }>('/api/receiver/favorites', { nurseId })
    },
    onSuccess: (res) => toast.success(res.message),
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] })
      queryClient.invalidateQueries({ queryKey: ['receiver-nurses'] })
      queryClient.invalidateQueries({ queryKey: ['suggested-nurses'] })
      queryClient.invalidateQueries({ queryKey: ['receiver-staff'] })
      onChanged?.()
    },
  })

  const iconSize = size === 'sm' ? 'size-3.5' : 'size-4'

  if (showLabel) {
    return (
      <button
        type="button"
        disabled={mutation.isPending}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          mutation.mutate()
        }}
        className={cn(
          'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors',
          isFavorite
            ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300'
            : 'border-border bg-background text-muted-foreground hover:border-amber-300 hover:text-amber-700'
        )}
      >
        <Star className={cn(iconSize, isFavorite && 'fill-amber-400 text-amber-400')} />
        {isFavorite ? 'ضمن المفضلة' : 'إضافة إلى المفضلة'}
      </button>
    )
  }

  return (
    <button
      type="button"
      aria-label={isFavorite ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
      title={isFavorite ? 'ضمن المفضلة — اضغط للإزالة' : 'إضافة إلى المفضلة'}
      disabled={mutation.isPending}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        mutation.mutate()
      }}
      className="rounded-full p-1.5 transition-colors hover:bg-amber-50 dark:hover:bg-amber-950"
    >
      <Star
        className={cn(
          iconSize,
          isFavorite ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/50 hover:text-amber-400'
        )}
      />
    </button>
  )
}
