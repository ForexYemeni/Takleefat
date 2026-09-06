import { db } from '@/lib/db'

/**
 * إعدادات المنصة — تكليفات | Takleefat
 * رسوم التقديم، نسبة الإدارة، وطرق الدفع (مثل محفظة جيب).
 * تُخزن في جدول settings كمفتاح/قيمة مع قيم افتراضية آمنة.
 */

export interface PlatformSettings {
  /** رسوم التقديم الثابتة على التكليف (ريال يمني) — يدفعها الكادر عند الاعتماد */
  applicationFee: number
  /** نسبة الإدارة من قيمة التكليف (٪) */
  adminPercentage: number
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
  adminPercentage: 10,
  paymentMethod: 'محفظة جيب',
  paymentAccountNumber: '',
  paymentAccountName: 'منصة تكليفات',
  paymentNotes: '',
}

const KEYS: Record<keyof PlatformSettings, string> = {
  applicationFee: 'applicationFee',
  adminPercentage: 'adminPercentage',
  paymentMethod: 'paymentMethod',
  paymentAccountNumber: 'paymentAccountNumber',
  paymentAccountName: 'paymentAccountName',
  paymentNotes: 'paymentNotes',
}

/**
 * حساب حصة الإدارة من قيمة التكليف
 */
export function calcAdminFee(value: number, adminPercentage: number): number {
  return Math.round((value * adminPercentage) / 100)
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

    return {
      applicationFee: num('applicationFee', SETTINGS_DEFAULTS.applicationFee),
      adminPercentage: Math.min(100, num('adminPercentage', SETTINGS_DEFAULTS.adminPercentage)),
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
