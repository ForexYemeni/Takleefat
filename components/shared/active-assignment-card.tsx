'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlarmClock, CalendarDays, MapPin, PlayCircle, Radio, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn, formatTime12, formatDate } from '@/lib/utils'

/**
 * بطاقة التكليف الحالي مع العد التنازلي الحي — الجولتان 46/49
 * =====================================================================
 * البلاغ الحرفي: «عندما يكون لدى الكادر التمريضي او الطبيب تكليف يجب ان
 * تظهر بطاقة صغيرة احترافية جدا في اعلى صفحة نظرة عامة مع العد التنازلي».
 * الجولة 49 — البلاغ الحرفي: «اضف في أعلى صفحة نظرة عامة للكادر التمريضي او
 * الطبيب الوقت التنازلي لانتهاء التكليف بشكل احترافي جداً»:
 *  - عدّ تنازلي مجزأ فاخر: أيام / ساعات / دقائق / ثواني (كل ثانية) —
 *    بدل صيغة الساعات الممتدة، فتكليف بعد يومين يُقرأ «02 أيام : 05 ساعات»
 *    لا «53:12:09».
 *  - قبل البدء: «تبدأ بعد» بعدّ مجزأ كهرماني.
 *  - أثناء التكليف: «جارية الآن — تنتهي بعد» بعدّ مجزأ زمردي + شريط تقدم نسبة الوقت.
 *  - بعد انتهاء الوقت (قبل الإنهاء الرسمي): تنبيه هادئ «انتهى وقت التكليف».
 * الأوقات بتوقيت مكة المكرمة بنظام 12 ساعة — والعدّ يبدأ بعد الترطيب
 * لتفادي اختلاف الخادم والمتصفح.
 */

function pad(n: number): string {
  return String(Math.max(0, n)).padStart(2, '0')
}

