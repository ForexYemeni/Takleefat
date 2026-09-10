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

  // الجولة الرابعة عشرة: بث فوري عبر الـ PWA (يُرى حتى والتطبيق مغلق)
  deliverPushInBackground(userId, {
    title: input.title,
    body: input.body,
    link: input.link,
  })
}
