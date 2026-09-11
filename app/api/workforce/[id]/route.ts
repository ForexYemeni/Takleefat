import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'

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

    // ---------- بوابة الإذن ----------
    if (session.user.role !== 'ADMIN') {
      const me = await db.user.findUnique({
        where: { id: session.user.id },
        select: { fullProfileAccess: true, role: true },
      })
      const permittedAudience =
        session.user.role === 'DOCTOR_SUPERVISOR'
          ? 'DOCTOR' // مشرف الأطباء → أطباء
          : 'NURSE' // المستلم الإداري → كادر تمريضي
      if (!me?.fullProfileAccess || target.role !== permittedAudience) {
        return jsonError(
          session.user.role === 'DOCTOR_SUPERVISOR'
            ? 'رؤية السيرة الذاتية الكاملة للأطباء إذن يفتحه حساب الإدارة — راجع الإدارة لمنحك هذا الإذن'
            : 'رؤية السيرة الذاتية الكاملة للكوادر إذن يفتحه حساب الإدارة — راجع الإدارة لمنحك هذا الإذن',
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

    return NextResponse.json({
      profile: {
        ...user,
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
      documents,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
