import type { AssignmentStatus, PaymentStatus } from '@prisma/client'
import { db } from '@/lib/db'

/**
 * خصوصية أرقام تواصل الكادر — الجولتان 34 و35
 * =====================================================================
 * القاعدة المعتمدة من صاحب المنصة (محدّثة في الجولة 35 — قفل تبادلي):
 *  - رقم الكادر التمريضي/الطبيب مخفي عن المستلم الإداري ومشرف الأطباء،
 *    ولا يُفتح إلا بعد سداد نسبة الإدارة وتأكيد الدفع من حساب الإدارة
 *    من تكليف فعلي بين الطرفين.
 *  - رقم المستلم الإداري مخفي عن الكادر التمريضي/الطبيب بنفس القاعدة
 *    تماماً: يُفتح للكادر بعد تأكيد الإدارة سداد نسبة الإدارة من تكليفهم
 *    المشترك — قبل إنهاء التكليف — ليتمكن الكادر من التواصل والذهاب
 *    لموقع التكليف (القفل تبادلي وليس دائماً باتجاه واحد).
 *  - كل تكليف يُسدَّد يفتح الرقمين للطرفين ويبقى مفتوحاً بعدها
 *    (مرتبط بكل تكليف على حدة).
 *  - الإدارة ترى كل الأرقام دائماً دون استثناء.
 *
 * الإخفاء يتم على مستوى الخادم (API) حصراً — لا يُرسل الرقم الكامل إلى
 * المتصفح أبداً قبل تحقق الشرط، حتى لا يتسرب عبر أدوات المطور.
 */

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
 * استعلام واحد لكل قائمة — تكليفات غير ملغاة مسددة النسبة بين المشاهد وكل كادر.
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
  const rows = await db.assignment.findMany({
    where: {
      receiverId: viewerId,
      nurseId: { in: ids },
      paymentStatus: 'PAID',
      status: { in: ['RECEIVED', 'ACTIVE'] },
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
 * معرّفات المستلمين الإداريين الذين فُتحت أرقامهم لكادر/طبيب معين:
 * استعلام واحد لكل قائمة — تكليفات غير ملغاة مسددة النسبة بين الكادر وكل مستلم.
 * (الجولة 35 — القفل التبادلي: نفس قاعدة revealedStaffIds بالاتجاه المعاكس)
 */
export async function revealedReceiverIds(
  workerId: string,
  receiverIds: string[],
  trusted = false
): Promise<Set<string>> {
  const ids = receiverIds.filter(Boolean)
  if (ids.length === 0) return new Set()
  // الموثوق جداً (الجولة 36) يرى كل الأرقام دون استعلام
  if (trusted) return new Set(ids)
  const rows = await db.assignment.findMany({
    where: {
      nurseId: workerId,
      receiverId: { in: ids },
      paymentStatus: 'PAID',
      status: { in: ['RECEIVED', 'ACTIVE'] },
    },
    select: { receiverId: true },
    distinct: ['receiverId'],
  })
  return new Set(rows.map((r) => r.receiverId))
}

/**
 * رقم المستلم الإداري كما يراه الكادر التمريضي/الطبيب — الجولة 35 (قفل تبادلي):
 *  - مفتوح (تكليف مشترك مسدد النسبة أكده الإدارة): الرقم الكامل
 *  - مقفل (لا تكليف مسدد بينهما بعد): القناع فقط — لا يُرسل الرقم الكامل إطلاقاً
 */
export function receiverPhoneForStaff(
  phone: string | null | undefined,
  revealed: boolean,
  trusted = false
) {
  return phoneView('NURSE', phone, revealed, trusted)
}
