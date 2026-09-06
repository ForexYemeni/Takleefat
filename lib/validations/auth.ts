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
    // الافتراضي: كادر تمريضي — للتوافق مع أي طلبات قديمة لا تُرسل الحقل
    role: z.enum(['NURSE', 'RECEIVER'], { error: 'نوع الحساب مطلوب' }).default('NURSE'),
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
    // حقول خاصة بالكادر التمريضي فقط — تُتحقق شرطياً في superRefine
    specialty: z.string().max(80, 'التخصص طويل جداً').optional(),
    qualification: z.string().max(120, 'المؤهل طويل جداً').optional(),
    yearsOfExperience: z.coerce
      .number({ error: 'سنوات الخبرة مطلوبة' })
      .int('سنوات الخبرة يجب أن تكون رقماً صحيحاً')
      .min(0, 'سنوات الخبرة غير صحيحة')
      .max(50, 'سنوات الخبرة غير صحيحة')
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: 'custom',
        message: 'كلمتا المرور غير متطابقتين',
        path: ['confirmPassword'],
      })
    }

    // بيانات الكادر التمريضي إلزامية، أما المستلم الإداري فلا يحتاجها
    if (data.role === 'NURSE') {
      if (!data.specialty || data.specialty.trim().length < 2) {
        ctx.addIssue({ code: 'custom', message: 'التخصص مطلوب', path: ['specialty'] })
      }
      if (!data.qualification || data.qualification.trim().length < 2) {
        ctx.addIssue({
          code: 'custom',
          message: 'المؤهل العلمي مطلوب',
          path: ['qualification'],
        })
      }
      if (data.yearsOfExperience === undefined || Number.isNaN(data.yearsOfExperience)) {
        ctx.addIssue({
          code: 'custom',
          message: 'سنوات الخبرة مطلوبة',
          path: ['yearsOfExperience'],
        })
      }
    }
  })

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type RegisterFormValues = z.input<typeof registerSchema>
