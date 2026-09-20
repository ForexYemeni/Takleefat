import { db } from '@/lib/db'
import { isPromoActive } from '@/lib/utils'

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
  // ---------- الجولة 44: عرض بدون رسوم إدارة (لفترة محدودة) ----------
  /** تشغيل جميع التكليفات بدون حصة إدارة — عرض تسويقي من الإدارة */
  promoActive: boolean
  /** نهاية العرض (ISO) — null = بدون نهاية حتى إيقافه يدوياً */
  promoUntil: string | null
  /** ملاحظة العرض التي تظهر في البانرات — مثال: «بمناسبة افتتاح المنصة» */
  promoNote: string
  // ---------- الجولة 66: رسوم ميزة «فرصة» (إضافي بحت — مستقلة تماماً عن رسوم التكليفات) ----------
  /** نوع رسوم الفرصة: نسبة من الراتب أو مبلغ ثابت — الإدارة وحدها تتحكم بها */
  forsahFeeType: 'PERCENTAGE' | 'FIXED'
  /** قيمة الرسوم: نسبة (٪) عند PERCENTAGE أو مبلغ عند FIXED */
  forsahFeeValue: number
  /** نسبة عمولة HR الافتراضية من الرسوم (٪) — تتجاوزها نسبة الحساب الفردية إن عُينت */
  forsahHrCommissionPercent: number
  /** الحد الأدنى للرسوم (0 = بلا حد) */
  forsahFeeMin: number
  /** الحد الأعلى للرسوم (0 = بلا حد) */
  forsahFeeMax: number
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
  promoActive: false,
  promoUntil: null,
  promoNote: '',
  // الجولة 66: رسوم «فرصة» — 5٪ من الراتب وعمولة HR ثلاثين بالمئة افتراضياً (آمنة ومنطقية)
  forsahFeeType: 'PERCENTAGE',
  forsahFeeValue: 5,
  forsahHrCommissionPercent: 30,
  forsahFeeMin: 0,
  forsahFeeMax: 0,
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
  promoActive: 'promoActive',
  promoUntil: 'promoUntil',
  promoNote: 'promoNote',
  // الجولة 66
  forsahFeeType: 'forsahFeeType',
  forsahFeeValue: 'forsahFeeValue',
  forsahHrCommissionPercent: 'forsahHrCommissionPercent',
  forsahFeeMin: 'forsahFeeMin',
  forsahFeeMax: 'forsahFeeMax',
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
export function calcAdminFee(
  value: number,
  settings: PlatformSettings,
  now: Date = new Date()
): number {
  // الجولة 44: أثناء العرض النشط تُعفى كل التكليفات الجديدة من حصة الإدارة كلياً
  if (isPromoActive(settings, now)) return 0
  if (settings.feeMode !== 'ADMIN') return 0
  if (settings.adminFeeType === 'FIXED') {
    return Math.max(0, Math.round(settings.adminFeeFixed))
  }
  return Math.round((value * settings.adminPercentage) / 100)
}

/**
 * هل العرض بدون الرسوم نشط الآن؟ — الجولة 44
 * نشط = promoActive + (promoUntil فارغ أو لم يحن بعده)
 */
export { isPromoActive } from '@/lib/utils'

/**
 * وصف نصي لاحتساب الرسوم حسب النمط النشط
 * مثال: «رسوم تقديم: 1,000 ريال» أو «10٪ من قيمة التكليف»
 */
export function feeLabel(settings: PlatformSettings): string {
  // الجولة 44: العرض النشط يطغى على الوصف — «بدون رسوم إدارة» حتى انتهائه
  if (isPromoActive(settings)) {
    const until = settings.promoUntil
      ? new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'long', timeZone: 'Asia/Riyadh' }).format(
          new Date(settings.promoUntil)
        )
      : 'حتى إشعار آخر'
    return `عرض بدون رسوم إدارة حتى ${until}`
  }
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

    const promoUntilRaw = map.get(KEYS.promoUntil) ?? ''
    const promoUntil =
      promoUntilRaw && !Number.isNaN(new Date(promoUntilRaw).getTime()) ? promoUntilRaw : null

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
      promoActive: map.get(KEYS.promoActive) === '1',
      promoUntil,
      promoNote: map.get(KEYS.promoNote) ?? SETTINGS_DEFAULTS.promoNote,
      // الجولة 66: رسوم «فرصة» — قراءة آمنة مع الافتراضيات
      forsahFeeType: map.get(KEYS.forsahFeeType) === 'FIXED' ? 'FIXED' : 'PERCENTAGE',
      forsahFeeValue: num('forsahFeeValue', SETTINGS_DEFAULTS.forsahFeeValue),
      forsahHrCommissionPercent: Math.min(
        100,
        num('forsahHrCommissionPercent', SETTINGS_DEFAULTS.forsahHrCommissionPercent)
      ),
      forsahFeeMin: num('forsahFeeMin', SETTINGS_DEFAULTS.forsahFeeMin),
      forsahFeeMax: num('forsahFeeMax', SETTINGS_DEFAULTS.forsahFeeMax),
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
