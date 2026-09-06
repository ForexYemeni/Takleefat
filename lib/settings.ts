import { db } from '@/lib/db'

/**
 * إعدادات المنصة — تكليفات | Takleefat
 * رسوم التقديم، حصة الإدارة (نسبة مئوية أو مبلغ ثابت)، وطرق الدفع (مثل محفظة جيب).
 * تُخزن في جدول settings كمفتاح/قيمة مع قيم افتراضية آمنة.
 */

/** طريقة احتساب حصة الإدارة من التكليف */
export type AdminFeeType = 'PERCENTAGE' | 'FIXED'

export interface PlatformSettings {
  /** رسوم التقديم الثابتة على التكليف (ريال يمني) — يدفعها الكادر عند الاعتماد */
  applicationFee: number
  /** نوع حصة الإدارة: نسبة مئوية من قيمة التكليف أو مبلغ ثابت */
  adminFeeType: AdminFeeType
  /** نسبة الإدارة (٪) — تُستخدم عندما يكون adminFeeType = PERCENTAGE */
  adminPercentage: number
  /** مبلغ ثابت للإدارة (ريال يمني) — يُستخدم عندما يكون adminFeeType = FIXED */
  adminFeeFixed: number
  /** اسم طريقة الدفع — مثال: محفظة جيب */
  paymentMethod: string
  /** رقم حساب الإدارة في طريقة الدفع */
  paymentAccountNumber: string
  /** اسم الحساب في طريقة الدفع */
  paymentAccountName: string
  /** ملاحظات إضافية على الدفع */
  paymentNotes: string
}

export const SETTINGS_DEFAULTS: PlatformSettings = {
  applicationFee: 1000,
  adminFeeType: 'PERCENTAGE',
  adminPercentage: 10,
  adminFeeFixed: 0,
  paymentMethod: 'محفظة جيب',
  paymentAccountNumber: '',
  paymentAccountName: 'منصة تكليفات',
  paymentNotes: '',
}

const KEYS: Record<keyof PlatformSettings, string> = {
  applicationFee: 'applicationFee',
  adminFeeType: 'adminFeeType',
  adminPercentage: 'adminPercentage',
  adminFeeFixed: 'adminFeeFixed',
  paymentMethod: 'paymentMethod',
  paymentAccountNumber: 'paymentAccountNumber',
  paymentAccountName: 'paymentAccountName',
  paymentNotes: 'paymentNotes',
}

/**
 * حساب حصة الإدارة من قيمة التكليف — نسبة مئوية أو مبلغ ثابت
 */
export function calcAdminFee(value: number, settings: PlatformSettings): number {
  if (settings.adminFeeType === 'FIXED') {
    return Math.max(0, Math.round(settings.adminFeeFixed))
  }
  return Math.round((value * settings.adminPercentage) / 100)
}

/**
 * وصف نصي لاحتساب حصة الإدارة — يُعرض للكادر والجهات
 * مثال: «10٪ من قيمة التكليف» أو «مبلغ ثابت: 5,000 ريال»
 */
export function adminFeeLabel(settings: PlatformSettings): string {
  return settings.adminFeeType === 'FIXED'
    ? `مبلغ ثابت ${settings.adminFeeFixed.toLocaleString('ar-YE')} ريال`
    : `${settings.adminPercentage}٪ من قيمة التكليف`
}

/**
 * قراءة الإعدادات من قاعدة البيانات مع دمج القيم الافتراضية
 */
export async function getSettings(): Promise<PlatformSettings> {
  try {
    const rows = await db.setting.findMany({
      where: { key: { in: Object.values(KEYS) } },
    })
    const map = new Map(rows.map((r) => [r.key, r.value]))

    const num = (key: keyof PlatformSettings, fallback: number) => {
      const raw = map.get(KEYS[key])
      const parsed = raw != null ? Number(raw) : NaN
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
    }
    const str = (key: keyof PlatformSettings, fallback: string) => {
      const raw = map.get(KEYS[key])
      return raw != null && raw.trim() !== '' ? raw : fallback
    }

    const adminFeeType = map.get(KEYS.adminFeeType) === 'FIXED' ? 'FIXED' : 'PERCENTAGE'

    return {
      applicationFee: num('applicationFee', SETTINGS_DEFAULTS.applicationFee),
      adminFeeType,
      adminPercentage: Math.min(100, num('adminPercentage', SETTINGS_DEFAULTS.adminPercentage)),
      adminFeeFixed: num('adminFeeFixed', SETTINGS_DEFAULTS.adminFeeFixed),
      paymentMethod: str('paymentMethod', SETTINGS_DEFAULTS.paymentMethod),
      paymentAccountNumber: str('paymentAccountNumber', SETTINGS_DEFAULTS.paymentAccountNumber),
      paymentAccountName: str('paymentAccountName', SETTINGS_DEFAULTS.paymentAccountName),
      paymentNotes: map.get(KEYS.paymentNotes) ?? SETTINGS_DEFAULTS.paymentNotes,
    }
  } catch {
    // في حال عدم توفر الجداول بعد — نُرجع الافتراضي بدل تعطيل الخدمة
    return { ...SETTINGS_DEFAULTS }
  }
}

/**
 * حفظ قيمة إعداد واحد
 */
export async function setSetting(key: string, value: string): Promise<void> {
  await db.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  })
}
