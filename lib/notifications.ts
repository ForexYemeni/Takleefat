import { db } from '@/lib/db'
import type { NotificationType } from '@prisma/client'

interface NotifyInput {
  title: string
  body?: string
  type?: NotificationType
  link?: string
}

/**
 * إنشاء إشعار داخلي للمستخدم
 */
export async function notify(userId: string, input: NotifyInput) {
  try {
    await db.notification.create({
      data: {
        userId,
        title: input.title,
        body: input.body,
        type: input.type ?? 'GENERIC',
        link: input.link,
      },
    })
  } catch (error) {
    // الإشعارات لا يجب أن توقف العملية الأساسية
    console.error('Failed to create notification:', error)
  }
}
