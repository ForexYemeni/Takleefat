'use client'

import { useEffect, useState } from 'react'
import { AlarmClock, Hourglass, PlayCircle } from 'lucide-react'
import { cn, formatTime12, MECCA_TIME_ZONE } from '@/lib/utils'

/**
 * العداد التنازلي الحي لبداية التكليف — الجولة 44
 * =====================================================
 * شارة حية تُحدَّث كل ثانية وتظهر في كل الحسابات (المستلم الإداري / مشرف
 * الأطباء / الكادر التمريضي / الطبيب):
 *  - قبل البدء (خلال 24 ساعة): «تبدأ بعد 02:14:09» بعداد تنازلي تنازلي حي
 *  - قبل البدء (أبعد): التاريخ والوقت المتوقعان بتوقيت مكة المكرمة
 *  - أثناء المناوبة: «جارية الآن — تنتهي بعد 05:12:33» بنبض أخضر
 *  - بعد الانتهاء: «منتهية» هادئة
 * الأوقات تُعرض بنظام 12 ساعي (صباحاً/مساءً) بتوقيت مكة المكرمة حصراً.
 */

function pad(n: number): string {
  return String(Math.max(0, n)).padStart(2, '0')
}

function diffParts(ms: number): { h: number; m: number; s: number } {
  const total = Math.max(0, Math.floor(ms / 1000))
  return {
    h: Math.floor(total / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
  }
}

export function ShiftCountdown({
  startDate,
  endDate,
  className = '',
  compact = false,
}: {
  startDate: string | Date
  /** وقت الانتهاء (إن وُجد) — لحساب «تنتهي بعد» أثناء المناوبة */
  endDate?: string | Date | null
  className?: string
  /** نسخة مدمجة لصفوف البطاقات الصغيرة — بلا نص زائد */
  compact?: boolean
}) {
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    // بعد التركيب فقط — لتفادي اختلاف الترطيب بين الخادم والمتصفح
    // (المهلة صفرية تُبعد الضبط الأول عن جسم التأثير نفسه)
    const t0 = setTimeout(() => setNow(Date.now()), 0)
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      clearTimeout(t0)
      clearInterval(t)
    }
  }, [])

  const start = new Date(startDate).getTime()
  const end = endDate ? new Date(endDate).getTime() : null
  if (!Number.isFinite(start)) return null

  // قبل لحظة الترطيب الأولى لا نعرض شيئاً (نفس ارتفاع الشارة لثبات التخطيط)
  if (now == null)
    return <span className={cn('inline-block h-5', className)} aria-hidden />

  const started = now >= start
  const ended = end != null && now >= end
  const within24h = start - now <= 24 * 60 * 60 * 1000

  if (ended) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground',
          className
        )}
        title="انتهى وقت هذا التكليف"
      >
        <Hourglass className="size-3" />
        منتهية
      </span>
    )
  }

  if (started) {
    // جارية الآن — تنتهي بعد (إن وُجد وقت انتهاء)
    const remain = end != null ? diffParts(end - now) : null
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700 tabular-nums dark:bg-emerald-950/50 dark:text-emerald-300',
          className
        )}
        title="المناوبة جارية الآن"
      >
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-70" />
          <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
        </span>
        {compact ? (
          <>جارية الآن{remain ? ` — ${pad(remain.h)}:${pad(remain.m)}:${pad(remain.s)}` : ''}</>
        ) : (
          <>
            جارية الآن
            {remain && (
              <span dir="ltr">
                — {pad(remain.h)}:{pad(remain.m)}:{pad(remain.s)}
              </span>
            )}
          </>
        )}
      </span>
    )
  }

  // قبل البدء
  if (within24h) {
    const d = diffParts(start - now)
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold text-amber-800 tabular-nums dark:bg-amber-950/50 dark:text-amber-300',
          className
        )}
        title="عداد تنازلي حي لبداية التكليف — بتوقيت مكة المكرمة"
      >
        <AlarmClock className="size-3" />
        {compact ? (
          <span dir="ltr">
            {pad(d.h)}:{pad(d.m)}:{pad(d.s)}
          </span>
        ) : (
          <>
            تبدأ بعد{' '}
            <span dir="ltr">
              {pad(d.h)}:{pad(d.m)}:{pad(d.s)}
            </span>
          </>
        )}
      </span>
    )
  }

  // أبعد من 24 ساعة — التاريخ والوقت المتوقعان
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-secondary/70 px-2 py-0.5 text-[10px] font-bold text-muted-foreground',
        className
      )}
      title={`تبدأ بتوقيت مكة المكرمة (${MECCA_TIME_ZONE})`}
    >
      <PlayCircle className="size-3" />
      تبدأ {formatTime12(new Date(start))}
    </span>
  )
}
