'use client'

import { CheckCircle2, CircleDashed, Clock3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StaffAvatar as SharedStaffAvatar } from '@/components/shared/staff-avatar'

/**
 * الجولة 63 — أدوات عرض حالة مستندات الكادر:
 * ملخص النواقص يظهر في القائمة مباشرة (بلا فتح الملف) + داخل حوار المراجعة،
 * وهو جوهر مبدأ «الإدارة تعرف حالة أي كادر خلال ثوانٍ».
 * كل البيانات حقيقية من /api/admin/users — لا بيانات وهمية.
 */

/** أنواع المستندات الإجبارية للتوثيق — نفس قيم DocumentType في قاعدة البيانات */
export const REQUIRED_DOC_TYPES = ['ID_CARD', 'PRACTICE_LICENSE', 'EXPERIENCE_CERT'] as const

export type DocLite = { type: string; status: string }

export interface DocsSummary {
  /** حالة كل نوع إجباري: APPROVED / PENDING / REJECTED — أو undefined إن لم يُرفع */
  byType: Partial<Record<(typeof REQUIRED_DOC_TYPES)[number], string>>
  /** عدد الأنواع الإجبارية المرفوعة */
  uploadedCount: number
  /** عدد الأنواع الإجبارية المعتمدة */
  approvedCount: number
  /** الملف مكتمل: الأنواع الثلاثة كلها معتمدة */
  complete: boolean
  /** لديه أي مستندات مرفوعة إطلاقاً */
  hasAny: boolean
}

export function summarizeDocs(documents: DocLite[] | undefined | null): DocsSummary {
  const list = documents ?? []
  const byType: DocsSummary['byType'] = {}
  for (const d of list) {
    if ((REQUIRED_DOC_TYPES as readonly string[]).includes(d.type) && !byType[d.type as never]) {
      byType[d.type as (typeof REQUIRED_DOC_TYPES)[number]] = d.status
    }
  }
  const uploadedCount = Object.keys(byType).length
  const approvedCount = Object.values(byType).filter((s) => s === 'APPROVED').length
  return {
    byType,
    uploadedCount,
    approvedCount,
    complete: approvedCount === REQUIRED_DOC_TYPES.length,
    hasAny: list.length > 0,
  }
}

/** شارات مصغّرة لملخص المستندات — تُعرض في صف الجدول وبطاقة الجوال */
export function DocStatusChips({
  documents,
  className,
}: {
  documents: DocLite[] | undefined | null
  className?: string
}) {
  const s = summarizeDocs(documents)

  if (!s.hasAny) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11px] font-medium text-muted-foreground',
          className
        )}
      >
        <CircleDashed className="size-3" />
        لا مستندات بعد
      </span>
    )
  }

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      {REQUIRED_DOC_TYPES.map((type) => {
        const st = s.byType[type]
        const tone =
          st === 'APPROVED'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300'
            : st === 'PENDING'
              ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300'
              : st === 'REJECTED'
                ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300'
                : 'border-border bg-muted/60 text-muted-foreground'
        return (
          <span
            key={type}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10.5px] font-semibold leading-none',
              tone
            )}
          >
            {st === 'APPROVED' ? (
              <CheckCircle2 className="size-3" />
            ) : st === 'PENDING' || st === 'REJECTED' ? (
              <Clock3 className="size-3" />
            ) : (
              <CircleDashed className="size-3" />
            )}
            {type === 'ID_CARD' ? 'الهوية' : type === 'PRACTICE_LICENSE' ? 'المزاولة' : 'الخبرة'}
          </span>
        )
      })}
      {s.complete && (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10.5px] font-bold leading-none text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
          <CheckCircle2 className="size-3" />
          الملف مكتمل
        </span>
      )}
    </span>
  )
}

/** أفاتار الكادر — غلاف فوق مكوّن الجولة 61 المشترك مع رابط صورة البروفايل العامة */
export function StaffAvatar({
  name,
  photoBlobId,
  className,
}: {
  name: string
  photoBlobId?: string | null
  className?: string
}) {
  return (
    <SharedStaffAvatar
      name={name}
      photoUrl={photoBlobId ? `/api/files/blob/${photoBlobId}` : null}
      className={cn('size-10 rounded-full object-cover ring-2 ring-background', className)}
      fallbackClassName="rounded-full bg-gradient-to-br from-cyan-500/15 to-cyan-500/5 text-cyan-700 ring-1 ring-cyan-500/20 dark:text-cyan-300"
    />
  )
}
