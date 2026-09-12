import type { AssignmentStatus, PaymentStatus } from '@prisma/client'
import { db } from '@/lib/db'
import { getSettings, calcApplicationFee } from '@/lib/settings'

/**
 * خصوصية أرقام تواصل الكادر — الجولات 34-38
 * =====================================================================
 * القاعدة المعتمدة من صاحب المنصة (محدّثة في الجولة 38 — قفل باتجاه واحد):
 *  - رقم الكادر التمريضي/الطبيب مخفي عن المستلم الإداري ومشرف الأطباء،
 *    ولا يُفتح إلا بعد سداد نسبة الإدارة وتأكيد الدفع من حساب الإدارة
 *    من تكليف فعلي بين الطرفين (ويُغلق تلقائياً بعد الإنهاء — الجولة 36).
 *  - بيانات اتصال المستلم الإداري ومشرف الأطباء (الجولة 38) لا تُرسل
 *    للكادر التمريضي/الطبيب أبداً تحت أي ظرف: لا قبل السداد ولا بعده،
 *    ولا أثناء سير التكليف ولا بعد إنهائه — الإخفاء مطلق ودائم من الخادم،
 *    ومنح إذن «موثوق جداً» لأحدهما لا يفتح الاتجاه المعاكس إطلاقاً.
 *  - إذن «موثوق جداً» (trustedContactViewer — الجولة 36) يُمنح من حساب
 *    الإدارة حصراً للمستلمين الإداريين ومشرفي الأطباء فيفتح أرقام الكوادر
 *    والأطباء لصاحبه في أي وقت، ويُسحب فورياً (يُقرأ من قاعدة البيانات
 *    مباشرة في كل طلب — لا تخزين مؤقت على الخادم إطلاقاً).
 *  - الإدارة ترى كل الأرقام دائماً دون استثناء.
 *  - الجولة 45 — الاستثناء الوحيد على القفل الاتجاهي: التكليف الساري الذي
 *    لا يحتوي على أي رسوم (عرض بدون رسوم إدارة) يفتح بيانات الاتصال
 *    للطرفين مباشرة أثناء سير التكليف، وتختفي فوراً عند إنهائه/إلغائه
 *    (isAssignmentContactOpen).
 *
 * الإخفاء يتم على مستوى الخادم (API) حصراً — لا يُرسل الرقم الكامل إلى
 * المتصفح أبداً قبل تحقق الشرط، حتى لا يتسرب عبر أدوات المطور.
 */

/**
 * تلميح اتصال المستلم/المشرف المعروض للكادر — الجولة 38:
 * بيانات اتصال الطرف المساند خاصة ولا تُفتح للكادر في أي حال.
 */
export const RECEIVER_CONTACT_LOCKED_HINT =
  'بيانات اتصال المستلم الإداري ومشرف الأطباء خاصة — لا تُعرض للكادر التمريضي والأطباء، وتُدار حصراً من حساب الإدارة'


/** التلميح المعروض في الواجهات عند القفل */
export const PHONE_LOCKED_HINT =
  'يُفتح رقم التواصل بعد سداد نسبة الإدارة أثناء سير التكليف، ويُغلق تلقائياً بعد إنهائه'

/** خطوات الفتح المختصرة — تظهر في السيرة الذاتية والدليل */
export const PHONE_UNLOCK_STEPS = [
  'اعتمد تكليفاً فعلياً مع الكادر',
  'سدد نسبة الإدارة وتؤكدها الإدارة',
  'يُفتح الرقم أثناء سير التكليف ويُغلق تلقائياً بعد إنهائه',
]

/**
 * قناع الرقم — يحفظ أول 3 أرقام وآخر رقمين فقط بصيغة عرض أنيقة
 * مثال: 771234567 → «771 ••• •• 67»
 */
export function maskPhone(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length < 5) return '••• ••• •••'
  return `${digits.slice(0, 3)} ••• •• ${digits.slice(-2)}`
}

/** هل فُتح رقم التواصل في تكليف معين؟ (الجولة 36: مسدد + ساري التقدم — الإنهاء أو الإلغاء يُغلقه) */
export function isAssignmentPhoneOpen(a: {
  paymentStatus: PaymentStatus | string
  status: AssignmentStatus | string
}): boolean {
  return a.paymentStatus === 'PAID' && a.status !== 'CANCELLED' && a.status !== 'COMPLETED'
}

/**
 * قاعدة بيانات الاتصال في التكليف — الجولة 45 (البلاغ الحرفي):
 * «مع عرض بيانات الاتصال في التكليفات التي لا تحتوي على رسوم وتختفي فوراً
 * عند انهاء التكليف من كلا من الكادر التمريضي والطبيب والمستلم الإداري أو
 * مشرف الأطباء»:
 *  - التكليف الساري (RECEIVED/ACTIVE) الذي لا يحتوي على أي رسوم (حصة إدارة
 *    = 0 ولا رسوم تقديم) → بيانات الاتصال مفتوحة للطرفين مباشرة بلا سداد
 *    — هذا هو الاستثناء الوحيد لقفل الجولة 38 الاتجاهي.
 *  - أي تكليف فيه رسوم → يبقى مفتوحاً بالقاعدة السابقة حصراً (سداد + تأكيد).
 *  - الإنهاء أو الإلغاء يُغلق بيانات الاتصال فوراً في كل الحالات.
 */
