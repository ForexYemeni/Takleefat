import { z } from 'zod'

export const loginSchema = z.object({
  phone: z
    .string({ error: 'رقم الهاتف مطلوب' })
    .regex(
      /^7\d{8}$/,
      'رقم الهاتف يجب أن يبدأ بـ 7 ويتكوّن من 9 أرقام — مثال: 773178684'
    ),
  password: z
    .string({ error: 'كلمة المرور مطلوبة' })
    .min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
})

export const registerSchema = z
  .object({
    name: z
      .string({ error: 'الاسم مطلوب' })
      .min(3, 'الاسم يجب أن يكون 3 أحرف على الأقل')
      .max(80, 'الاسم طويل جداً'),
    phone: z
      .string({ error: 'رقم الهاتف مطلوب' })
      .regex(
        /^7\d{8}$/,
        'رقم الهاتف يجب أن يبدأ بـ 7 ويتكوّن من 9 أرقام — مثال: 773178684'
      ),
    password: z
      .string({ error: 'كلمة المرور مطلوبة' })
      .min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل')
      .regex(/[A-Za-z]/, 'كلمة المرور يجب أن تحتوي على حروف')
      .regex(/[0-9]/, 'كلمة المرور يجب أن تحتوي على أرقام'),
    confirmPassword: z.string({ error: 'تأكيد كلمة المرور مطلوب' }),
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
  .refine((data) => data.password === data.confirmPassword, {
    message: 'كلمتا المرور غير متطابقتين',
    path: ['confirmPassword'],
  })

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type RegisterFormValues = z.input<typeof registerSchema>
