import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError } from '@/lib/api-helpers'
import { getSettings } from '@/lib/settings'
import { isAssignmentPhoneOpen, phoneView } from '@/lib/phone-privacy'

/**
 * GET /api/me/assignments
 * تكليفات المستخدم الحالي (الكادر التمريضي أو المستلم الإداري)
 * تشمل البيانات المالية (القيمة، حصة الإدارة، حالة الدفع).
 *
 * الجولة 35 — القفل التبادلي (lib/phone-privacy):
 *  - المستلم/المشرف: رقم الكادر مقفل حتى تُسدَّد نسبة الإدارة وتأكدها الإدارة
 *    من ذلك التكليف — ويبقى مفتوحاً بعدها (مرتبط بكل تكليف على حدة).
 *  - الكادر/الطبيب: رقم المستلم الإداري مقفل بنفس القاعدة تماماً — يُفتح
 *    بعد تأكيد الإدارة للسداد قبل إنهاء التكليف ليتمكن من التواصل والذهاب
 *    لموقع التكليف.
 */
export async function GET() {
  try {
    const session = await requireRole('NURSE', 'RECEIVER', 'DOCTOR', 'DOCTOR_SUPERVISOR')
    // الكادر والطبيب يرَون تكليفاتهم كطرف منفّذ — المستلم والمشرف كطرف مسانِد
    const isWorker =
      session.user.role === 'NURSE' || session.user.role === 'DOCTOR'

    const [assignments, settings] = await Promise.all([
      db.assignment.findMany({
        where: isWorker ? { nurseId: session.user.id } : { receiverId: session.user.id },
        orderBy: { createdAt: 'desc' },
        include: {
          nurse: { select: { id: true, name: true, specialty: true, phone: true } },
          receiver: { select: { id: true, name: true, phone: true } },
          post: { select: { id: true, title: true } },
          rating: {
            select: { overall: true, comment: true, createdAt: true },
          },
          earning: {
            select: { amount: true, percent: true },
          },
        },
      }),
      getSettings(),
    ])

    // الجولة 34: تطبيق قاعدتي الخصوصية حسب جهة المشاهد
    const shaped = assignments.map((a) => ({
      ...a,
      nurse: {
        ...a.nurse,
        ...phoneView(
          session.user.role,
          a.nurse.phone,
          isAssignmentPhoneOpen(a)
        ),
      },
      receiver: {
        ...a.receiver,
        // الجولة 35 — القفل التبادلي: الكادر يرى رقم المستلم فقط بعد
        // تأكيد الإدارة سداد نسبة هذا التكليف — أما المستلم فيرى رقم نفسه عادي
        ...(isWorker
          ? phoneView(session.user.role, a.receiver.phone, isAssignmentPhoneOpen(a))
          : { phone: a.receiver.phone, phoneMasked: a.receiver.phone, phoneLocked: false }),
      },
    }))

    return NextResponse.json({ assignments: shaped, settings })
  } catch (error) {
    return handleApiError(error)
  }
}
