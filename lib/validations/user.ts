import { z } from 'zod'
import { PHONE_REGEX, PHONE_MESSAGE } from '@/lib/validations/auth'

/**
 * حسابات يُنشئها مدير النظام (مستلم إداري / كادر صحي) ومستلم الجهة لكوادر جهته.
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

/**
 * إنشاء مشرف أطباء من الإدارة — الجولة 31:
 * الجهة الصحية إجبارية ويجب أن تكون من جهات الإدارة المسجلة (كتالوج الجهات الصحية)
 * — المشرف يرتبط بجهته رسمياً فيُحل الارتباط تلقائياً في كل مسارات المنصة.
 */
export const createSupervisorSchema = z.object({
  name: fullNameSchema,
  phone: adminPhoneSchema,
  password: adminPasswordSchema,
  hospitalName: z
    .string({ error: 'الجهة الصحية مطلوبة — اخترها من جهات الإدارة المسجلة' })
    .trim()
    .min(1, 'الجهة الصحية مطلوبة — اخترها من جهات الإدارة المسجلة')
    .max(120, 'اسم الجهة الصحية طويل جداً'),
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
  // المؤهل العلمي — إجباري، وتُتحقق قيمته على الخادم من كتالوج المؤهلات المُدار من الإدارة (الجولة 32)
  qualification: z
    .string({ error: 'المؤهل العلمي مطلوب — اختره من القائمة' })
    .trim()
    .min(1, 'المؤهل العلمي مطلوب — اختره من القائمة')
    .max(80, 'المؤهل طويل جداً'),
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
  // المؤهل العلمي — إجباري، وتُتحقق قيمته على الخادم من كتالوج المؤهلات (الجولة 32)
  qualification: z
    .string({ error: 'المؤهل العلمي مطلوب — اختره من القائمة' })
    .trim()
    .min(1, 'المؤهل العلمي مطلوب — اختره من القائمة')
    .max(80, 'المؤهل طويل جداً'),
  // القسم / التخصص — إجباري من كتالوج الأقسام المُدار من حساب الإدارة (لا كتابة حرة)
  specialty: z
    .string({ error: 'القسم مطلوب — اختر القسم من كتالوج الإدارة' })
    .trim()
    .min(1, 'القسم مطلوب — اختر القسم من كتالوج الإدارة')
    .max(80, 'القسم طويل جداً'),
  yearsOfExperience: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.coerce
      .number({ error: 'سنوات الخبرة مطلوبة — أدخل عدد السنوات (0 للمتخرج الجديد)' })
      .int('سنوات الخبرة يجب أن تكون رقماً صحيحاً')
      .min(0, 'سنوات الخبرة غير صحيحة')
      .max(50, 'سنوات الخبرة غير صحيحة')
  ),
})

/** إنشاء حساب طبيب من الإدارة — مؤهلات الأطباء الخاصة (منظومة الأطباء) */
export const createDoctorSchema = z.object({
  name: fullNameSchema,
  phone: adminPhoneSchema,
  password: adminPasswordSchema,
  specialty: z
    .string({ error: 'التخصص مطلوب — اختر التخصص الطبي من القائمة' })
    .trim()
    .min(1, 'التخصص مطلوب — اختر التخصص الطبي من القائمة')
    .max(80, 'التخصص طويل جداً'),
  qualification: z
    .string({ error: 'المؤهل العلمي مطلوب — اختره من القائمة' })
    .trim()
    .min(1, 'المؤهل العلمي مطلوب — اختره من القائمة')
    .max(80, 'المؤهل طويل جداً'),
  gender: z.enum(['MALE', 'FEMALE'], { error: 'الجنس مطلوب — اختر ذكر أو أنثى' }),
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
export type CreateDoctorInput = z.infer<typeof createDoctorSchema>
export type CreateDoctorFormValues = z.input<typeof createDoctorSchema>
export type CreateSupervisorInput = z.infer<typeof createSupervisorSchema>

// ---------- المؤهلات العلمية — تعديل مؤهل كادر/طبيب من الإدارة (الجولة 31) ----------

export const updateQualificationSchema = z.object({
  userId: z.string({ error: 'معرّف الحساب مطلوب' }).min(1, 'معرّف الحساب مطلوب'),
  // المؤهل يُتحقق منه على الخادم من كتالوج المؤهلات العلمية المُدار من الإدارة (الجولة 32)
  qualification: z
    .string({ error: 'المؤهل العلمي مطلوب — اختره من القائمة' })
    .trim()
    .min(1, 'المؤهل العلمي مطلوب — اختره من القائمة')
    .max(80, 'المؤهل طويل جداً'),
})

export type UpdateQualificationInput = z.infer<typeof updateQualificationSchema>
export type ReceiverCreateNurseInput = z.infer<typeof receiverCreateNurseSchema>
export type ReceiverCreateNurseFormValues = z.input<typeof receiverCreateNurseSchema>

// ---------- نِسَب الحصص والأذونات — للمستلم الإداري ومشرف الأطباء (الجولة 32) ----------

/**
 * تعديل نسبة الحصة من قيمة كل تكليف لحساب مستلم إداري أو مشرف أطباء:
 * - commissionPercent = رقم 0..100 → نسبة مخصصة لهذا الحساب حصراً
 * - commissionPercent = null → العودة للتلقائي (نصف نسبة الإدارة)
 */
export const commissionPercentSchema = z.object({
  commissionPercent: z
    .number({ error: 'النسبة غير صحيحة' })
    .min(0, 'النسبة لا يمكن أن تكون سالبة')
    .max(100, 'النسبة لا تتجاوز 100٪')
    .nullable(),
})

/** فتح/إغلاق إذن رؤية البيانات الكاملة (السيرة الذاتية + المستندات) من حساب الإدارة */
export const fullProfileAccessSchema = z.object({
  fullProfileAccess: z.boolean({ error: 'قيمة الإذن غير صحيحة' }),
})

/** فتح/إغلاق إذن «موثوق جداً» لرؤية بيانات الاتصال — من حساب الإدارة (الجولة 36) */
export const trustedContactViewerSchema = z.object({
  trustedContactViewer: z.boolean({ error: 'قيمة الإذن غير صحيحة' }),
})

export type CommissionPercentInput = z.infer<typeof commissionPercentSchema>
export type FullProfileAccessInput = z.infer<typeof fullProfileAccessSchema>

// ---------- كتالوج المؤهلات العلمية — إدارة الإدارة (الجولة 32) ----------

export const qualificationCatalogSchema = z.object({
  name: z
    .string({ error: 'اسم المؤهل مطلوب' })
    .trim()
    .min(2, 'اسم المؤهل قصير جداً — مثال: دبلوم عالي')
    .max(80, 'اسم المؤهل طويل جداً'),
  audience: z.enum(['NURSE', 'DOCTOR'], { error: 'جمهور المؤهل مطلوب — كادر صحي أو أطباء' }),
})

export const qualificationCatalogUpdateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'اسم المؤهل قصير جداً — مثال: دبلوم عالي')
    .max(80, 'اسم المؤهل طويل جداً')
    .optional(),
  isActive: z.boolean().optional(),
})