function diffParts(ms: number): { d: number; h: number; m: number; s: number } {
  const total = Math.max(0, Math.floor(ms / 1000))
  return {
    d: Math.floor(total / 86400),
    h: Math.floor((total % 86400) / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
  }
}

/**
 * العد التنازلي المجزأ الفاخر — الجولة 49: خلايا أيام/ساعات/دقائق/ثواني بأرقام
 * ضخمة ثابتة العرض (tabular-nums) تُقرأ فوراً كجدول مواعيد، مع إظهار خلية
 * الأيام فقط عند الحاجة للحفاظ على نظافة التكوين.
 */
function CountdownSegments({
  parts,
  tone,
}: {
  parts: { d: number; h: number; m: number; s: number }
  tone: 'emerald' | 'amber'
}) {
  const cells = [
    { v: parts.d, label: 'أيام', show: parts.d > 0 },
    { v: parts.h, label: 'ساعات', show: true },
    { v: parts.m, label: 'دقائق', show: true },
    { v: parts.s, label: 'ثواني', show: true },
  ].filter((c) => c.show)
  return (
    <div className="flex items-stretch gap-1.5" dir="ltr">
      {cells.map((c, i) => (
        <div key={c.label} className="flex items-stretch gap-1.5">
          {i > 0 && (
            <span
              className={cn(
                'self-center text-lg font-extrabold leading-none opacity-40',
                tone === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
              )}
              aria-hidden
            >
              :
            </span>
          )}
          <div
            className={cn(
              'min-w-12 rounded-xl border px-2 py-1.5 text-center shadow-sm',
              tone === 'emerald'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
            )}
          >
            <p className="text-xl font-extrabold leading-none tabular-nums">{pad(c.v)}</p>
            <p className="mt-1 text-[9px] font-bold opacity-70">{c.label}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

export interface ActiveAssignmentData {
  id: string
  title: string
  facility: string
  department: string | null
  startDate: string
  /** وقت انتهاء التكليف المحسوب — من تكليف مُعلن بساعات محددة (قد يكون null) */
  endDate: string | null
  status: string
  /** الطرف المساند: المستلم الإداري أو مشرف الأطباء */
  receiverName: string
}

export function ActiveAssignmentCard({
  assignment,
  href,
  ctaLabel = 'متابعة التكليف',
}: {
  assignment: ActiveAssignmentData
  href: string
  ctaLabel?: string
}) {
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    const t0 = setTimeout(() => setNow(Date.now()), 0)
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      clearTimeout(t0)
      clearInterval(t)
    }
  }, [])

  const start = new Date(assignment.startDate).getTime()
  const end = assignment.endDate ? new Date(assignment.endDate).getTime() : null
  const live = now != null && Number.isFinite(start)

  const started = live && now! >= start
  const ended = end != null && live && now! >= end
  const beforeStart = live && !started

  // شريط تقدم نسبة الوقت المنقضي من التكليف (أثناء السير فقط)
  const progress =
    live && started && end != null && end > start
      ? Math.min(100, Math.max(0, ((now! - start) / (end - start)) * 100))
      : null

  const remain = started && end != null && live ? diffParts(end - now!) : null
  const untilStart = beforeStart && live ? diffParts(start - now!) : null

  // قبل لحظة الترطيب: نفس الارتفاع بهيكل ثابت لثبات التخطيط
  const phase = !live ? 'loading' : ended ? 'ended' : started ? 'running' : 'upcoming'

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-s-4 p-4 shadow-sm sm:p-5',
        phase === 'running' &&
          'border-s-emerald-500 bg-gradient-to-bl from-emerald-50 via-transparent to-transparent dark:border-s-emerald-500 dark:from-emerald-950/30',
        phase === 'upcoming' &&
          'border-s-amber-400 bg-gradient-to-bl from-amber-50 via-transparent to-transparent dark:border-s-amber-400 dark:from-amber-950/25',
        phase === 'ended' &&
          'border-s-violet-400 bg-gradient-to-bl from-violet-50 via-transparent to-transparent dark:border-s-violet-400 dark:from-violet-950/25',
        phase === 'loading' && 'border-s-border bg-secondary/30'
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        {/* الهوية: أيقونة الحالة + العنوان والجهة */}
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            className={cn(
              'shrink-0 rounded-xl p-2.5',
              phase === 'running' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
              phase === 'upcoming' && 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
              phase === 'ended' && 'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300',
              phase === 'loading' && 'bg-secondary text-secondary-foreground'
            )}
          >
            {phase === 'upcoming' ? (
              <AlarmClock className="size-5" />
            ) : phase === 'running' ? (
              <Radio className="size-5" />
            ) : (
              <PlayCircle className="size-5" />
            )}
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              تكليفك الحالي
            </p>
            <p className="mt-0.5 truncate text-base font-extrabold">{assignment.title}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3 shrink-0" />
                <span className="truncate">
                  {assignment.facility}
                  {assignment.department ? ` — ${assignment.department}` : ''}
                </span>
              </span>
              <span className="inline-flex items-center gap-1">
                <UserRound className="size-3 shrink-0" />
                <span className="truncate">{assignment.receiverName}</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3 shrink-0" />
                <span className="shrink-0">
                  {formatDate(assignment.startDate)} • {formatTime12(assignment.startDate)}
                  {assignment.endDate ? ` — ينتهي ${formatTime12(assignment.endDate)}` : ''}
                </span>
              </span>
            </p>
          </div>
        </div>

        {/* العد التنازلي الحي */}
        <div className="flex shrink-0 items-center gap-3 lg:justify-end">
          {phase === 'running' && (
            <div className="text-left">
              {remain ? (
                <>
                  <p className="mb-1.5 flex items-center justify-start gap-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                    <span className="relative flex size-1.5">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                      <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                    </span>
                    جارية الآن — تنتهي بعد
                  </p>
                  {/* الجولة 49: عدّ تنازلي مجزأ فاخر حتى نهاية التكليف */}
                  <CountdownSegments parts={remain} tone="emerald" />
                  {progress != null && (
                    <div className="mt-2 h-1.5 w-44 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-950">
                      <div
                        className="h-full rounded-full bg-gradient-to-l from-emerald-500 to-teal-500 transition-[width] duration-1000 ease-linear"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}
                </>
              ) : (
                <p className="flex items-center gap-1.5 text-sm font-extrabold text-emerald-700 dark:text-emerald-300">
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                  </span>
                  جارية الآن
                </p>
              )}
            </div>
          )}

          {phase === 'upcoming' && untilStart && (
            <div className="text-left">
              <p className="mb-1.5 text-[11px] font-bold text-amber-700 dark:text-amber-300">تبدأ بعد</p>
              {/* الجولة 49: عدّ تنازلي مجزأ فاخر حتى بداية التكليف */}
              <CountdownSegments parts={untilStart} tone="amber" />
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                بتوقيت مكة المكرمة • {formatDate(assignment.startDate)} — {formatTime12(assignment.startDate)}
              </p>
            </div>
          )}

          {phase === 'ended' && (
            <div className="text-left">
              <p className="text-sm font-extrabold text-violet-700 dark:text-violet-300">
                انتهى وقت هذا التكليف
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                بانتظار تأكيد الإنهاء والتقييم من الطرفين
              </p>
            </div>
          )}

          {phase === 'loading' && <span className="inline-block h-14 w-44" aria-hidden />}

          <Button asChild className="shrink-0 gap-2">
            <Link href={href}>{ctaLabel}</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
