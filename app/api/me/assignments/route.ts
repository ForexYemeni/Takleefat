import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError } from '@/lib/api-helpers'
import { getSettings, calcApplicationFee } from '@/lib/settings'
import { notifyAssignmentStarts } from '@/lib/shift-alerts'
import { resolveReceiverOrgs } from '@/lib/network'
import {
  isAssignmentContactOpen,
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
 * الجولة 45 — العرض بدون رسوم (البلاغ الحرفي):
 *  - «عرض بيانات الاتصال في التكليفات التي لا تحتوي على رسوم وتختفي فوراً عند
 *    انهاء التكليف من كلا الطرفين» — isAssignmentContactOpen: التكليف الساري
 *    بلا أي رسوم يفتح الاتصال للطرفين مباشرة بلا سداد، والإنهاء/الإلغاء
 *    يُغلقه فوراً في كل الحالات — وهذا هو الاستثناء الوحيد لقفل الجولة 38.
 */
export async function GET() {
  try {
    const session = await requireRole('NURSE', 'RECEIVER', 'DOCTOR', 'DOCTOR_SUPERVISOR')
    // الجولة 44: إشعار بداية التكليف (كسول) — التكليفات التي بلغ وقت بدئها
    // ولم يُشعَر أصحابها بعد — يُرسَل الإشعار للطرفين مرة واحدة لكل تكليف
    await notifyAssignmentStarts()
    // الكادر والطبيب يرَون تكليفاتهم كطرف منفّذ — المستلم والمشرف كطرف مسانِد
    const isWorker =
      session.user.role === 'NURSE' || session.user.role === 'DOCTOR'
    const trusted = await isTrustedViewer(session.user.id)

    // الجولة 39: نطاق المشرف — تكليفاته + تكليفات أطباء جهته الصحية
    let where: Prisma.AssignmentWhereInput
    if (isWorker) {
      where = { nurseId: session.user.id }
    } else if (session.user.role === 'DOCTOR_SUPERVISOR') {
      // الجولة 44: أطباء جهاته بكل جهاته المعتمدة
      const orgs = await resolveReceiverOrgs(session.user.id)
      const orgIds = orgs.map((o) => o.id)
      where = {
        OR: [
          { receiverId: session.user.id },
          ...(orgIds.length > 0
            ? [
                {
                  nurse: {
                    role: 'DOCTOR' as const,
                    affiliations: {
                      some: {
                        hospitalId: { in: orgIds },
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
    // الجولة 45: قاعدة الاتصال الموحدة — السداد+التأكيد، أو بلا أي رسوم أثناء السير
    const applicationFee = calcApplicationFee(settings)
    const shaped = assignments.map((a) => ({
      ...a,
      nurse: {
        ...a.nurse,
        ...phoneView(
          session.user.role,
          a.nurse.phone,
          isAssignmentContactOpen(a, applicationFee),
          trusted
        ),
      },
      receiver: {
        ...a.receiver,
        // الجولة 38: قفل باتجاه واحد — الجولة 45: الاستثناء الوحيد هو التكليف
        // الساري بلا أي رسوم (عرض بدون رسوم) — يُفتح للكادر أثناء السير فقط
        // ويُغلق فوراً عند الإنهاء/الإلغاء، وأما المستلم فيرى رقم نفسه دائماً
        ...(isWorker
          ? receiverPhoneForStaff(
              a.receiver.phone,
              isAssignmentContactOpen(a, applicationFee)
            )
          : { phone: a.receiver.phone, phoneMasked: a.receiver.phone, phoneLocked: false }),
      },
    }))

    return NextResponse.json({ assignments: shaped, settings })
  } catch (error) {
    return handleApiError(error)
  }
}