export type QualificationCatalogInput = z.infer<typeof qualificationCatalogSchema>
export type QualificationCatalogUpdateInput = z.infer<typeof qualificationCatalogUpdateSchema>

// ---------- إدارة الحساب من الإدارة (تغيير كلمة المرور / حذف نهائي) ----------

export const resetPasswordSchema = z.object({
  password: adminPasswordSchema,
})

// ---------- الجولة 59: نقل الحساب إلى دور آخر — بتأكيد كلمة مرور الإدارة ----------

/**
 * الأدوار القابلة للنقل من حساب الإدارة — كل الأدوار عدا ADMIN:
 * حسابات المديرين تُدار خارج المنصة (متغيرات البيئة) ولا تُنشأ ولا تُعدَّل من هنا.
 */
export const TRANSFERABLE_ROLES = ['NURSE', 'RECEIVER', 'DOCTOR', 'DOCTOR_SUPERVISOR'] as const

export type TransferableRole = (typeof TRANSFERABLE_ROLES)[number]

export const changeRoleSchema = z.object({
  role: z.enum(TRANSFERABLE_ROLES, { error: 'الدور الجديد غير صحيح' }),
  // كلمة مرور حساب الإدارة الجالس حالياً — بوابة هوية إلزامية قبل أي نقل
  password: z
    .string({ error: 'تأكيد كلمة مرور حساب الإدارة مطلوب' })
    .min(1, 'أدخل كلمة مرور حساب الإدارة'),
})

export type ChangeRoleInput = z.infer<typeof changeRoleSchema>

// ---------- الجولة 60: الصلاحيات المركّبة — منح/سحب أدوار إضافية بتأكيد كلمة مرور الإدارة ----------

/**
 * التعيين يتم بالاستبدال الكامل للقائمة (idempotent) — الإدارة ترسل القائمة
 * المطلوبة النهائية، والخادم يقارنها بالقائمة الحالية ليحدد ما مُنح وما سُحب.
 * ADMIN مستثنى نهائياً (TRANSFERABLE_ROLES لا تتضمنه) — لا يمكن منحه أبداً.
 */
export const changeExtraRolesSchema = z.object({
  extraRoles: z
    .array(z.enum(TRANSFERABLE_ROLES, { error: 'إحدى الصلاحيات غير صحيحة' }), {
      error: 'قائمة الصلاحيات غير صحيحة',
    })
    .max(3, 'الحد الأقصى ثلاث صلاحيات مركّبة'),
  // كلمة مرور حساب الإدارة الجالس حالياً — بوابة هوية إلزامية قبل أي منح/سحب
  password: z
    .string({ error: 'تأكيد كلمة مرور حساب الإدارة مطلوب' })
    .min(1, 'أدخل كلمة مرور حساب الإدارة'),
})

export type ChangeExtraRolesInput = z.infer<typeof changeExtraRolesSchema>

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

// ---------- أقسام عمل الكادر الصحي (تعدد أقسام من كتالوج الإدارة) ----------

