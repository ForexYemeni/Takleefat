import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError } from '@/lib/api-helpers'
import { getSettings } from '@/lib/settings'
import { isAssignmentPhoneOpen, phoneView, receiverPhoneHiddenFromStaff } from '@/lib/phone-privacy'

/**
 * GET /api/me/assignments
 * تكليفات المستخدم الحالي (الكادر التمريضي أو المستلم الإداري)
 * تشمل البيانات المالية (القيمة، حصة الإدارة، حالة الدفع).
 *
 * الجولة 34 — خصوصية أرقام التواصل (lib/phone-privacy):
 *  - الكادر/الطبيب: لا يرى رقم المستلم الإداري إطلاقاً (قاعدة دائمة).
 *  - المستلم/المشرف: رقم الكادر مقفل حتى يُسدَّد نسبة الإدارة من ذلك التكليف —
 *    ويبقى مفتوحاً بعدها (مرتبط بكل تكليف على حدة).
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
        // الكادر لا يرى رقم المستلم إطلاقاً — أما المستلم فيرى رقم نفسه عادي
        ...(isWorker
          ? receiverPhoneHiddenFromStaff(a.receiver.phone)
          : { phone: a.receiver.phone, phoneMasked: a.receiver.phone, phoneLocked: false }),
      },
    }))

    return NextResponse.json({ assignments: shaped, settings })
  } catch (error) {
    return handleApiError(error)
  }
}
