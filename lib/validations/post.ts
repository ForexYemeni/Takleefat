import { z } from 'zod'

/**
 * التحقق من بيانات التكليفات المُعلنة والتقديمات وإعدادات الرسوم
 */

export const createPostSchema = z.object({
  // العنوان اختياري — يُولَّد تلقائياً «التكليف رقم N» إذا تُرك فارغاً
  title: z.string().max(150, 'العنوان طويل جداً').optional().or(z.literal('')),
  description: z.string().max(2000, 'الوصف طويل جداً').optional().or(z.literal('')),
  // الجهة الصحية تُختار من المستشفيات المضافة من حساب الإدارة
  hospitalId: z.string({ error: 'الجهة الصحية مطلوبة' }).min(1, 'الجهة الصحية مطلوبة'),
  department: z.string().max(120).optional().or(z.literal('')),
  location: z.string().max(120).optional().or(z.literal('')),
  startDate: z.string({ error: 'تاريخ البدء مطلوب' }).min(1, 'تاريخ البدء مطلوب'),
  nursesNeeded: z.coerce
    .number({ error: 'عدد الكادر المطلوب غير صحيح' })
    .int('عدد الكادر يجب أن يكون رقماً صحيحاً')
    .min(1, 'الحد الأدنى كادر واحد')
    .max(50, 'الحد الأقصى 50 كادر'),
  hours: z.coerce
    .number({ error: 'عدد الساعات غير صحيح' })
    .int('عدد الساعات يجب أن يكون رقماً صحيحاً')
    .min(1, 'عدد الساعات يجب أن يكون أكبر من صفر')
    .max(999, 'عدد الساعات كبير جداً')
    .optional()
    .or(z.literal('')),
  gender: z.enum(['MALE', 'FEMALE', 'ANY'], { error: 'الجنس المطلوب غير صحيح' }).default('ANY'),
  value: z.coerce
    .number({ error: 'قيمة التكليف مطلوبة' })
    .int('قيمة التكليف يجب أن تكون رقماً صحيحاً')
    .min(1, 'قيمة التكليف يجب أن تكون أكبر من صفر')
    .max(999_999_999, 'قيمة التكليف كبيرة جداً'),
})

/** تحديث التكليف المُعلن — الإدارة (أي تكليف) أو المالك (تكليفه وهو مفتوح) */
export const updatePostSchema = z.object({
  title: z.string().min(3, 'العنوان قصير جداً').max(150, 'العنوان طويل جداً').optional(),
  description: z.string().max(2000, 'الوصف طويل جداً').optional().or(z.literal('')),
  hospitalId: z.string().min(1).optional(),
  department: z.string().max(120).optional().or(z.literal('')),
  startDate: z.string().optional(),
  hours: z.coerce
    .number({ error: 'عدد الساعات غير صحيح' })
    .int('عدد الساعات يجب أن يكون رقماً صحيحاً')
    .min(1, 'عدد الساعات يجب أن يكون أكبر من صفر')
    .max(999, 'عدد الساعات كبير جداً')
    .optional()
    .or(z.literal('')),
  gender: z.enum(['MALE', 'FEMALE', 'ANY'], { error: 'الجنس المطلوب غير صحيح' }).optional(),
  nursesNeeded: z.coerce
    .number({ error: 'عدد الكادر غير صحيح' })
    .int()
    .min(1, 'الحد الأدنى كادر واحد')
    .max(50, 'الحد الأقصى 50 كادر')
    .optional(),
  value: z.coerce
    .number({ error: 'قيمة التكليف غير صحيحة' })
    .int()
    .min(1, 'قيمة التكليف يجب أن تكون أكبر من صفر')
    .max(999_999_999, 'قيمة التكليف كبيرة جداً')
    .optional(),
  status: z.enum(['OPEN', 'CANCELLED'], { error: 'الحالة غير صحيحة' }).optional(),
})

export const reviewApplicationSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT'], { error: 'الإجراء غير صحيح' }),
  note: z.string().max(500).optional().or(z.literal('')),
})

