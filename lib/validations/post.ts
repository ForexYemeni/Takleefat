import { z } from 'zod'

/**
 * التحقق من بيانات التكليفات المُعلنة والتقديمات وإعدادات الرسوم
 */

export const createPostSchema = z.object({
  title: z
    .string({ error: 'عنوان التكليف مطلوب' })
    .min(3, 'عنوان التكليف مطلوب')
    .max(150, 'العنوان طويل جداً'),
  description: z.string().max(2000, 'الوصف طويل جداً').optional().or(z.literal('')),
  facility: z
    .string({ error: 'الجهة الصحية مطلوبة' })
    .min(2, 'الجهة الصحية مطلوبة')
    .max(150, 'الجهة طويلة جداً'),
  department: z.string().max(120).optional().or(z.literal('')),
  location: z.string().max(120).optional().or(z.literal('')),
  startDate: z.string({ error: 'تاريخ البدء مطلوب' }).min(1, 'تاريخ البدء مطلوب'),
  endDate: z.string().optional().or(z.literal('')),
  nursesNeeded: z.coerce
    .number({ error: 'عدد الكادر المطلوب غير صحيح' })
    .int('عدد الكادر يجب أن يكون رقماً صحيحاً')
    .min(1, 'الحد الأدنى كادر واحد')
    .max(50, 'الحد الأقصى 50 كادر'),
  value: z.coerce
    .number({ error: 'قيمة التكليف مطلوبة' })
    .int('قيمة التكليف يجب أن تكون رقماً صحيحاً')
    .min(1, 'قيمة التكليف يجب أن تكون أكبر من صفر')
    .max(999_999_999, 'قيمة التكليف كبيرة جداً'),
})

export const reviewApplicationSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT'], { error: 'الإجراء غير صحيح' }),
  note: z.string().max(500).optional().or(z.literal('')),
})

export const updatePostStatusSchema = z.object({
  status: z.enum(['OPEN', 'CANCELLED'], { error: 'الحالة غير صحيحة' }),
})

export const settingsSchema = z.object({
  applicationFee: z.coerce
    .number({ error: 'رسوم التقديم غير صحيحة' })
    .int('رسوم التقديم يجب أن تكون رقماً صحيحاً')
    .min(0, 'رسوم التقديم لا يمكن أن تكون سالبة')
    .max(99_999_999, 'القيمة كبيرة جداً'),
  adminPercentage: z.coerce
    .number({ error: 'نسبة الإدارة غير صحيحة' })
    .int('نسبة الإدارة يجب أن تكون رقماً صحيحاً')
    .min(0, 'نسبة الإدارة لا يمكن أن تكون سالبة')
    .max(100, 'نسبة الإدارة لا تتجاوز 100٪'),
  paymentMethod: z
    .string({ error: 'طريقة الدفع مطلوبة' })
    .min(2, 'طريقة الدفع مطلوبة')
    .max(60, 'طريقة الدفع طويلة جداً'),
  paymentAccountNumber: z
    .string({ error: 'رقم حساب الإدارة مطلوب' })
    .min(3, 'رقم الحساب قصير جداً')
    .max(60, 'رقم الحساب طويل جداً'),
  paymentAccountName: z
    .string({ error: 'اسم الحساب مطلوب' })
    .min(2, 'اسم الحساب مطلوب')
    .max(80, 'اسم الحساب طويل جداً'),
  paymentNotes: z.string().max(500, 'الملاحظات طويلة جداً').optional().or(z.literal('')),
})

export type CreatePostInput = z.infer<typeof createPostSchema>
export type SettingsInput = z.infer<typeof settingsSchema>
