import { db } from '@/lib/db'

/**
 * إعدادات المنصة — تكليفات | Takleefat
 *
 * نمط الرسوم (feeMode) — يُحصَّل نوع واحد فقط:
 *   - APPLICATION: رسوم تقديم ثابتة يدفعها الكادر (تُحصَّل عند الاعتماد) — بلا حصة إدارة
 *   - ADMIN: حصة إدارة من قيمة التكليف (نسبة مئوية أو مبلغ ثابت) — بلا رسوم تقديم
 * تُخزن في جدول settings كمفتاح/قيمة مع قيم افتراضية آمنة.
 */

/** نمط تحصيل الرسوم: رسوم تقديم من الكادر أو حصة إدارة من قيمة التكليف */
export type FeeMode = 'APPLICATION' | 'ADMIN'

/** طريقة احتساب حصة الإدارة من التكليف */
export type AdminFeeType = 'PERCENTAGE' | 'FIXED'

export interface PlatformSettings {
  /** نمط الرسوم — يُحصَّل نوع واحد فقط (رسوم تقديم أو حصة إدارة) */
  feeMode: FeeMode
  /** رسوم التقديم الثابتة (ريال يمني) — تُستخدم فقط عندما feeMode = APPLICATION */
  applicationFee: number
  /** نوع حصة الإدارة: نسبة مئوية من قيمة التكليف أو مبلغ ثابت */
  adminFeeType: AdminFeeType
  /** نسبة الإدارة (٪) — تُستخدم عندما يكون feeMode = ADMIN و adminFeeType = PERCENTAGE */
  adminPercentage: number
  /** مبلغ ثابت للإدارة (ريال يمني) — يُستخدم عندما يكون feeMode = ADMIN و adminFeeType = FIXED */
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

/**
 * النسبة الأساسية التلقائية للمستلم الإداري ومشرف الأطباء من كل تكليف — الجولة 32:
 * نصف نسبة الإدارة (إذا كانت الإدارة 10٪ فيكون الافتراضي 5٪).
 * تُستخدم فقط عندما لا تكون هناك نسبة مخصصة محفوظة على الحساب نفسه
 * (User.commissionPercent) — الإدارة قد تخصّص النسبة لكل حساب على حدة
 * من صفحتي المستلمين / مشرفي الأطباء (9٪، 10٪... حتى 100٪).
 */
export function autoSharePercent(settings: Pick<PlatformSettings, 'adminPercentage'>): number {
  return Math.round((settings.adminPercentage / 2) * 10) / 10
}

/**
 * النسبة الفعالة لحساب مستلم إداري أو مشرف أطباء:
 * النسبة المخصصة على الحساب إن وُجدت، وإلا النسبة التلقائية (نصف نسبة الإدارة).
 */
export function effectiveSharePercent(
  user: { commissionPercent?: number | null },
  settings: Pick<PlatformSettings, 'adminPercentage'>
): number {
  const custom = user.commissionPercent
  return typeof custom === 'number' && custom >= 0 && custom <= 100
    ? custom
    : autoSharePercent(settings)
}

export const SETTINGS_DEFAULTS: PlatformSettings = {
  feeMode: 'ADMIN',
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
  feeMode: 'feeMode',
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
 * رسوم التقديم المُحصَّلة فعلياً — صفر ما لم يكن نمط الرسوم «رسوم تقديم»
 */
export function calcApplicationFee(settings: PlatformSettings): number {
  return settings.feeMode === 'APPLICATION'
    ? Math.max(0, Math.round(settings.applicationFee))
    : 0
}

/**
 * حساب حصة الإدارة من قيمة التكليف — نسبة مئوية أو مبلغ ثابت
 * تُحصَّل فقط عندما يكون نمط الرسوم «حصة إدارة»، وإلا تكون صفراً
 */
export function calcAdminFee(value: number, settings: PlatformSettings): number {
  if (settings.feeMode !== 'ADMIN') return 0
  if (settings.adminFeeType === 'FIXED') {
    return Math.max(0, Math.round(settings.adminFeeFixed))
  }
  return Math.round((value * settings.adminPercentage) / 100)
}

/**
 * وصف نصي لاحتساب الرسوم حسب النمط النشط
 * مثال: «رسوم تقديم: 1,000 ريال» أو «10٪ من قيمة التكليف»
 */
export function feeLabel(settings: PlatformSettings): string {
  if (settings.feeMode === 'APPLICATION') {
    return `رسوم تقديم ${settings.applicationFee.toLocaleString('ar-YE')} ريال`
  }
  return settings.adminFeeType === 'FIXED'
    ? `حصة إدارة بمبلغ ثابت ${settings.adminFeeFixed.toLocaleString('ar-YE')} ريال`
    : `حصة إدارة ${settings.adminPercentage}٪ من قيمة التكليف`
}

/** alias قديم متوافق — وصف حصة الإدارة فقط */
export const adminFeeLabel = feeLabel

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

    const feeMode = map.get(KEYS.feeMode) === 'APPLICATION' ? 'APPLICATION' : 'ADMIN'
    const adminFeeType = map.get(KEYS.adminFeeType) === 'FIXED' ? 'FIXED' : 'PERCENTAGE'

    return {
      feeMode,
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