export const settingsSchema = z
  .object({
    // نمط الرسوم — يُحصّل نوع واحد فقط: رسوم تقديم أو حصة إدارة
    feeMode: z.enum(['APPLICATION', 'ADMIN'], {
      error: 'نمط الرسوم غير صحيح',
    }),
    applicationFee: z.coerce
      .number({ error: 'رسوم التقديم غير صحيحة' })
      .int('رسوم التقديم يجب أن تكون رقماً صحيحاً')
      .min(0, 'رسوم التقديم لا يمكن أن تكون سالبة')
      .max(99_999_999, 'القيمة كبيرة جداً'),
    // حصة الإدارة: نسبة مئوية من قيمة التكليف أو مبلغ ثابت
    adminFeeType: z.enum(['PERCENTAGE', 'FIXED'], {
      error: 'نوع حصة الإدارة غير صحيح',
    }),
    adminPercentage: z.coerce
      .number({ error: 'نسبة الإدارة غير صحيحة' })
      .int('نسبة الإدارة يجب أن تكون رقماً صحيحاً')
      .min(0, 'نسبة الإدارة لا يمكن أن تكون سالبة')
      .max(100, 'نسبة الإدارة لا تتجاوز 100٪'),
    adminFeeFixed: z.coerce
      .number({ error: 'المبلغ الثابت غير صحيح' })
      .int('المبلغ الثابت يجب أن يكون رقماً صحيحاً')
      .min(0, 'المبلغ الثابت لا يمكن أن يكون سالباً')
      .max(999_999_999, 'القيمة كبيرة جداً'),
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
    // نسبة المستلم الإداري من كل تكليف — تُحتسب من حساب الإدارة (اختياري للتوافق)
    receiverSharePercent: z.coerce
      .number({ error: 'نسبة المستلم الإداري غير صحيحة' })
      .int('النسبة يجب أن تكون رقماً صحيحاً')
      .min(0, 'النسبة لا يمكن أن تكون سالبة')
      .max(100, 'النسبة لا تتجاوز 100٪')
      .optional(),
  })
  .refine(
    (data) =>
      data.feeMode === 'APPLICATION' ||
      data.adminFeeType === 'PERCENTAGE' ||
      data.adminFeeFixed >= 1,
    { message: 'أدخل مبلغاً ثابتاً للحصة الإدارية أكبر من صفر', path: ['adminFeeFixed'] }
  )
  .refine(
    (data) =>
      data.feeMode === 'ADMIN' || data.applicationFee >= 1,
    { message: 'أدخل رسوم تقديم أكبر من صفر أو حوّل النمط إلى حصة إدارة', path: ['applicationFee'] }
  )

// ---------- الجهات الصحية والأقسام (تُدار من الإدارة) ----------

export const hospitalSchema = z.object({
  name: z
    .string({ error: 'اسم الجهة الصحية مطلوب' })
    .min(2, 'اسم الجهة مطلوب')
    .max(150, 'الاسم طويل جداً'),
  location: z.string().max(150, 'الموقع طويل جداً').optional().or(z.literal('')),
  // الموقع الجغرافي الحقيقي (إحداثيات من الخريطة التفاعلية)
  lat: z.coerce.number().min(-90).max(90).nullable().optional(),
  lng: z.coerce.number().min(-180).max(180).nullable().optional(),
})

export const hospitalUpdateSchema = hospitalSchema.partial().extend({
  isActive: z.boolean().optional(),
})

export const departmentSchema = z.object({
  name: z
    .string({ error: 'اسم القسم مطلوب' })
    .min(2, 'اسم القسم مطلوب')
    .max(120, 'الاسم طويل جداً'),
})

export const departmentUpdateSchema = departmentSchema.partial().extend({
  isActive: z.boolean().optional(),
})

export type CreatePostInput = z.infer<typeof createPostSchema>
export type CreatePostFormValues = z.input<typeof createPostSchema>
export type UpdatePostInput = z.infer<typeof updatePostSchema>
export type UpdatePostFormValues = z.input<typeof updatePostSchema>
export type SettingsInput = z.infer<typeof settingsSchema>
export type SettingsFormValues = z.input<typeof settingsSchema>
export type HospitalInput = z.infer<typeof hospitalSchema>
export type DepartmentInput = z.infer<typeof departmentSchema>
