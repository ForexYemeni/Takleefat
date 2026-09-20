import { db } from '@/lib/db'
import { FORSAH_AUDIT_ACTIONS, type ForsahAuditAction } from '@/lib/forsah/constants'

/**
 * سجل تدقيق «فرصة» — الجولة 66 | تكليفات | Takleefat
 * ============================================================
 * كل عملية حساسة تُسجَّل (من/بأي دور/ماذا/على أي كيان/متى + تفاصيل JSON).
 * التسجيل لا يفشل العملية الأساسية أبداً — نفس فلسفة الإشعارات.
 * actorId مع SetNull في المخطط: حذف مستخدم لا يحذف التاريخ أبداً.
 */
export async function logForsahAudit(input: {
  actorId?: string | null
  actorRole: string
  action: ForsahAuditAction
  entityType: 'Opportunity' | 'Application' | 'Interview' | 'Selection' | 'Transaction' | 'HR' | 'Settings'
  entityId: string
  meta?: unknown
}): Promise<void> {
  try {
    await db.opportunityAuditLog.create({
      data: {
        actorId: input.actorId ?? null,
        actorRole: input.actorRole,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        meta: input.meta != null ? JSON.stringify(input.meta).slice(0, 4000) : null,
      },
    })
  } catch (error) {
    console.error('logForsahAudit failed:', error)
  }
}

/** وصف عربي جاهز للعرض الإداري — من مفاتيح الأفعال */
export function forsahAuditLabel(action: string): string {
  return (
    (FORSAH_AUDIT_ACTIONS as Record<string, string>)[action] ?? action
  )
}
