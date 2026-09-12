import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError } from '@/lib/api-helpers'
import { getSettings } from '@/lib/settings'
import {
  isAssignmentPhoneOpen,
  isTrustedViewer,
  phoneView,
  receiverPhoneForStaff,
} from '@/lib/phone-privacy'

/**
 * GET /api/me/assignments
 * تكليفات المستخدم الحالي (الكادر التمريضي أو المستلم الإداري)
 * تشمل البيانات المالية (القيمة، حصة الإدارة، حالة الدفع).
 *
 * الجولة 35 — القفل التبادلي (lib/phone-privacy):
 *  - المستلم/المشرف: رقم الكادر مقفل حتى تُسدَّد نسبة الإدارة وتأكدها الإدارة
 *    من ذلك التكليف — ويبقى مفتوحاً بعدها (مرتبط بكل تكليف على حدة).
 *  - الكادر/الطبيب: بيانات اتصال المستلم الإداري ومشرف الأطباء مقفلة عنهم
 *    قفلاً مطلقاً (الجولة 38) — القناع فقط في كل الحالات.
 * الجولة 36 — الإنهاء يُغلق + الموثوقون جداً:
 *  - الفتح أثناء سير التكليف المسدد فقط (RECEIVED/ACTIVE) — الإنهاء (COMPLETED)
 *    يُخفي بيانات الاتصال تلقائياً من الطرفين.
 *  - الإدارة دائماً — ومن مُنح إذن «موثوق جداً» من حساب الإدارة يرى كل الأرقام.
 * الجولة 38 — القفل باتجاه واحد:
 *  - بيانات اتصال المستلم الإداري ومشرف الأطباء لا تُرسل للكادر/الطبيب أبداً
 *    تحت أي ظرف (receiverPhoneForStaff = قفل مطلق) — حتى في التكليف الساري
 *    المسدد، وبغضّ النظر عن أي أذونات موثوقية ممنوحة للطرف المساند.
 */
export async function GET() {
  try {
    const session = await requireRole('NURSE', 'RECEIVER', 'DOCTOR', 'DOCTOR_SUPERVISOR')
    // الكادر والطبيب يرَون تكليفاتهم كطرف منفّذ — المستلم والمشرف كطرف مسانِد
    const isWorker =
      session.user.role === 'NURSE' || session.user.role === 'DOCTOR'
    const trusted = await isTrustedViewer(session.user.id)

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
          isAssignmentPhoneOpen(a),
          trusted
        ),
      },
      receiver: {
        ...a.receiver,
        // الجولة 38: قفل مطلق باتجاه واحد — بيانات اتصال المستلم/المشرف لا
        // تُرسل للكادر/الطبيب أبداً (القناع فقط)، وأما المستلم فيرى رقم نفسه
        // عادي دائماً ورقم الكادر بقاعدة السداد
        ...(isWorker
          ? receiverPhoneForStaff(a.receiver.phone)
          : { phone: a.receiver.phone, phoneMasked: a.receiver.phone, phoneLocked: false }),
      },
    }))

    return NextResponse.json({ assignments: shaped, settings })
  } catch (error) {
    return handleApiError(error)
  }
}
