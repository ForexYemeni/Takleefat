import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError } from '@/lib/api-helpers'
import { getSettings } from '@/lib/settings'
import { resolveReceiverOrg } from '@/lib/network'
import {
  isAssignmentPhoneOpen,
  isTrustedViewer,
  phoneView,
  receiverPhoneForStaff,
} from '@/lib/phone-privacy'
import type { Prisma, AffiliationStatus } from '@prisma/client'

/** حالات الارتباط الساري التي تربط الطبيب بجهة المشرف (الجولة 39) */
const ACTIVE_AFFILIATION_STATUSES: AffiliationStatus[] = ['WORKING', 'ENDORSED']

/**
 * GET /api/me/assignments
 * تكليفات المستخدم الحالي (الكادر التمريضي أو المستلم الإداري أو مشرف الأطباء)
 * تشمل البيانات المالية (القيمة، حصة الإدارة، حالة الدفع).
 *
 * الجولة 39 — نطاق مشرف الأطباء:
 *  - تكليفاته هو (هو الطرف المساند فيها) + تكليفات أطباء جهته الصحية
 *    (ارتباط ساري: يعمل حالياً/معتمد) — ليتمكن من إنهائها وتقييم أطباء
 *    جهته حتى لو أُغلق التكليف من حساب الطبيب أو أُنشئ لمستلم آخر.
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

    // الجولة 39: نطاق المشرف — تكليفاته + تكليفات أطباء جهته الصحية
    let where: Prisma.AssignmentWhereInput
    if (isWorker) {
      where = { nurseId: session.user.id }
    } else if (session.user.role === 'DOCTOR_SUPERVISOR') {
      const org = await resolveReceiverOrg(session.user.id)
      where = {
        OR: [
          { receiverId: session.user.id },
          ...(org
            ? [
                {
                  nurse: {
                    role: 'DOCTOR' as const,
                    affiliations: {
                      some: {
                        hospitalId: org.id,
                        status: { in: ACTIVE_AFFILIATION_STATUSES },
                      },
                    },
                  },
                },
              ]
            : []),
        ],
      }
    } else {
      where = { receiverId: session.user.id }
    }

    const [assignments, settings] = await Promise.all([
      db.assignment.findMany({
        where,
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
