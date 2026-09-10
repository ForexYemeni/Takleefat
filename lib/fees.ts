import { db } from '@/lib/db'
import { getSettings, calcAdminFee, type PlatformSettings } from '@/lib/settings'
import { formatCurrency } from '@/lib/utils'

/**
 * تسوية وتوزيع رسوم التكليف — تكليفات | Takleefat
 *
 * سابقاً كان ربح المستلم الإداري يُحتسب في مسار واحد فقط (إنهاء المستلم عبر receiver-complete)،
 * وعندما تُنهي الإدارة التكليف بتأكيد الدفع مباشرة — دون إنهاء من الكادر أو المستلم —
 * لا تُوزَّع الرسوم أبداً. هذه الوحدة تُوحِّد الاحتساب وتسمح بأي مسار إنهاء:
 *   1) تأكيد دفع الرسوم من الإدارة (PATCH paymentStatus = PAID)
 *   2) إنهاء التكليف من الإدارة (status = COMPLETED)
 *   3) إنهاء المستلم الإداري (receiver-complete)
 *   4) إعادة احتساب يدوية من الإدارة (زر «إعادة احتساب وتوزيع الرسوم»)
 * كل المسارات آمنة للاستدعاء المتكرر (upsert على سجل وحيد لكل تكليف) — لا تكرار ولا ازدواج.
 */

/** حصة المستلم الإداري من قيمة التكليف — صفر عند غياب القيمة أو النسبة */
export function calcReceiverEarning(
  value: number | null | undefined,
  sharePercent: number
): number {
  return sharePercent > 0 && value != null && value > 0
    ? Math.round((value * sharePercent) / 100)
    : 0
}

export interface FeeSettlement {
  /** مبلغ ربح المستلم الإداري المحتسب (0 إن لم تستوفِ الشروط) */
  earningAmount: number
  /** النسبة المئوية لحظة الاحتساب */
  sharePercent: number
  /** حصة الإدارة بعد التسوية (تُعبأ إن كانت مفقودة لتكليف له قيمة) */
  adminFee: number | null
  /** هل عُبئت حصة الإدارة الناقصة في هذه التسوية؟ */
  adminFeeBackfilled: boolean
  /** هل أُنشئ سجل ربح جديد في هذه التسوية؟ (لا: كان موجوداً وحُدِّث فقط) */
  earningCreated: boolean
}

/**
 * تسوية رسوم تكليف واحد:
 *  - يحتسب ربح المستلم الإداري (نسبة من قيمة التكليف) وينشئ/يحدّث سجل ReceiverEarning
 *  - يُعبئ حصة الإدارة الناقصة (adminFee) لتكليفات قديمة أُنشئت قبل احتساب الحصة
 * تُرجع null إذا لم يوجد التكليف.
 */
export async function settleAssignmentFees(assignmentId: string): Promise<FeeSettlement | null> {
  const assignment = await db.assignment.findUnique({
    where: { id: assignmentId },
    include: { earning: true },
  })
  if (!assignment) return null

  const settings: PlatformSettings = await getSettings()
  const sharePercent = settings.receiverSharePercent
  const earningAmount = calcReceiverEarning(assignment.value, sharePercent)

  // حصة الإدارة — تُحتسب عند الغياب فقط (لا نغيّر قيماً محسوبة سابقاً)
  const adminFee =
    assignment.adminFee != null
      ? assignment.adminFee
      : assignment.value != null && assignment.value > 0
        ? calcAdminFee(assignment.value, settings)
        : null

  const adminFeeBackfilled = adminFee != null && assignment.adminFee == null
  const earningCreated = !assignment.earning && earningAmount > 0

  await db.$transaction([
    ...(adminFeeBackfilled
      ? [db.assignment.update({ where: { id: assignmentId }, data: { adminFee } })]
      : []),
    ...(earningAmount > 0
      ? [
          db.receiverEarning.upsert({
            where: { assignmentId },
            update: { amount: earningAmount, percent: sharePercent },
            create: {
              assignmentId,
              receiverId: assignment.receiverId,
              amount: earningAmount,
              percent: sharePercent,
            },
          }),
        ]
      : []),
  ])

  return { earningAmount, sharePercent, adminFee, adminFeeBackfilled, earningCreated }
}

/** وصف نصي موحد لنتيجة التسوية — يُستخدم في السجلات والرسوم والرسائل */
export function settlementNote(settlement: FeeSettlement, assignmentValue: number | null): string {
  if (settlement.earningAmount > 0) {
    return `تم توزيع رسوم التكليف — ربح المستلم الإداري: ${formatCurrency(settlement.earningAmount)} (${settlement.sharePercent}٪ من ${formatCurrency(assignmentValue ?? 0)})${settlement.adminFeeBackfilled ? ' — وعُبئت حصة الإدارة الناقصة' : ''}`
  }
  return settlement.adminFeeBackfilled
    ? `عُبئت حصة الإدارة الناقصة: ${formatCurrency(settlement.adminFee ?? 0)}`
    : ''
}
