import { db } from '@/lib/db'
import type { NotificationType } from '@prisma/client'
import { deliverPushToUser, type PushPayload } from '@/lib/push'
import { after } from 'next/server'

interface NotifyInput {
  title: string
  body?: string
  type?: NotificationType
  link?: string
}

/**
 * إنشاء إشعار داخلي للمستخدم + إشعار فوري (Web Push) لأجهزته
 *
 * الجولة الخامسة عشرة: كل إشعار يحمل وسمه الفريد (معرّف السجل) حتى لا تُدمَج
 * التنبيهات المتتالية في المتصفح — كل إشعار يصدر تنبيهاً وصوتاً خاصاً به.
 *
 * الجولة التاسعة عشرة — إصلاح الجذر الحقيقي لعدم وصول الإشعارات الخارجية:
 * كان الإرسال fire-and-forget (بدون انتظار)، ومنصات السيرفرلس (Vercel) تُجمّد
 * الاستدعاء فور إرجاع الاستجابة — فكان طلب الإرسال إلى خدمات Push (FCM/APNS)
 * يموت قبل اكتماله. لهذا كان الإشعار التجريبي (المُنتظَر بـ await) يصل خارجياً،
 * بينما الإشعارات الحقيقية لم تصل أبداً. الآن يُجدول الإرسال عبر after() —
 * يبدأ فوراً وتضمن المنصة استكماله بعد الاستجابة، دون تأخير على المسار الأصلي.
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

  const payload: PushPayload = {
    title: input.title,
    body: input.body,
    link: input.link,
    tag: createdId ?? undefined,
  }

  // الجولة التاسعة عشرة: بعد() تضمن استكمال الإرسال حتى بعد إرجاع الاستجابة
  // (الإرسال يبدأ فوراً — بلا أي تأخير إضافي على الاستجابة). خارج سياق طلب
  // (سكربتات/مهام خلفية) ننتظر الإرسال مباشرة. الإشعارات لا تُفشل العملية الأساسية أبداً.
  try {
    after(deliverPushToUser(userId, payload))
  } catch {
    // لا يوجد سياق طلب نشط — ننتظر الإرسال مباشرة
    try {
      await deliverPushToUser(userId, payload)
    } catch {
      // تجاهل — الإشعارات لا توقف العملية الأساسية
    }
  }
}

/**
 * نسخ إشعارات للإدارة — الجولة الخامسة عشرة:
 * كل حدث تشغيلي مهم (تقديم/اعتماد/استلام/إنهاء) يصل للمديرين أيضاً
 * عبر الإشعار الداخلي والفوري معاً، مع استثناء مُرسل الفعل إن كان مديراً
 * حتى لا يُشعَر بنفسه. الإرسال مُجدول عبر after() فلا يُؤخّر الاستجابة ولا يفشل المسار الأصلي.
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
