import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { isTrustedViewer, phoneView, revealedStaffIds } from '@/lib/phone-privacy'
import { resolveReceiverOrgs } from '@/lib/network'

/**
 * GET /api/workforce/[id] — السيرة الذاتية الكاملة لكادر تمريضي أو طبيب
 * ------------------------------------------------------------------
 * الجولة 46 — البلاغ الحرفي:
 * «الكوادر في المنصة تخفى المستندات كاملة معدا انه موثق او لا تظهر مع
 * بقية السيرة ... كوادر جهتي اتمكن من رؤية المستندات عادي جداً»:
 *  - السيرة الذاتية (بقية البيانات) متاحة لكل مستلم إداري/مشرف أطباء —
 *    بلا شرط إذن «رؤية البيانات الكاملة» — والمطابقة الجمهورية باقية:
 *    المستلم → كادر تمريضي | مشرف الأطباء → أطباء.
 *  - الإدارة: ترى كل شيء دائماً.
 *
 * بوابة المستندات (الجولة 45 + 46):
 *  - الإدارة: ترى المستندات دائماً.
 *  - المستلم/المشرف: محتوى المستندات يظهر فقط إذا كان الكادر مرتبطاً بجهة
 *    من جهات المشاهد (ارتباط غير معلق = كوادر جهته) — وإلا فالمحتوى مخفي
 *    مع documentStatuses (نوع + حالة) لعرض شارات: معتمدة/مرفوضة/قيد المراجعة.
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

    // ---------- مطابقة الجمهور (الجولة 46): المستلم → كادر | المشرف → طبيب ----------
    if (session.user.role !== 'ADMIN') {
      const permittedAudience =
        session.user.role === 'DOCTOR_SUPERVISOR' ? 'DOCTOR' : 'NURSE'
      if (target.role !== permittedAudience) {
        return jsonError(
          session.user.role === 'DOCTOR_SUPERVISOR'
            ? 'يمكنك عرض السير الذاتية للأطباء حصراً'
            : 'يمكنك عرض السير الذاتية للكادر التمريضي حصراً',
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
    // الجولة 45: التكليف بلا أي رسوم (عرض بدون رسوم) يفتح الرقم أثناء السير
    // الجولة 46: الإسناد المباشر بلا قيمة وبلا حصة يفتح الرقم أثناء السير أيضاً
    const trusted = await isTrustedViewer(session.user.id)
    let revealed = true
    if (session.user.role !== 'ADMIN' && !trusted) {
      const paid = await revealedStaffIds(session.user.id, [user.id])
      revealed = paid.has(user.id)
    }

    // الجولة 45 — بوابة المستندات: محتوى المستندات لغير الإدارة يظهر فقط
    // إذا كان الكادر مرتبطاً بجهة من جهات المشاهد (ارتباط غير معلق) —
    // وإلا: مستندات مخفية + شارات الحالة (معتمدة/مرفوضة/قيد المراجعة)
    let canSeeDocuments = session.user.role === 'ADMIN'
    if (!canSeeDocuments) {
      const [viewerOrgs, staffOrgIds] = await Promise.all([
        resolveReceiverOrgs(session.user.id),
        db.nurseAffiliation.findMany({
          where: { nurseId: id, status: { not: 'PENDING' } },
          select: { hospitalId: true },
        }),
      ])
      const viewerOrgIds = new Set(viewerOrgs.map((o) => o.id))
      canSeeDocuments = staffOrgIds.some((a) => viewerOrgIds.has(a.hospitalId))
    }
    const visibleDocs = canSeeDocuments ? documents : []
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
      // الجولة 45: المستندات مخفية عن غير نفس الجهة — مع شارات الحالة لكل مستند
      documents: visibleDocs,
      documentsHidden: !canSeeDocuments,
      documentsVerified: approvedDocsCount > 0,
      approvedDocuments: approvedDocsCount,
      documentStatuses: documents.map((d) => ({ type: d.type, status: d.status })),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