export const workDepartmentsSchema = z.object({
  // معرفات الأقسام المختارة من كتالوج الإدارة — استبدال كامل للمجموعة الحالية
  departmentIds: z
    .array(z.string().min(1, 'معرّف القسم غير صحيح'), { error: 'قائمة الأقسام غير صحيحة' })
    .max(20, 'الحد الأقصى 20 قسماً'),
})

export type WorkDepartmentsInput = z.infer<typeof workDepartmentsSchema>

// ---------- تخصصات عمل الطبيب (تعدد تخصصات من كتالوج التخصصات الطبية — منظومة الأطباء) ----------

export const workSpecialtiesSchema = z.object({
  // معرفات التخصصات المختارة من كتالوج الإدارة — استبدال كامل للمجموعة الحالية
  specialtyIds: z
    .array(z.string().min(1, 'معرّف التخصص غير صحيح'), { error: 'قائمة التخصصات غير صحيحة' })
    .max(20, 'الحد الأقصى 20 تخصصاً'),
})

export type WorkSpecialtiesInput = z.infer<typeof workSpecialtiesSchema>

// ---------- الجولة 51: البريد الإلكتروني — قناة إشعارات رسمية إضافية ----------

/** صيغة بريد إلكتروني آمنة — بأسلوب مبسط يمنع الأخطاء الشائعة */
export const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

export const setEmailSchema = z.object({
  email: z
    .string({ error: 'البريد الإلكتروني مطلوب' })
    .trim()
    .toLowerCase()
    .max(120, 'البريد الإلكتروني طويل جداً')
    .regex(EMAIL_REGEX, 'صيغة البريد الإلكتروني غير صحيحة'),
})

export const verifyEmailSchema = z.object({
  code: z
    .string({ error: 'رمز التحقق مطلوب' })
    .trim()
    .regex(/^\d{6}$/, 'رمز التحقق يجب أن يكون 6 أرقام'),
})

/** تفضيلات أقسام الإشعارات — أقسام الأمان مقفلة ولا تُقبل هنا إطلاقاً */
export const emailSettingsSchema = z.object({
  enabled: z.boolean({ error: 'قيمة المفتاح الرئيس غير صحيحة' }).optional(),
  preferences: z
    .object({
      assignments: z.boolean().optional(),
      requests: z.boolean().optional(),
      updates: z.boolean().optional(),
      documents: z.boolean().optional(),
      admin: z.boolean().optional(),
      account: z.boolean().optional(),
      important: z.boolean().optional(),
    })
    .optional(),
})

export type SetEmailInput = z.infer<typeof setEmailSchema>
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>
export type EmailSettingsInput = z.infer<typeof emailSettingsSchema>

// ---------- الجولة 74: طلبات تعديل الملف المهني (إضافي بحت) ----------

/**
 * طلب تعديل الملف المهني من الكادر الصحي/الطبيب:
 * حقل واحد على الأقل إجباري — والقيم الجديدة يجب أن تختلف عن الحالية
 * (الفرق عن الحالية يتحقق على الخادم حيث تُقرأ بيانات الحساب).
 * المؤهل يُتحقق منه على الخادم من كتالوج المؤهلات حسب جمهور صاحب الطلب،
 * والتخصص نص حر بإطار مقيّد (كما في نماذج التسجيل)، والخبرة 0..50 سنة.
 */
export const profileEditRequestSchema = z
  .object({
    specialty: z
      .string()
      .trim()
      .max(80, 'التخصص طويل جداً — الحد 80 حرفاً')
      .optional(),
    qualification: z
      .string()
      .trim()
      .max(80, 'المؤهل طويل جداً — الحد 80 حرفاً')
      .optional(),
    yearsOfExperience: z.preprocess(
      (v) => (v === '' || v === null ? undefined : v),
      z.coerce
        .number({ error: 'سنوات الخبرة يجب أن تكون رقماً' })
        .int('سنوات الخبرة يجب أن تكون رقماً صحيحاً')
        .min(0, 'سنوات الخبرة غير صحيحة — 0 للمتخرج الجديد')
        .max(50, 'سنوات الخبرة غير صحيحة — الحد 50 سنة')
    ).optional(),
    note: z.string().trim().max(400, 'الملاحظة طويلة جداً — الحد 400 حرف').optional(),
  })
  .refine(
    (d) =>
      (d.specialty !== undefined && d.specialty !== '') ||
      (d.qualification !== undefined && d.qualification !== '') ||
      d.yearsOfExperience !== undefined,
    { message: 'يجب إدخال قيمة جديدة لحقل واحد على الأقل (التخصص أو المؤهل أو سنوات الخبرة)' }
  )

export type ProfileEditRequestInput = z.infer<typeof profileEditRequestSchema>

/** قرار المراجعة على طلب تعديل الملف المهني — الإدارة أو الموارد البشرية */
export const profileEditDecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED'], { error: 'القرار غير صحيح' }),
  reviewNote: z.string().trim().max(400, 'ملاحظة المراجعة طويلة جداً — الحد 400 حرف').optional(),
})

export type ProfileEditDecisionInput = z.infer<typeof profileEditDecisionSchema>
