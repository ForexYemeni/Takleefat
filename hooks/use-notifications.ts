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
 * + حذف فردي وحذف الكل وتعليم كمقروء
 */
export function useNotifications() {
  const queryClient = useQueryClient()

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['notifications'] })

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
    onSuccess: invalidate,
  })

  const deleteOne = useMutation({
    mutationFn: (id: string) => apiFetcher<{ message: string }>(`/api/notifications/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })

  const deleteAll = useMutation({
    mutationFn: () => apiFetcher<{ message: string }>('/api/notifications', { method: 'DELETE' }),
    onSuccess: invalidate,
  })

  return {
    notifications: query.data?.notifications ?? [],
    unreadCount: query.data?.unreadCount ?? 0,
    isLoading: query.isLoading,
    markRead: markRead.mutate,
    deleteOne: deleteOne.mutate,
    deleteAll: deleteAll.mutate,
    isDeleting: deleteOne.isPending || deleteAll.isPending,
  }
}
