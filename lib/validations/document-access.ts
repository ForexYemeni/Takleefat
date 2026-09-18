import { z } from 'zod'

/**
 * مخططات التحقق — خصوصية المستندات (الجولة 61)
 * نفس نمط باقي المخططات: رسائل عربية واضحة تُعرض بأول مشكلة.
 */

/** إنشاء طلب رؤية مستندات — المستلم الإداري/مشرف الأطباء */
export const createDocumentAccessSchema = z.object({
  targetId: z.string({ error: 'حدد الكادر المطلوب رؤية مستنداته' }).min(1, 'حدد الكادر المطلوب رؤية مستنداته'),
  reason: z
    .string({ error: 'سبب الطلب مطلوب — اكتب سبباً واضحاً للإدارة' })
    .trim()
    .min(10, 'اكتب سبباً واضحاً للطلب (10 أحرف على الأقل)')
    .max(500, 'سبب الطلب طويل جداً (500 حرف كحد أقصى)'),
})

/** قرار الإدارة: قبول / رفض / سحب — مع ملاحظة اختيارية */
export const reviewDocumentAccessSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'REVOKE'], { error: 'الإجراء غير صحيح' }),
  note: z.string().trim().max(500, 'الملاحظة طويلة جداً (500 حرف كحد أقصى)').optional(),
})

export type CreateDocumentAccessInput = z.infer<typeof createDocumentAccessSchema>
export type ReviewDocumentAccessInput = z.infer<typeof reviewDocumentAccessSchema>
