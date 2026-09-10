'use client'

import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useNotifications, type AppNotification } from '@/hooks/use-notifications'
import {
  Bell,
  CheckCheck,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { timeAgo, cn } from '@/lib/utils'
import { notificationVisuals } from '@/components/shared/notification-visuals'
import {
  isAlertSoundEnabled,
  setAlertSoundEnabled,
  subscribeAlertSound,
  playAlertChime,
} from '@/lib/alert-sound'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'

/**
 * جرس الإشعارات — درج احترافي ينزلق من جهة البداية (يمين الشاشة في RTL)
 * بعيد عن محتوى الصفحة، بكامل الارتفاع، وقابل للتمرير بسلاسة.
 * بطاقات ملونة بحسب النوع + تعليم كمقروء + حذف فردي + حذف الكل
 * + مفتاح كتم/تشغيل صوت التنبيه الفوري (الجولة السادسة عشرة).
 */

export function NotificationBell() {
  const { notifications, unreadCount, isLoading, markRead, deleteOne, deleteAll, isDeleting } =
    useNotifications()
  const [open, setOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<AppNotification | null>(null)
  // تفضيل الصوت عبر useSyncExternalStore — بلا setState داخل تأثيرات، ومتزامن بين التبويبات
  const soundOn = useSyncExternalStore(
    subscribeAlertSound,
    isAlertSoundEnabled,
    () => true
  )

  const toggleSound = () => {
    const next = !soundOn
    setAlertSoundEnabled(next)
    if (next) playAlertChime() // تأكيد مسموع فوري عند إعادة التفعيل
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        aria-label="الإشعارات"
        onClick={() => setOpen(true)}
      >
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span className="absolute -end-0.5 -top-0.5 flex size-5 animate-pulse items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground shadow">
            {unreadCount > 9 ? '+9' : unreadCount}
          </span>
        )}
      </Button>

      {/* درج الإشعارات — ينزلق من جهة اليمين (بداية RTL) بكامل الارتفاع مع تمرير سلس */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
          hideClose={false}
        >
          <SheetTitle className="sr-only">الإشعارات</SheetTitle>
          <SheetDescription className="sr-only">قائمة الإشعارات والتحديثات</SheetDescription>

          {/* رأس الدرج */}
          <div className="flex items-center justify-between gap-2 border-b bg-gradient-to-bl from-teal-50 to-transparent px-4 py-4 dark:from-teal-950/40">
            <div className="flex items-center gap-2.5">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-primary/10">
                <Bell className="size-5 text-primary" />
              </span>
              <div>
                <p className="text-base font-extrabold leading-tight">الإشعارات</p>
                <p className="text-xs text-muted-foreground">
                  {unreadCount > 0 ? `لديك ${unreadCount} إشعار جديد` : 'كل الإشعارات مقروءة'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-8 rounded-xl"
                aria-label={soundOn ? 'كتم صوت التنبيه' : 'تشغيل صوت التنبيه'}
                title={soundOn ? 'صوت التنبيه مفعّل — اضغط للكتم' : 'صوت التنبيه مكتوم — اضغط للتشغيل'}
                onClick={toggleSound}
              >
                {soundOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4 text-muted-foreground" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 rounded-xl"
                aria-label="إغلاق الإشعارات"
                onClick={() => setOpen(false)}
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>

          {/* شريط الأدوات */}
          {(unreadCount > 0 || notifications.length > 0) && (
            <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2">
              {unreadCount > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 rounded-lg text-[11px] font-bold"
                  onClick={() => markRead({ all: true })}
                >
                  <CheckCheck className="size-3.5" />
                  تعليم الكل كمقروء
                </Button>
              ) : (
                <span className="text-[11px] text-muted-foreground">
                  {notifications.length} إشعار
                </span>
              )}
              {notifications.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 rounded-lg text-[11px] text-muted-foreground hover:text-destructive"
                  onClick={() => setConfirmClear(true)}
                >
                  <Trash2 className="size-3.5" />
                  حذف جميع الإشعارات
                </Button>
              )}
            </div>
          )}

          {/* القائمة — تمرير أصلي سلس بكامل المساحة المتاحة */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {isLoading ? (
              <div className="space-y-3 p-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex animate-pulse gap-3 rounded-2xl border p-4">
                    <span className="size-10 shrink-0 rounded-xl bg-muted" />
                    <span className="flex-1 space-y-2">
                      <span className="block h-3.5 w-2/3 rounded bg-muted" />
                      <span className="block h-3 w-full rounded bg-muted" />
                      <span className="block h-2.5 w-1/4 rounded bg-muted" />
                    </span>
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-4 p-12 text-center">
                <span className="flex size-20 items-center justify-center rounded-3xl bg-muted">
                  <Bell className="size-9 text-muted-foreground/40" />
                </span>
                <div>
                  <p className="font-extrabold">لا توجد إشعارات</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    ستصلك هنا الإشعارات والتحدَّثات المهمة
                    <br />
                    المتعلقة بحسابك وتكليفاتك
                  </p>
                </div>
              </div>
            ) : (
              <ul className="divide-y">
                {notifications.map((n: AppNotification) => {
                  const { icon: Icon, tint } = notificationVisuals(n.type)
                  const inner = (
                    <>
                      <span
                        className={cn(
                          'mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl',
                          tint
                        )}
                      >
                        <Icon className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={cn(
                              'text-[13.5px] leading-snug',
                              n.isRead ? 'font-semibold text-foreground/80' : 'font-extrabold'
                            )}
                          >
                            {n.title}
                          </p>
                          {!n.isRead && (
                            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                          )}
                        </div>
                        {n.body && (
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            {n.body}
                          </p>
                        )}
                        <p className="mt-1.5 flex items-center gap-2 text-[10.5px] font-medium text-muted-foreground/70">
                          {timeAgo(n.createdAt)}
                          {!n.isRead && (
                            <Badge
                              variant="secondary"
                              className="h-4 px-1.5 text-[9px] font-bold text-primary"
                            >
                              جديد
                            </Badge>
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label="حذف الإشعار"
                        className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setPendingDelete(n)
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </>
                  )

                  return (
                    <li key={n.id} className={cn(!n.isRead && 'bg-primary/[0.045]')}>
                      {n.link ? (
                        <Link
                          href={n.link}
                          onClick={() => {
                            if (!n.isRead) markRead({ id: n.id })
                            setOpen(false)
                          }}
                          className="flex w-full gap-3 px-4 py-4 text-start transition-colors hover:bg-accent/60"
                        >
                          {inner}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            if (!n.isRead) markRead({ id: n.id })
                          }}
                          className="flex w-full gap-3 px-4 py-4 text-start transition-colors hover:bg-accent/60"
                        >
                          {inner}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>

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
