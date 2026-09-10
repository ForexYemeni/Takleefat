import { z } from 'zod'
import { PHONE_REGEX, PHONE_MESSAGE, QUALIFICATION_VALUES } from '@/lib/validations/auth'

/**
 * حسابات يُنشئها مدير النظام (مستلم إداري / كادر تمريضي) ومستلم الجهة لكوادر جهته.
 * نفس قواعد التسجيل الذاتي — الجولة الثالثة عشرة:
 * الاسم في حقل واحد (الاسم مع اللقب) + هاتف 9 أرقام + مؤهل من 3 خيارات
 * + جنس إجباري للكادر + التخصص وسنوات الخبرة إجبارية للكادر.
 */

const adminPhoneSchema = z
  .string({ error: 'رقم الهاتف مطلوب' })
  .regex(PHONE_REGEX, PHONE_MESSAGE)

const adminPasswordSchema = z
  .string({ error: 'كلمة المرور مطلوبة' })
  .min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل')
  .regex(/[A-Za-z]/, 'كلمة المرور يجب أن تحتوي على حروف')
  .regex(/[0-9]/, 'كلمة المرور يجب أن تحتوي على أرقام')

/** الاسم مع اللقب فقط — كلمتان على الأقل (تُطبق على كل الأدوار) */
export const fullNameSchema = z
  .string({ error: 'الاسم مطلوب' })
  .min(3, 'الاسم يجب أن يكون 3 أحرف على الأقل')
  .max(80, 'الاسم طويل جداً')
  .refine(
    (v) => v.trim().split(/\s+/).filter(Boolean).length >= 2,
    'أدخل الاسم مع اللقب — مثال: أحمد صالح (الاسم واللقب فقط)'
  )

export const createReceiverSchema = z.object({
  name: fullNameSchema,
  phone: adminPhoneSchema,
  password: adminPasswordSchema,
  // الجهة الصحية (المستشفى) — اختيارية عند الإنشاء من الإدارة لأن الإدارة قد تعبئها لاحقاً
  hospitalName: z.string().max(120, 'اسم الجهة الصحية طويل جداً').optional(),
})

export const createNurseSchema = z.object({
  name: fullNameSchema,
  phone: adminPhoneSchema,
  password: adminPasswordSchema,
  // التخصص إجباري — يُختار من الأقسام المُدارة في حساب الإدارة
  specialty: z
    .string({ error: 'التخصص مطلوب — اختر القسم من القائمة' })
    .trim()
    .min(1, 'التخصص مطلوب — اختر القسم من القائمة')
    .max(80, 'التخصص طويل جداً'),
  qualification: z
    .enum(QUALIFICATION_VALUES, { error: 'اختر المؤهل العلمي من القائمة' }),
  gender: z.enum(['MALE', 'FEMALE'], { error: 'الجنس مطلوب — اختر ذكر أو أنثى' }),
  // سنوات الخبرة إجبارية — الفراغ يُعامل كحقل مفقود (0 للمتخرج الجديد)
  yearsOfExperience: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.coerce
      .number({ error: 'سنوات الخبرة مطلوبة — أدخل عدد السنوات (0 للمتخرج الجديد)' })
      .int('سنوات الخبرة يجب أن تكون رقماً صحيحاً')
      .min(0, 'سنوات الخبرة غير صحيحة')
      .max(50, 'سنوات الخبرة غير صحيحة')
  ),
})

/** إضافة ممرض لجهة المستلم الإداري — الجولة الثامنة (التخصص والخبرة إجبارية من الجولة الثالثة عشرة) */
export const receiverCreateNurseSchema = z.object({
  name: fullNameSchema,
  phone: adminPhoneSchema,
  password: adminPasswordSchema,
  gender: z.enum(['MALE', 'FEMALE'], { error: 'الجنس مطلوب — اختر ذكر أو أنثى' }),
  qualification: z
    .enum(QUALIFICATION_VALUES, { error: 'اختر المؤهل العلمي من القائمة' }),
  specialty: z
    .string({ error: 'التخصص مطلوب — أدخل التخصص' })
    .trim()
    .min(1, 'التخصص مطلوب — أدخل التخصص')
    .max(80, 'التخصص طويل جداً'),
  yearsOfExperience: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.coerce
      .number({ error: 'سنوات الخبرة مطلوبة — أدخل عدد السنوات (0 للمتخرج الجديد)' })
      .int('سنوات الخبرة يجب أن تكون رقماً صحيحاً')
      .min(0, 'سنوات الخبرة غير صحيحة')
      .max(50, 'سنوات الخبرة غير صحيحة')
  ),
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
export type ReceiverCreateNurseInput = z.infer<typeof receiverCreateNurseSchema>
export type ReceiverCreateNurseFormValues = z.input<typeof receiverCreateNurseSchema>

// ---------- إدارة الحساب من الإدارة (تغيير كلمة المرور / حذف نهائي) ----------

export const resetPasswordSchema = z.object({
  password: adminPasswordSchema,
})

// ---------- الملف الشخصي الذاتي (جميع الأدوار) ----------

export const updateProfileSchema = z.object({
  name: fullNameSchema,
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
