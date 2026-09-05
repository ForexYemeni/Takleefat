import { z } from 'zod'

export const createReceiverSchema = z.object({
  name: z
    .string({ error: 'الاسم مطلوب' })
    .min(3, 'الاسم يجب أن يكون 3 أحرف على الأقل')
    .max(80, 'الاسم طويل جداً'),
  phone: z
    .string({ error: 'رقم الهاتف مطلوب' })
    .min(9, 'رقم الهاتف غير صحيح')
    .max(15, 'رقم الهاتف غير صحيح')
    .regex(/^[0-9+\-\s]+$/, 'رقم الهاتف يجب أن يحتوي على أرقام فقط'),
  password: z
    .string({ error: 'كلمة المرور مطلوبة' })
    .min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل')
    .regex(/[A-Za-z]/, 'كلمة المرور يجب أن تحتوي على حروف')
    .regex(/[0-9]/, 'كلمة المرور يجب أن تحتوي على أرقام'),
})

export const reviewUserSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'SUSPENDED', 'PENDING'], {
    error: 'الحالة غير صحيحة',
  }),
  rejectNote: z.string().max(500).optional().or(z.literal('')),
})

export type CreateReceiverInput = z.infer<typeof createReceiverSchema>
