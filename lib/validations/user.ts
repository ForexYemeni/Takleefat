import { z } from 'zod'

/**
 * حسابات يُنشئها مدير النظام مباشرة (مستلم إداري / كادر تمريضي)
 * يُنشأ الحساب معتمداً تلقائياً ويمكن للمالك تسجيل الدخول فوراً.
 * رقم الهاتف يجب أن يتبع الصيغة اليمنية: يبدأ بـ 7 ويتكوّن من 9 أرقام.
 */

const adminPhoneSchema = z
  .string({ error: 'رقم الهاتف مطلوب' })
  .regex(
    /^7\d{8}$/,
    'رقم الهاتف يجب أن يبدأ بـ 7 ويتكوّن من 9 أرقام — مثال: 773178684'
  )

const adminPasswordSchema = z
  .string({ error: 'كلمة المرور مطلوبة' })
  .min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل')
  .regex(/[A-Za-z]/, 'كلمة المرور يجب أن تحتوي على حروف')
  .regex(/[0-9]/, 'كلمة المرور يجب أن تحتوي على أرقام')

export const createReceiverSchema = z.object({
  name: z
    .string({ error: 'الاسم مطلوب' })
    .min(3, 'الاسم يجب أن يكون 3 أحرف على الأقل')
    .max(80, 'الاسم طويل جداً'),
  phone: adminPhoneSchema,
  password: adminPasswordSchema,
})

export const createNurseSchema = z.object({
  name: z
    .string({ error: 'الاسم مطلوب' })
    .min(3, 'الاسم يجب أن يكون 3 أحرف على الأقل')
    .max(80, 'الاسم طويل جداً'),
  phone: adminPhoneSchema,
  password: adminPasswordSchema,
  specialty: z
    .string({ error: 'التخصص مطلوب' })
    .min(2, 'التخصص مطلوب')
    .max(80, 'التخصص طويل جداً'),
  qualification: z
    .string({ error: 'المؤهل العلمي مطلوب' })
    .min(2, 'المؤهل العلمي مطلوب')
    .max(120, 'المؤهل طويل جداً'),
  yearsOfExperience: z.coerce
    .number({ error: 'سنوات الخبرة مطلوبة' })
    .int('سنوات الخبرة يجب أن تكون رقماً صحيحاً')
    .min(0, 'سنوات الخبرة غير صحيحة')
    .max(50, 'سنوات الخبرة غير صحيحة'),
})

export const reviewUserSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'SUSPENDED', 'PENDING'], {
    error: 'الحالة غير صحيحة',
  }),
  rejectNote: z.string().max(500).optional().or(z.literal('')),
})

export type CreateReceiverInput = z.infer<typeof createReceiverSchema>
export type CreateNurseInput = z.infer<typeof createNurseSchema>
export type CreateNurseFormValues = z.input<typeof createNurseSchema>

// ---------- إدارة الحساب من الإدارة (تغيير كلمة المرور / حذف نهائي) ----------

export const resetPasswordSchema = z.object({
  password: adminPasswordSchema,
})

// ---------- الملف الشخصي الذاتي (جميع الأدوار) ----------

export const updateProfileSchema = z.object({
  name: z
    .string({ error: 'الاسم مطلوب' })
    .min(3, 'الاسم يجب أن يكون 3 أحرف على الأقل')
    .max(80, 'الاسم طويل جداً'),
})

export const changePasswordSchema = z.object({
  currentPassword: z.string({ error: 'كلمة المرور الحالية مطلوبة' }).min(1, 'أدخل كلمة المرور الحالية'),
  newPassword: adminPasswordSchema,
})

export const changePhoneSchema = z.object({
  currentPassword: z.string({ error: 'كلمة المرور الحالية مطلوبة' }).min(1, 'أدخل كلمة المرور الحالية'),
  newPhone: adminPhoneSchema,
})

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
export type ChangePhoneInput = z.infer<typeof changePhoneSchema>
