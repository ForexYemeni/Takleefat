import { z } from 'zod'

export const createAssignmentSchema = z.object({
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
  startDate: z.string({ error: 'تاريخ البدء مطلوب' }).min(1, 'تاريخ البدء مطلوب'),
  endDate: z.string().optional().or(z.literal('')),
  nurseId: z.string({ error: 'يجب اختيار الكادر التمريضي' }).min(1, 'يجب اختيار الكادر التمريضي'),
  receiverId: z
    .string({ error: 'يجب اختيار المستلم الإداري' })
    .min(1, 'يجب اختيار المستلم الإداري'),
})

export const updateAssignmentStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'RECEIVED', 'COMPLETED', 'CANCELLED'], {
    error: 'الحالة غير صحيحة',
  }),
  note: z.string().max(500).optional().or(z.literal('')),
})

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>

/**
 * إنشاء تكليف مباشر من حساب المستلم الإداري — بنفس طريقة حساب الإدارة تماماً.
 * المستلم هو الطرف المستقبِل بطبيعة الحال، لذا لا يُطلب receiverId في الجسم
 * (يُضبط من جلسة المستلم على الخادم).
 */
export const receiverCreateAssignmentSchema = createAssignmentSchema.omit({ receiverId: true })

export type ReceiverCreateAssignmentInput = z.infer<typeof receiverCreateAssignmentSchema>
