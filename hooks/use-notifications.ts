'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetcher } from '@/lib/api-client'

export interface AppNotification {
  id: string
  title: string
  body: string | null
  type: string
  link: string | null
  isRead: boolean
  createdAt: string
}

/**
 * إشعارات المستخدم — تحديث تلقائي كل 15 ثانية
 */
export function useNotifications() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: () =>
      apiFetcher<{ notifications: AppNotification[]; unreadCount: number }>(
        '/api/notifications'
      ),
    refetchInterval: 15000,
  })

  const markRead = useMutation({
    mutationFn: (payload: { id?: string; all?: boolean }) =>
      fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  return {
    notifications: query.data?.notifications ?? [],
    unreadCount: query.data?.unreadCount ?? 0,
    isLoading: query.isLoading,
    markRead: markRead.mutate,
  }
}