export function isAssignmentContactOpen(
  a: {
    paymentStatus: PaymentStatus | string
    status: AssignmentStatus | string
    adminFee?: number | null
  },
  applicationFee = 0
): boolean {
  const active = a.status === 'RECEIVED' || a.status === 'ACTIVE'
  if (!active) return false // الإنهاء/الإلغاء يُخفي بيانات الاتصال فوراً
  const feeless = (a.adminFee ?? 0) === 0 && applicationFee === 0
  return a.paymentStatus === 'PAID' || feeless
}

/**
 * هل هذا المشاهد «موثوق جداً» لرؤية بيانات الاتصال؟ (الجولة 36)
 *  - الإدارة: دائماً (الجهة الموثوقة الأعلى)
 *  - مستلم إداري/مشرف أطباء مُنح إذن trustedContactViewer من حساب الإدارة: نعم
 *  - غير ذلك: لا — يُقرأ من قاعدة البيانات مباشرة ليكون المنح/السحب فورياً
 */
export async function isTrustedViewer(userId: string): Promise<boolean> {
  if (!userId) return false
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, trustedContactViewer: true },
  })
  if (!u) return false
  if (u.role === 'ADMIN') return true
  return (
    u.trustedContactViewer === true &&
    (u.role === 'RECEIVER' || u.role === 'DOCTOR_SUPERVISOR')
  )
}

/**
 * معرّفات الكوادر/الأطباء الذين فُتحت أرقامهم لمشاهد معين:
 * استعلام واحد لكل قائمة — تكليفات سارية بين المشاهد وكل كادر:
 *  - مسددة النسبة (القاعدة التاريخية) أو
 *  - بلا أي رسوم (الجولة 45 — عرض بدون رسوم: الاتصال مفتوح أثناء السير)
 * الإعدادات تُجلب هنا مباشرة — في نمط «رسوم التقديم» (applicationFee > 0)
 * لا يُفتح مسار «بلا رسوم» إطلاقاً وتبقى القاعدة السداد حصراً.
 */
export async function revealedStaffIds(
  viewerId: string,
  staffIds: string[],
  trusted = false
): Promise<Set<string>> {
  const ids = staffIds.filter(Boolean)
  if (ids.length === 0) return new Set()
  // الموثوق جداً (الجولة 36) يرى كل الأرقام دون استعلام
  if (trusted) return new Set(ids)
  const applicationFee = calcApplicationFee(await getSettings())
  const rows = await db.assignment.findMany({
    where: {
      receiverId: viewerId,
      nurseId: { in: ids },
      status: { in: ['RECEIVED', 'ACTIVE'] },
      ...(applicationFee > 0
        ? { paymentStatus: 'PAID' as const }
        : {
            OR: [
              { paymentStatus: 'PAID' as const },
              // الجولة 45: تكليفات بلا أي رسوم — adminFee المحفوظ 0 حصراً
              // (null تعني تكليفاً تاريخياً قبل احتساب الحصة — تبقى مقفلة)
              { adminFee: 0 },
            ],
          }),
    },
    select: { nurseId: true },
    distinct: ['nurseId'],
  })
  return new Set(rows.map((r) => r.nurseId))
}

/**
 * شكل رقم الكادر في استجابات الـ API حسب دور المشاهد:
 *  - الإدارة: الرقم الكامل دائماً
 *  - مفتوح (تكليف مسدد): الرقم الكامل + القناع
 *  - مقفل: القناع فقط — لا يُرسل الرقم الكامل إطلاقاً
 */
export function phoneView(
  viewerRole: string,
  phone: string | null | undefined,
  revealed: boolean,
  trusted = false
): { phone: string | null; phoneMasked: string; phoneLocked: boolean } {
  const masked = maskPhone(phone)
  if (viewerRole === 'ADMIN' || trusted) {
    return { phone: phone ?? null, phoneMasked: masked, phoneLocked: false }
  }
  return revealed
    ? { phone: phone ?? null, phoneMasked: masked, phoneLocked: false }
    : { phone: null, phoneMasked: masked, phoneLocked: true }
}

/**
 * رقم المستلم الإداري/مشرف الأطباء كما يراه الكادر التمريضي/الطبيب — الجولة 38:
 * قفل مطلق باتجاه واحد… باستثناء وحيد (الجولة 45): التكليف الساري بلا أي
 * رسوم (عرض بدون رسوم إدارة) — يُرسل الرقم الكامل أثناء سير التكليف فقط،
 * ويُغلق فوراً عند الإنهاء/الإلغاء (isAssignmentContactOpen).
 */
export function receiverPhoneForStaff(phone: string | null | undefined, open = false) {
  return open
    ? { phone: phone ?? null, phoneMasked: maskPhone(phone), phoneLocked: false }
    : { phone: null, phoneMasked: maskPhone(phone), phoneLocked: true }
}
