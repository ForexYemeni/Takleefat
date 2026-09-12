import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { isTrustedViewer, phoneView, revealedStaffIds } from '@/lib/phone-privacy'
import { resolveReceiverOrgs } from '@/lib/network'

/**
 * GET /api/workforce/[id] — السيرة الذاتية الكاملة لكادر تمريضي أو طبيب — الجولة 32
 * ------------------------------------------------------------------
 * أذونات صارمة يفتحها حساب الإدارة حصراً (User.fullProfileAccess):
 *  - الإدارة: ترى ملف أي كادر/طبيب كاملاً (للمراجعة)
 *  - المستلم الإداري الحاصل على الإذن: السيرة الكاملة لأي كادر تمريضي
 *  - مشرف الأطباء الحاصل على الإذن: السيرة الكاملة لأي طبيب
 *  - بدون الإذن: 403 — البيانات الكاملة تبقى مقتصرة على أصحاب التكليفات
 *    (المتقدمون على تكليفاتهم) كما كانت.
 *
 * الاستجابة: البيانات المهنية الكاملة + المستندات + أقسام/تخصصات العمل +
 * السجل المهني (الارتباطات المعتمدة) + ملخص التقييمات الاحترافية.
 * الجولة 34: رقم التواصل مخفي عن المستلم/المشرف ما لم يوجد تكليف مسدد النسبة
 * بين الطرفين — الإدارة ترى الرقم دائماً (lib/phone-privacy).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('ADMIN', 'RECEIVER', 'DOCTOR_SUPERVISOR')
    const { id } = await params

    const target = await db.user.findUnique({
      where: { id },
      select: { id: true, role: true, status: true },
    })
    if (!target || (target.role !== 'NURSE' && target.role !== 'DOCTOR')) {
      return jsonError('الحساب المطلوب ليس كادراً تمريضياً أو طبيباً', 404)
    }

    // ---------- بوابة الإذن (الجولة 32) + استثناء الجهة نفسها (الجولة 44) ----------
    let fullProfileAccess = false
    let sameOrg = false
    if (session.user.role !== 'ADMIN') {
      const me = await db.user.findUnique({
        where: { id: session.user.id },
        select: { fullProfileAccess: true, role: true },
      })
      fullProfileAccess = me?.fullProfileAccess ?? false
      const permittedAudience =
        session.user.role === 'DOCTOR_SUPERVISOR' ? 'DOCTOR' : 'NURSE'
      if (!fullProfileAccess && target.role === permittedAudience) {
        // الجولة 44: «لا تعرض إلا اذا كان الكادر يعمل بنفس الجهة» — المسؤول يرى
        // السيرة الكاملة لمن يعمل في جهته (ارتباط معتمد غير معلق) حتى بلا إذن الإدارة
        const orgs = await resolveReceiverOrgs(session.user.id)
        if (orgs.length > 0) {
          const link = await db.nurseAffiliation.findFirst({
            where: {
              nurseId: id,
              hospitalId: { in: orgs.map((o) => o.id) },
              status: { not: 'PENDING' },
            },
            select: { id: true },
          })
          sameOrg = !!link
        }
      }
      if (!fullProfileAccess && !sameOrg) {
        return jsonError(
          session.user.role === 'DOCTOR_SUPERVISOR'
            ? 'رؤية السيرة الذاتية الكاملة للأطباء متاحة لمن يعمل في جهتك أو لمن مُنح إذن «البيانات الكاملة» من الإدارة'
            : 'رؤية السيرة الذاتية الكاملة للكوادر متاحة لمن يعمل في جهتك أو لمن مُنح إذن «البيانات الكاملة» من الإدارة',
          403
        )
      }
    }

    const [user, documents, ratingsAgg, recentRatings, assignmentsCount] = await Promise.all([
      db.user.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          phone: true,
          gender: true,
          role: true,
          status: true,
          specialty: true,
          qualification: true,
          yearsOfExperience: true,
          createdAt: true,
          // أقسام عمل الكادر (ممرض طوارئ/رقود/عناية/مختبر...)
          workDepartments: {
            select: { department: { select: { id: true, name: true } } },
          },
          // تخصصات عمل الطبيب (منظومة الأطباء)
          workSpecialties: {
            select: { specialty: { select: { id: true, name: true } } },
          },
          // السجل المهني المعتمد — الطلبات قيد المراجعة مستثناة
          affiliations: {
            where: { status: { not: 'PENDING' } },
            orderBy: { createdAt: 'desc' },
            select: {
              status: true,
              workYears: true,
              createdAt: true,
              hospital: { select: { name: true, type: true, city: true } },
            },
          },
        },
      }),
      db.document.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          type: true,
          title: true,
          fileUrl: true,
          fileName: true,
          fileSize: true,
          mimeType: true,
          status: true,
          createdAt: true,
        },
      }),
      db.nurseRating.aggregate({
        where: { nurseId: id },
        _avg: { overall: true, punctuality: true, quality: true, communication: true, discipline: true },
        _count: true,
      }),
      db.nurseRating.findMany({
        where: { nurseId: id },
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: {
          id: true,
          overall: true,
          comment: true,
          createdAt: true,
          receiver: { select: { name: true } },
          assignment: { select: { title: true } },
        },
      }),
      db.assignment.count({ where: { nurseId: id } }),
    ])

    if (!user) return jsonError('الحساب غير موجود', 404)

    // الجولة 34: فتح رقم التواصل حسب قاعدة السداد — الإدارة ترى دائماً
    // الجولة 36: «الموثوق جداً» يرى الرقم دائماً حتى بعد إنهاء التكليفات
    const trusted = await isTrustedViewer(session.user.id)
    let revealed = true
    if (session.user.role !== 'ADMIN' && !trusted) {
      const paid = await revealedStaffIds(session.user.id, [user.id])
      revealed = paid.has(user.id)
    }

    // الجولة 44: المستندات تُعرض للإدارة، وللمسؤول عن جهة يعمل الكادر بها،
    // ولمن مُنح إذن «البيانات الكاملة» — وغير ذلك تُخفى مع حالة التحقق
    const canSeeDocuments =
      session.user.role === 'ADMIN' || fullProfileAccess || sameOrg
    const approvedDocsCount = documents.filter((d) => d.status === 'APPROVED').length

    return NextResponse.json({
      profile: {
        ...user,
        ...phoneView(session.user.role, user.phone, revealed, trusted),
        workDepartments: user.workDepartments.map((w) => w.department.name),
        workSpecialties: user.workSpecialties.map((w) => w.specialty.name),
        assignmentsCount,
        ratings: {
          average: ratingsAgg._avg.overall ? Number(ratingsAgg._avg.overall.toFixed(2)) : null,
          count: ratingsAgg._count,
          axes: {
            punctuality: ratingsAgg._avg.punctuality ? Number(ratingsAgg._avg.punctuality.toFixed(2)) : null,
            quality: ratingsAgg._avg.quality ? Number(ratingsAgg._avg.quality.toFixed(2)) : null,
            communication: ratingsAgg._avg.communication ? Number(ratingsAgg._avg.communication.toFixed(2)) : null,
            discipline: ratingsAgg._avg.discipline ? Number(ratingsAgg._avg.discipline.toFixed(2)) : null,
          },
          latest: recentRatings.map((r) => ({
            overall: r.overall,
            comment: r.comment,
            createdAt: r.createdAt,
            receiverName: r.receiver.name,
            assignmentTitle: r.assignment.title,
          })),
        },
      },
      // الجولة 44: المستندات مخفية عن غير أهلها — تُرسل حالة التحقق فقط
      documents: canSeeDocuments
        ? documents
        : [],
      documentsHidden: !canSeeDocuments,
      documentsVerified: approvedDocsCount > 0,
      approvedDocuments: approvedDocsCount,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
