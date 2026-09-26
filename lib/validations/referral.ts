import { z } from 'zod'
import { PHONE_REGEX, PHONE_MESSAGE } from '@/lib/validations/auth'

/**
 * قواعد التحقق — برنامج إحالة تكليفات (الجولة 75 — إضافي بحت كلياً)
 * كل القواعد تُطبق على الخادم — الواجهة تكررها للتجربة فقط.
 */

/** دعوة مباشرة — الاسم (كلمتان كما نظام التسجيل) والهاتف (7xxxxxxxx) */
export const referralInviteSchema = z.object({
  name: z
    .string({ error: 'اسم المدعو مطلوب' })
    .trim()
    .min(3, 'الاسم يجب أن يكون 3 أحرف على الأقل')
    .max(80, 'الاسم طويل جداً'),
  phone: z.string({ error: 'رقم هاتف المدعو مطلوب' }).regex(PHONE_REGEX, PHONE_MESSAGE),
  note: z.string().trim().max(200, 'الملاحظة طويلة جداً').optional().or(z.literal('')),
})

const percentField = (label: string) =>
  z.coerce
    .number({ error: `${label} يجب أن يكون رقماً` })
    .min(0, `${label} لا تقل عن 0`)
    .max(100, `${label} لا تزيد عن 100`)

const intField = (label: string, max: number) =>
  z.coerce
    .number({ error: `${label} يجب أن يكون رقماً` })
    .int(`${label} يجب أن يكون رقماً صحيحاً`)
    .min(0, `${label} لا يقبل قيماً سالبة`)
    .max(max, `${label} أكبر من المسموح`)

/** إعدادات برنامج الإحالة — الإدارة حصراً */
export const referralSettingsSchema = z.object({
  enabled: z.boolean({ error: 'حالة النظام مطلوبة' }),
  percentNURSE: percentField('نسبة الكادر الصحي'),
  percentDOCTOR: percentField('نسبة الطبيب'),
  percentDOCTOR_SUPERVISOR: percentField('نسبة مشرف الأطباء'),
  percentRECEIVER: percentField('نسبة المستلم الإداري'),
  percentHR: percentField('نسبة الموارد البشرية'),
  maxRewardPerReferral: intField('الحد الأقصى للاستحقاق', 100_000_000),
  maxInvitesPerReferrer: intField('الحد الأقصى للدعوات', 10_000),
  minOperationValue: intField('الحد الأدنى للعملية', 1_000_000_000),
  validityDays: intField('مدة صلاحية الإحالة', 3650),
  includeAssignments: z.boolean({ error: 'خيار التكليفات مطلوب' }),
  includeOpportunities: z.boolean({ error: 'خيار الفرص مطلوب' }),
  rewardsRequireReview: z.boolean({ error: 'خيار المراجعة مطلوب' }),
  policyNote: z.string().trim().max(400, 'نص السياسة طويل جداً').optional().or(z.literal('')),
})

export type ReferralSettingsInput = z.infer<typeof referralSettingsSchema>

/** قرار الإدارة على ميزة بانتظار المراجعة */
export const referralRewardDecisionSchema = z.object({
  decision: z.enum(['APPROVE', 'CANCEL'], { error: 'القرار غير صحيح' }),
  note: z.string().trim().max(300, 'الملاحظة طويلة جداً').optional().or(z.literal('')),
})

/** تسجيل استخدام مزايا (خصم من رسوم المنصة) — الإدارة حصراً */
export const referralUsageSchema = z.object({
  referrerId: z.string({ error: 'المُحيل مطلوب' }).min(1, 'المُحيل مطلوب'),
  amount: z.coerce
    .number({ error: 'قيمة الخصم مطلوبة' })
    .positive('قيمة الخصم يجب أن تكون موجبة')
    .max(1_000_000_000, 'القيمة أكبر من المسموح'),
  note: z.string().trim().max(300, 'البيان طويل جداً').optional().or(z.literal('')),
})

/** تغيير حالة إحالة من الإدارة (إدارة الحالات) */
export const referralStatusChangeSchema = z.object({
  action: z.enum(['BLOCK', 'UNBLOCK'], { error: 'الإجراء غير صحيح' }),
  note: z.string().trim().max(300, 'الملاحظة طويلة جداً').optional().or(z.literal('')),
})
