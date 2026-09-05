'use client'

import { useNotifications, type AppNotification } from '@/hooks/use-notifications'
import { Bell, CheckCheck } from 'lucide-react'
import { timeAgo } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import Link from 'next/link'

/**
 * جرس الإشعارات مع قائمة الإشعارات غير المقروءة
 */
export function NotificationBell() {
  const { notifications, unreadCount, isLoading, markRead } = useNotifications()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="الإشعارات">
          <Bell className="size-5" />
          {unreadCount > 0 && (
            <span className="absolute -end-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 9 ? '+9' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2.5">
          <span className="text-sm font-bold">الإشعارات</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => markRead({ all: true })}
            >
              <CheckCheck className="size-3.5" />
              تعليم الكل كمقروء
            </Button>
          )}
        </div>
        <DropdownMenuSeparator className="m-0" />
        <ScrollArea className="max-h-96">
          {isLoading ? (
            <p className="p-6 text-center text-sm text-muted-foreground">جارٍ التحميل...</p>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <Bell className="size-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">لا توجد إشعارات بعد</p>
            </div>
          ) : (
            notifications.map((n: AppNotification) => (
              <NotificationItem key={n.id} notification={n} onRead={() => markRead({ id: n.id })} />
            ))
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NotificationItem({
  notification,
  onRead,
}: {
  notification: AppNotification
  onRead: () => void
}) {
  const content = (
    <div
      className={cn(
        'flex w-full flex-col gap-1 border-b px-3 py-3 text-start transition-colors last:border-0 hover:bg-accent',
        !notification.isRead && 'bg-teal-50/60'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-snug">{notification.title}</p>
        {!notification.isRead && <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" />}
      </div>
      {notification.body && (
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{notification.body}</p>
      )}
      <p className="text-[11px] text-muted-foreground/70">{timeAgo(notification.createdAt)}</p>
    </div>
  )

  if (notification.link) {
    return (
      <Link href={notification.link} onClick={onRead} className="block">
        {content}
      </Link>
    )
  }
  return (
    <button onClick={onRead} className="block w-full">
      {content}
    </button>
  )
}
