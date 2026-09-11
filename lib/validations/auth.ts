import { z } from 'zod'

/**
 * قواعد التسجيل — الجولة الثالثة عشرة:
 * - الاسم: حقل واحد يحوي الاسم مع اللقب (كلمتان على الأقل) للكادر والمستلم
 * - الهاتف: 9 أرقام حصراً (يبدأ بـ 7) ولا يقبل رقماً إضافياً
 * - كلمة المرور: تُدخل مرة واحدة دون تأكيد
 * - التخصص: إجباري للكادر (من الأقسام المُدارة في حساب الإدارة)
 * - سنوات الخبرة: إجبارية للكادر (0 للمتخرج الجديد — لكن لا تُترك فارغة)
 * - المؤهل العلمي: ثلاثة خيارات ثابتة (أورديلي سنة / دبلوم ثلاث سنوات / بكالوريوس أربع سنوات)
 * - الجنس: إجباري للكادر التمريضي (ذكر أو أنثى)
 * - المستلم الإداري: الجهة الصحية من قائمة الإدارة أو جهة جديدة تُرفع للاعتماد مع بقية بياناتها
 */

export const PHONE_REGEX = /^7\d{8}$/
export const PHONE_MESSAGE =
  'رقم الهاتف يجب أن يبدأ بـ 7 ويتكوّن من 9 أرقام فقط — مثال: 773178684'

/** المؤهل العلمي — الخيارات الثابتة الثلاثة (نفس قيم QUALIFICATION_OPTIONS في lib/utils) */
export const QUALIFICATION_VALUES = ['أورديلي سنة', 'دبلوم ثلاث سنوات', 'بكالوريوس أربع سنوات'] as const

/** المؤهل العلمي للأطباء — خيارات ثابتة خاصة بمنظومة الأطباء */
export const DOCTOR_QUALIFICATION_VALUES = [
  'بكالوريوس طب وجراحة',
  'ماجستير',
  'دكتوراه',
  'شهادة زمالة',
] as const

export const loginSchema = z.object({
  phone: z
    .string({ error: 'رقم الهاتف مطلوب' })
    .regex(PHONE_REGEX, PHONE_MESSAGE),
  password: z
    .string({ error: 'كلمة المرور مطلوبة' })
    .min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
})

/** بيانات الجهة الصحية الجديدة — يكملها مقدّم الطلب ليُراجعها حساب الإدارة ويعتمدها أو يرفضها */
export const newOrgSchema = z.object({
  type: z
    .enum(['HOSPITAL', 'MEDICAL_CENTER', 'SPECIALIZED_CENTER', 'CLINIC', 'MEDICAL_COMPLEX', 'OTHER'], {
      error: 'نوع الجهة غير صحيح',
    })
    .default('HOSPITAL'),
  city: z.string().max(80, 'المدينة طويلة جداً').optional().or(z.literal('')),
  address: z.string().max(200, 'العنوان طويل جداً').optional().or(z.literal('')),
  phone: z.string().max(20, 'رقم التواصل طويل جداً').optional().or(z.literal('')),
  email: z
    .string()
    .email('البريد الإلكتروني غير صحيح')
    .max(120)
    .optional()
    .or(z.literal('')),
})

