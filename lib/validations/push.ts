import { z } from 'zod'

/**
 * قواعد اشتراك الإشعارات الفورية (Web Push) — الجولة الرابعة عشرة
 * endpoint: رابط https من خدمة الدفع في المتصفح (FCM/Mozilla autopush...)
 * keys: مفاتيح التشفير p256dh + auth (Base64URL من المتصفح)
 */
export const pushSubscribeSchema = z.object({
  endpoint: z
    .string({ error: 'نقطة نهاية الاشتراك مطلوبة' })
    .url('نقطة نهاية الاشتراك غير صحيحة')
    .startsWith('https://', 'نقطة نهاية الاشتراك يجب أن تكون https')
    .max(600, 'نقطة النهاية طويلة جداً'),
  keys: z.object({
    p256dh: z
      .string({ error: 'مفتاح التشفير p256dh مطلوب' })
      .min(40, 'مفتاح p256dh غير صحيح')
      .max(200, 'مفتاح p256dh غير صحيح'),
    auth: z
      .string({ error: 'مفتاح المصادقة auth مطلوب' })
      .min(16, 'مفتاح auth غير صحيح')
      .max(100, 'مفتاح auth غير صحيح'),
  }),
  userAgent: z.string().max(300, 'معرّف المتصفح طويل جداً').optional().or(z.literal('')),
})

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string({ error: 'نقطة نهاية الاشتراك مطلوبة' }).max(600),
})

export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>
