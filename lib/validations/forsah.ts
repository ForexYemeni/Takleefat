import { z } from 'zod'
import { PHONE_REGEX, PHONE_MESSAGE } from '@/lib/validations/auth'

/**
 * مخططات تحقق «فرصة | Forsah» — الجولة 66 | تكليفات | Takleefat
 * ============================================================
 * تحقق شامل من كل حقول المواصفة (31): الراتب، الوقت، التاريخ، الجنس،
 * نوع الكادر، القسم، التخصص، الإجازات، النسبة، عدد الموظفين، الرسوم، عمولة HR.
 * كل التحقق server-side حصراً — النماذج تستخدم نفس المخططات للاتساق.
 */

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} طويل جداً (الحد ${max} حرفاً)`)
    .optional()
    .or(z.literal(''))

/** إنشاء/تعديل فرصة — wizard المواصفة 5 — الجولة 67:
 *  - اسم الفرصة لم يعد مدخلاً يدوياً — يُولَّد خادمياً «فرصة + القسم/التخصص» حصراً
 *  - القسم الطبي إجباري للكادر، والتخصص إجباري للأطباء (بدل «بلا قيد»)
 *  (أعمدة القاعدة تبقى nullable — الإلزام هنا على مستوى التحقق فقط بلا أي ترحيل مدمّر)
 */
export const opportunitySchema = z
  .object({
  hospitalId: z.string({ error: 'الجهة الصحية مطلوبة' }).min(1, 'الجهة الصحية مطلوبة'),
  audience: z.enum(['NURSE', 'DOCTOR'], { error: 'نوع الكادر مطلوب' }),
  specialtyId: z.string().nullish().or(z.literal('')),
  departmentId: z.string().nullish().or(z.literal('')),
  qualificationId: z.string().nullish().or(z.literal('')),
  salaryAmount: z
    .preprocess(
      (v) => (v === '' || v === null || v === undefined ? null : v),
      z.coerce
        .number({ error: 'الراتب يجب أن يكون رقماً' })
        .int('الراتب يجب أن يكون رقماً صحيحاً')
        .min(0, 'الراتب غير صحيح')
        .max(99_999_999, 'الراتب كبير جداً')
        .nullable()
    )
    .default(null),
  salaryType: z.enum(['MONTHLY', 'DAILY', 'NEGOTIABLE'], { error: 'نوع الراتب مطلوب' }),
  salaryCurrency: z.enum(['YER', 'SAR', 'USD'], { error: 'العملة مطلوبة' }).default('YER'),
  workStartTime: z
    .string()
    .regex(TIME_REGEX, 'بداية الدوام بصيغة HH:mm')
    .optional()
    .or(z.literal('')),
  workEndTime: z
    .string()
    .regex(TIME_REGEX, 'نهاية الدوام بصيغة HH:mm')
    .optional()
    .or(z.literal('')),
  positionsNeeded: z.coerce
    .number({ error: 'عدد الموظفين المطلوبين مطلوب' })
    .int('عدد الموظفين يجب أن يكون رقماً صحيحاً')
    .min(1, 'عدد الموظفين مطلوب (1 على الأقل)')
    .max(500, 'عدد الموظفين كبير جداً'),
  gender: z.enum(['MALE', 'FEMALE', 'ANY'], { error: 'الجنس المطلوب مطلوب' }).default('ANY'),
  vacations: optionalText(400, 'نظام الإجازات'),
  procedureSharePercent: z
    .preprocess(
      (v) => (v === '' || v === null || v === undefined ? null : v),
      z.coerce
        .number({ error: 'النسبة يجب أن تكون رقماً' })
        .min(0, 'النسبة غير صحيحة')
        .max(100, 'النسبة يجب أن تكون بين 0 و 100')
        .nullable()
    )
    .default(null),
  minYearsExperience: z
    .preprocess(
      (v) => (v === '' || v === null || v === undefined ? null : v),
      z.coerce
        .number({ error: 'سنوات الخبرة يجب أن تكون رقماً' })
        .int('سنوات الخبرة يجب أن تكون رقماً صحيحاً')
        .min(0, 'سنوات الخبرة غير صحيحة')
        .max(50, 'سنوات الخبرة غير صحيحة')
        .nullable()
    )
    .default(null),
  licenseRequired: z.boolean().default(false),
  requiredDocuments: z
    .array(z.string().trim().max(80, 'اسم المستند طويل جداً'))
    .max(12, 'الحد الأقصى 12 مستنداً')
    .default([]),
  description: optionalText(4000, 'وصف الفرصة'),
  responsibilities: optionalText(4000, 'المهام والمسؤوليات'),
  benefits: optionalText(2000, 'المزايا'),
  notes: optionalText(2000, 'الملاحظات'),
  })
  .superRefine((data, ctx) => {
    // الجولة 67: القسم الطبي إجباري للكادر — لا «بلا قيد» بعد اليوم
    if (data.audience === 'NURSE' && !String(data.departmentId ?? '').trim()) {
      ctx.addIssue({
        code: 'custom',
        message: 'القسم الطبي المطلوب إجباري — اختر قسماً من الكتالوج',
        path: ['departmentId'],
      })
    }
    // وللأطباء: التخصص إجباري (مقابِل منطوري لإلزام القسم — وأساس اسم الفرصة التلقائي)
    if (data.audience === 'DOCTOR' && !String(data.specialtyId ?? '').trim()) {
      ctx.addIssue({
        code: 'custom',
        message: 'التخصص الطبي المطلوب إجباري — اختر تخصصاً من الكتالوج',
        path: ['specialtyId'],
      })
    }
  })

export type OpportunityInput = z.infer<typeof opportunitySchema>

/** تقديم على فرصة */
export const forsahApplySchema = z.object({
  coverNote: z
    .string()
    .trim()
    .max(1500, 'رسالة التقديم طويلة جداً')
    .optional()
    .or(z.literal('')),
})

/** إنشاء دفعة دعوات مقابلة — المواصفة 12 */
export const forsahInterviewSchema = z.object({
  applicationIds: z
    .array(z.string().min(1, 'معرف الطلب غير صحيح'))
    .min(1, 'اختر متقدماً واحداً على الأقل')
    .max(100, 'لا يمكن دعوة أكثر من 100 متقدم في الدفعة الواحدة'),
  scheduledDate: z.string({ error: 'تاريخ المقابلة مطلوب' }).refine(
    (v) => !Number.isNaN(new Date(v).getTime()),
    'تاريخ المقابلة غير صحيح'
  ),
  scheduledTime: z.string({ error: 'وقت المقابلة مطلوب' }).regex(TIME_REGEX, 'الوقت بصيغة HH:mm'),
  mode: z.enum(['ONSITE', 'ONLINE'], { error: 'نمط المقابلة مطلوب' }).default('ONSITE'),
  location: optionalText(120, 'مكان المقابلة'),
  address: optionalText(250, 'العنوان'),
  mapUrl: z
    .string()
    .url('رابط الخريطة غير صحيح')
    .max(500)
    .optional()
    .or(z.literal('')),
  notes: optionalText(1000, 'الملاحظات'),
})

/** اختيار موظف/موظفين — المواصفة 13 */
export const forsahSelectionSchema = z.object({
  applicationIds: z
    .array(z.string().min(1, 'معرف الطلب غير صحيح'))
    .min(1, 'اختر متقدماً واحداً على الأقل')
    .max(50, 'لا يمكن اختيار أكثر من 50 متقدم في الدفعة الواحدة'),
  note: optionalText(500, 'ملاحظة الاختيار'),
})

/** مراجعة طلب تقديم (HR) */
export const forsahReviewSchema = z.object({
  status: z.enum(['REVIEWED', 'REJECTED'], { error: 'حالة المراجعة غير صحيحة' }),
  reviewNote: optionalText(500, 'ملاحظة المراجعة'),
})

/** الجولة 70 — اختيار المرشح توقيت سداد رسوم الخدمة بعد اختياره — شفافية كاملة */
export const forsahPaymentTimingSchema = z.object({
  applicationId: z.string().min(1, 'معرف الطلب غير صحيح'),
  timing: z.enum(['WITHIN_FIRST_TEN_DAYS', 'DIRECT', 'AFTER_THREE_DAYS'], {
    error: 'توقيت السداد المختار غير صحيح',
  }),
})

/** إنشاء حساب موارد بشرية — المواصفة 2 (الإدارة حصراً) */
export const hrCreateSchema = z
  .object({
    // الاسم مع اللقب — كلمتان (نفس قاعدة التسجيل القائمة)
    name: z
      .string({ error: 'الاسم مطلوب' })
      .trim()
      .min(3, 'الاسم يجب أن يكون 3 أحرف على الأقل')
      .max(80, 'الاسم طويل جداً'),
    phone: z.string({ error: 'رقم الهاتف مطلوب' }).regex(PHONE_REGEX, PHONE_MESSAGE),
    email: z
      .string()
      .email('البريد الإلكتروني غير صحيح')
      .max(120)
      .optional()
      .or(z.literal('')),
    // الجولة 68: المنشأة إجبارية وتُختار حصراً من الجهات الصحية المسجلة (بلا إدخال حر)
    hospitalName: z
      .string({ error: 'اختيار المنشأة من الجهات الصحية مطلوب' })
      .trim()
      .min(2, 'اختيار المنشأة من الجهات الصحية مطلوب')
      .max(120, 'اسم المنشأة طويل جداً'),
    jobTitle: z.string().trim().max(80, 'المسمى الوظيفي طويل جداً').optional().or(z.literal('')),
    // كلمة المرور الأولية — يغيرها HR لاحقاً من ملفه
    password: z
      .string({ error: 'كلمة المرور الأولية مطلوبة' })
      .min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل')
      .regex(/[A-Za-z]/, 'كلمة المرور يجب أن تحتوي على حروف')
      .regex(/[0-9]/, 'كلمة المرور يجب أن تحتوي على أرقام'),
    status: z.enum(['APPROVED', 'PENDING'], { error: 'حالة الحساب مطلوبة' }).default('APPROVED'),
    forsahPermissions: z
      .array(z.string().min(1))
      .max(20, 'قائمة الصلاحيات طويلة جداً')
      .default([]),
    forsahCommissionPercent: z
      .preprocess(
        (v) => (v === '' || v === null || v === undefined ? null : v),
        z.coerce
          .number({ error: 'نسبة العمولة يجب أن تكون رقماً' })
          .min(0, 'النسبة غير صحيحة')
          .max(100, 'النسبة يجب أن تكون بين 0 و 100')
          .nullable()
      )
      .default(null),
  })
  .superRefine((data, ctx) => {
    const words = data.name.split(/\s+/).filter(Boolean)
    if (words.length !== 2) {
      ctx.addIssue({
        code: 'custom',
        message: 'أدخل اسماً ولقباً فقط — كلمتين حصراً (مثال: سامي عبدالله)',
        path: ['name'],
      })
    }
  })

export type HrCreateInput = z.infer<typeof hrCreateSchema>

/** حذف حساب موارد بشرية — الجولة 68: تأكيد كلمة مرور الإدارة إلزامي */
export const hrDeleteSchema = z.object({
  password: z
    .string({ error: 'كلمة مرور الإدارة مطلوبة لتأكيد الحذف' })
    .min(1, 'كلمة مرور الإدارة مطلوبة لتأكيد الحذف'),
})

/** تعديل حساب موارد بشرية من الإدارة */
export const hrUpdateSchema = z.object({
  action: z.enum(['UPDATE', 'SET_STATUS', 'RESET_PASSWORD', 'SET_PERMISSIONS'], {
    error: 'نوع التعديل غير صحيح',
  }),
  name: z.string().trim().max(80).optional(),
  jobTitle: z.string().trim().max(80).optional().or(z.literal('')),
  hospitalName: z.string().trim().max(120).optional().or(z.literal('')),
  email: z.string().email('البريد غير صحيح').max(120).optional().or(z.literal('')),
  status: z.enum(['PENDING', 'APPROVED', 'SUSPENDED']).optional(),
  password: z
    .string()
    .min(8, 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل')
    .regex(/[A-Za-z]/, 'كلمة المرور يجب أن تحتوي على حروف')
    .regex(/[0-9]/, 'كلمة المرور يجب أن تحتوي على أرقام')
    .optional(),
  forsahPermissions: z.array(z.string()).max(20).optional(),
  forsahCommissionPercent: z
    .preprocess(
      (v) => (v === '' || v === null || v === undefined ? null : v),
      z.coerce.number().min(0).max(100).nullable()
    )
    .optional(),
})

/** إعدادات رسوم «فرصة» — الإدارة حصراً (المواصفة 16) */
export const forsahFeeSettingsSchema = z.object({
  forsahFeeType: z.enum(['PERCENTAGE', 'FIXED'], { error: 'نوع الرسوم مطلوب' }),
  forsahFeeValue: z.coerce
    .number({ error: 'قيمة الرسوم مطلوبة' })
    .min(0, 'قيمة الرسوم غير صحيحة')
    .max(99_999_999, 'القيمة كبيرة جداً'),
  forsahHrCommissionPercent: z.coerce
    .number({ error: 'نسبة عمولة HR مطلوبة' })
    .min(0, 'النسبة غير صحيحة')
    .max(100, 'النسبة يجب أن تكون بين 0 و 100'),
  forsahFeeMin: z.coerce.number().min(0, 'الحد الأدنى غير صحيح').max(99_999_999),
  forsahFeeMax: z.coerce.number().min(0, 'الحد الأعلى غير صحيح').max(99_999_999),
})

/** الجولة 67: الإغلاق الكلي لنظام «فرصة» — الإدارة حصراً */
export const forsahSystemToggleSchema = z.object({
  systemEnabled: z.boolean({ error: 'حالة النظام مطلوبة' }),
})