export const registerSchema = z
  .object({
    // الافتراضي: كادر تمريضي — للتوافق مع أي طلبات قديمة لا تُرسل الحقل
    // DOCTOR: تسجيل ذاتي للطبيب (منظومة الأطباء) — مشرف الأطباء لا يُسجّل ذاتياً (الإدارة تنشئه)
    role: z.enum(['NURSE', 'RECEIVER', 'DOCTOR'], { error: 'نوع الحساب مطلوب' }).default('NURSE'),
    // الاسم مع اللقب فقط — كلمتان على الأقل (تُفحص في superRefine)
    name: z
      .string({ error: 'الاسم مطلوب' })
      .min(3, 'الاسم يجب أن يكون 3 أحرف على الأقل')
      .max(80, 'الاسم طويل جداً'),
    phone: z.string({ error: 'رقم الهاتف مطلوب' }).regex(PHONE_REGEX, PHONE_MESSAGE),
    // كلمة المرور تُدخل مرة واحدة — دون تأكيد (الجولة الثامنة)
    password: z
      .string({ error: 'كلمة المرور مطلوبة' })
      .min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل')
      .regex(/[A-Za-z]/, 'كلمة المرور يجب أن تحتوي على حروف')
      .regex(/[0-9]/, 'كلمة المرور يجب أن تحتوي على أرقام'),
    // حقول خاصة بالكادر التمريضي والطبيب — التخصص إجباري (تُفحص في superRefine)
    specialty: z.string().trim().max(80, 'التخصص طويل جداً').optional(),
    // المؤهل: للكادر من 3 خيارات وللطبيب من خياراته الخاصة (تُفحص في superRefine)
    qualification: z.string().optional(),
    // الجهة الصحية (المستشفى) — خاصة بالمستلم الإداري
    hospitalName: z.string().max(120, 'اسم الجهة الصحية طويل جداً').optional(),
    // جهة صحية جديدة لا توجد في قائمة الإدارة — تُرفع بانتظار الاعتماد مع بقية بياناتها
    newOrg: newOrgSchema.optional(),
    // الجنس إجباري للكادر التمريضي
    gender: z.enum(['MALE', 'FEMALE'], { error: 'الجنس مطلوب — اختر ذكر أو أنثى' }).optional(),
    // سنوات الخبرة — إجبارية للكادر (تُفحص في superRefine) والفراغ يُعامل كحقل مفقود
    yearsOfExperience: z
      .preprocess(
        (v) => (v === '' || v === null ? undefined : v),
        z.coerce
          .number({ error: 'سنوات الخبرة مطلوبة — أدخل عدد السنوات (0 للمتخرج الجديد)' })
          .int('سنوات الخبرة يجب أن تكون رقماً صحيحاً')
          .min(0, 'سنوات الخبرة غير صحيحة')
          .max(50, 'سنوات الخبرة غير صحيحة')
      )
      .optional(),
  })
  .superRefine((data, ctx) => {
    // الاسم مع اللقب فقط: كلمتان على الأقل
    const words = data.name.trim().split(/\s+/).filter(Boolean)
    if (words.length < 2) {
      ctx.addIssue({
        code: 'custom',
        message: 'أدخل الاسم مع اللقب — مثال: أحمد صالح (الاسم واللقب فقط)',
        path: ['name'],
      })
    }

    // بيانات الكادر التمريضي والطبيب: المؤهل والجنس والتخصص وسنوات الخبرة كلها إلزامية
    if (data.role === 'NURSE' || data.role === 'DOCTOR') {
      // المؤهل من قائمة الدور الصحيحة (الطبيب له خياراته الخاصة)
      const allowedQuals: readonly string[] =
        data.role === 'DOCTOR' ? DOCTOR_QUALIFICATION_VALUES : QUALIFICATION_VALUES
      if (!data.qualification || !allowedQuals.includes(data.qualification)) {
        ctx.addIssue({
          code: 'custom',
          message:
            data.role === 'DOCTOR'
              ? 'المؤهل العلمي مطلوب — اختر من القائمة (بكالوريوس طب وجراحة / ماجستير / دكتوراه / شهادة زمالة)'
              : 'المؤهل العلمي مطلوب — اختر من القائمة (أورديلي / دبلوم / بكالوريوس)',
          path: ['qualification'],
        })
      }
      if (!data.gender) {
        ctx.addIssue({
          code: 'custom',
          message: 'الجنس مطلوب — اختر ذكر أو أنثى',
          path: ['gender'],
        })
      }
      if (!data.specialty || data.specialty.trim().length === 0) {
        ctx.addIssue({
          code: 'custom',
          message:
            data.role === 'DOCTOR'
              ? 'التخصص مطلوب — اختر التخصص الطبي من القائمة'
              : 'التخصص مطلوب — اختر القسم من القائمة',
          path: ['specialty'],
        })
      }
      if (data.yearsOfExperience == null) {
        ctx.addIssue({
          code: 'custom',
          message: 'سنوات الخبرة مطلوبة — أدخل عدد السنوات (0 للمتخرج الجديد)',
          path: ['yearsOfExperience'],
        })
      }
    }

    if (data.role === 'RECEIVER') {
      if (!data.hospitalName || data.hospitalName.trim().length < 2) {
        ctx.addIssue({
          code: 'custom',
          message: 'اسم الجهة الصحية مطلوب — اخترها من القائمة أو أضفها كجهة جديدة',
          path: ['hospitalName'],
        })
      }
    }
  })

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type RegisterFormValues = z.input<typeof registerSchema>
