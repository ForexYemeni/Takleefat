import { db } from '@/lib/db'
import type { NotificationType } from '@prisma/client'
import { deliverPushInBackground } from '@/lib/push'

interface NotifyInput {
  title: string
  body?: string
  type?: NotificationType
  link?: string
}

/**
 * إنشاء إشعار داخلي للمستخدم + إشعار فوري (Web Push) لأجهزته إن كان مشتركاً
 * — الـ Push في الخلفية: لا يوقف ولا يبطئ العملية الأساسية ولا يفشلها أبداً
 *
 * الجولة الخامسة عشرة: كل إشعار يحمل وسمه الفريد (معرّف السجل) حتى لا تُدمَج
 * التنبيهات المتتالية في المتصفح — كل إشعار يصدر تنبيهاً وصوتاً خاصاً به.
 */
export async function notify(userId: string, input: NotifyInput) {
  let createdId: string | null = null
  try {
    const created = await db.notification.create({
      data: {
        userId,
        title: input.title,
        body: input.body,
        type: input.type ?? 'GENERIC',
        link: input.link,
      },
      select: { id: true },
    })
    createdId = created.id
  } catch (error) {
    // الإشعارات لا يجب أن توقف العملية الأساسية
    console.error('Failed to create notification:', error)
  }

  // الجولة الرابعة عشرة: بث فوري عبر الـ PWA (يُرى حتى والتطبيق مغلق)
  deliverPushInBackground(userId, {
    title: input.title,
    body: input.body,
    link: input.link,
    tag: createdId ?? undefined,
  })
}

/**
 * نسخ إشعارات للإدارة — الجولة الخامسة عشرة:
 * كل حدث تشغيلي مهم (تقديم/اعتماد/استلام/إنهاء) يصل للمديرين أيضاً
 * عبر الإشعار الداخلي والفوري معاً، مع استثناء مُرسل الفعل إن كان مديراً
 * حتى لا يُشعَر بنفسه. النداء في الخلفية: لا يوقف ولا يفشل المسار الأصلي.
 */
export async function notifyAdmins(
  input: NotifyInput,
  exceptUserId?: string
): Promise<void> {
  try {
    const admins = await db.user.findMany({
      where: { role: 'ADMIN', status: 'APPROVED' },
      select: { id: true },
    })
    await Promise.allSettled(
      admins
        .filter((a) => a.id !== exceptUserId)
        .map((a) => notify(a.id, input))
    )
  } catch (error) {
    console.error('notifyAdmins failed:', error)
  }
}
