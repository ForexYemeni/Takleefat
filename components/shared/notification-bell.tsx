'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useNotifications, type AppNotification } from '@/hooks/use-notifications'
import {
  Bell,
  BellRing,
  CheckCheck,
  ClipboardList,
  FileCheck2,
  Trash2,
  UserCheck,
  UserX,
  Wallet,
} from 'lucide-react'
import { timeAgo, cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'

/**
 * جرس الإشعارات — لوحة احترافية تفتح جهة اليمين (بداية السطر في RTL)
 * بطاقات ملونة بحسب النوع + تعليم كمقروء + حذف فردي + حذف الكل.
 */

const TYPE_STYLE: Record<string, { icon: React.ComponentType<{ className?: string }>; tint: string }> = {
  ACCOUNT_APPROVED: { icon: UserCheck, tint: 'bg-emerald-500/10 text-emerald-600' },
  ACCOUNT_REJECTED: { icon: UserX, tint: 'bg-red-500/10 text-red-600' },
  DOCUMENT_UPLOADED: { icon: FileCheck2, tint: 'bg-sky-500/10 text-sky-600' },
  DOCUMENT_REVIEWED: { icon: FileCheck2, tint: 'bg-sky-500/10 text-sky-600' },
  ASSIGNMENT_CREATED: { icon: ClipboardList, tint: 'bg-violet-500/10 text-violet-600' },
  ASSIGNMENT_RECEIVED: { icon: ClipboardList, tint: 'bg-violet-500/10 text-violet-600' },
  ASSIGNMENT_COMPLETED: { icon: BadgeIcon, tint: 'bg-emerald-500/10 text-emerald-600' },
  ASSIGNMENT_CANCELLED: { icon: UserX, tint: 'bg-amber-500/10 text-amber-600' },
  POST_CREATED: { icon: ClipboardList, tint: 'bg-teal-500/10 text-teal-600' },
  APPLICATION_SUBMITTED: { icon: BellRing, tint: 'bg-teal-500/10 text-teal-600' },
  APPLICATION_APPROVED: { icon: BadgeIcon, tint: 'bg-emerald-500/10 text-emerald-600' },
  APPLICATION_REJECTED: { icon: UserX, tint: 'bg-red-500/10 text-red-600' },
}

function BadgeIcon({ className }: { className?: string }) {
  return <Wallet className={className} />
}

function iconFor(type: string) {
  return TYPE_STYLE[type] ?? { icon: Bell, tint: 'bg-primary/10 text-primary' }
}

export function NotificationBell() {
  const { notifications, unreadCount, isLoading, markRead, deleteOne, deleteAll, isDeleting } =
    useNotifications()
  const [open, setOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<AppNotification | null>(null)

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative" aria-label="الإشعارات">
            <Bell className="size-5" />
            {unreadCount > 0 && (
              <span className="absolute -end-0.5 -top-0.5 flex size-5 animate-pulse items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground shadow">
                {unreadCount > 9 ? '+9' : unreadCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>

        {/* align="start" تفتح اللوحة من جهة اليمين في واجهة RTL */}
        <PopoverContent align="start" sideOffset={10} className="w-[22rem] rounded-2xl border-border/70 p-0 shadow-xl">
          <div className="flex items-center justify-between gap-2 rounded-t-2xl border-b bg-muted/50 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="relative flex size-2">
                <span className={cn('absolute inline-flex size-2 rounded-full', unreadCount > 0 ? 'animate-ping bg-destructive/60' : 'bg-emerald-500')} />
                <span className={cn('relative inline-flex size-2 rounded-full', unreadCount > 0 ? 'bg-destructive' : 'bg-emerald-500')} />
              </span>
              <span className="text-sm font-extrabold">الإشعارات</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold text-white">
                  {unreadCount} جديد
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 rounded-lg text-[11px]"
                  onClick={() => markRead({ all: true })}
                >
                  <CheckCheck className="size-3.5" />
                  تعليم الكل كمقروء
                </Button>
              )}
              {notifications.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 rounded-lg text-muted-foreground hover:text-destructive"
                  aria-label="حذف جميع الإشعارات"
                  onClick={() => setConfirmClear(true)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
          </div>

          <ScrollArea className="max-h-[26rem]">
            {isLoading ? (
              <p className="p-8 text-center text-sm text-muted-foreground">جارٍ التحميل...</p>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-3 p-10 text-center">
                <span className="flex size-14 items-center justify-center rounded-2xl bg-muted">
                  <Bell className="size-7 text-muted-foreground/50" />
                </span>
                <div>
                  <p className="text-sm font-bold">لا توجد إشعارات</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    ستصلك هنا الإشعارات والتحدَّثات المهمة
                  </p>
                </div>
              </div>
            ) : (
              notifications.map((n: AppNotification) => {
                const { icon: Icon, tint } = iconFor(n.type)
                const inner = (
                  <div
                    className={cn(
                      'group relative flex w-full gap-3 border-b px-4 py-3 text-start transition-colors last:border-0 hover:bg-accent/60',
                      !n.isRead && 'bg-primary/[0.045]'
                    )}
                  >
                    <span className={cn('mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl', tint)}>
                      <Icon className="size-4.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn('text-[13px] leading-snug', n.isRead ? 'font-semibold text-foreground/80' : 'font-extrabold')}>
                          {n.title}
                        </p>
                        {!n.isRead && <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" />}
                      </div>
                      {n.body && (
                        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {n.body}
                        </p>
                      )}
                      <p className="mt-1 text-[10.5px] font-medium text-muted-foreground/70">
                        {timeAgo(n.createdAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="حذف الإشعار"
                      className="absolute end-2 top-2 flex size-6 items-center justify-center rounded-lg text-muted-foreground/50 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setPendingDelete(n)
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )

                return n.link ? (
                  <Link
                    key={n.id}
                    href={n.link}
                    onClick={() => {
                      if (!n.isRead) markRead({ id: n.id })
                      setOpen(false)
                    }}
                    className="block"
                  >
                    {inner}
                  </Link>
                ) : (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      if (!n.isRead) markRead({ id: n.id })
                    }}
                    className="block w-full"
                  >
                    {inner}
                  </button>
                )
              })
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {/* تأكيد حذف إشعار واحد */}
      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(v) => !v && setPendingDelete(null)}
        tone="danger"
        icon={Trash2}
        title="حذف الإشعار"
        description={pendingDelete ? `سيتم حذف «${pendingDelete.title}» نهائياً من قائمة إشعاراتك.` : ''}
        confirmLabel="نعم، احذف الإشعار"
        processing={isDeleting}
        onConfirm={() => {
          if (!pendingDelete) return
          deleteOne(pendingDelete.id, {
            onSuccess: () => setPendingDelete(null),
          })
        }}
      />

      {/* تأكيد حذف جميع الإشعارات */}
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        tone="danger"
        icon={Trash2}
        title="حذف جميع الإشعارات"
        description={`سيتم حذف كل إشعاراتك (${notifications.length}) نهائياً ولا يمكن استرجاعها.`}
        confirmLabel="نعم، احذف الكل"
        processing={isDeleting}
        onConfirm={() => {
          deleteAll(undefined, {
            onSuccess: () => {
              setConfirmClear(false)
            },
          })
        }}
      />
    </>
  )
}
