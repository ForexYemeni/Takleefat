import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError } from '@/lib/api-helpers'
import { AFFILIATION_STATUS_LABELS } from '@/lib/network'

/**
 * GET /api/me/professional-profile — السجل المهني للكادر التمريضي
 * الارتباطات المهنية بكل الجهات وحالاتها + الإحصاءات:
 * التكليفات السابقة، معدل الإنجاز، معدل قبول التقديمات، التقييمات، حالة التوفر.
 */
export async function GET() {
  try {
    const session = await requireRole('NURSE', 'DOCTOR')
    const nurseId = session.user.id

    const [affiliations, workDepartments, assignmentAgg, applicationAgg, ratingsAgg, busy] = await Promise.all([
      db.nurseAffiliation.findMany({
        where: { nurseId },
        orderBy: { createdAt: 'desc' },
        include: {
          hospital: { select: { id: true, name: true, type: true, city: true, status: true } },
        },
      }),
      // أقسام العمل المصرّح بها — تظهر في البطاقة المهنية والسيرة الذاتية
      db.workDepartment.findMany({
        where: { nurseId, department: { isActive: true } },
        orderBy: { createdAt: 'asc' },
        select: { department: { select: { id: true, name: true } } },
      }),
      db.assignment.groupBy({ by: ['status'], where: { nurseId }, _count: true }),
      db.application.groupBy({ by: ['status'], where: { nurseId }, _count: true }),
      db.nurseRating.aggregate({
        where: { nurseId },
        _avg: { overall: true },
        _count: true,
      }),
      db.assignment.findFirst({
        where: { nurseId, status: { in: ['ACTIVE', 'RECEIVED'] } },
        select: { id: true, title: true },
      }),
    ])

    const appStatus = Object.fromEntries(applicationAgg.map((a) => [a.status, a._count]))
    const totalApplications = applicationAgg.reduce((s, a) => s + a._count, 0)
    const approvedApps = appStatus.APPROVED ?? 0
    const assignmentStatus = Object.fromEntries(assignmentAgg.map((a) => [a.status, a._count]))
    const totalAssignments = assignmentAgg.reduce((s, a) => s + a._count, 0)
    const completed = assignmentStatus.COMPLETED ?? 0

    return NextResponse.json({
      workDepartments: workDepartments.map((w) => w.department),
      affiliations: affiliations.map((a) => ({
        id: a.id,
        status: a.status,
        statusLabel: AFFILIATION_STATUS_LABELS[a.status] ?? a.status,
        requestedStatus: a.requestedStatus,
        workYears: a.workYears,
        note: a.note,
        createdAt: a.createdAt,
        hospital: a.hospital,
      })),
      stats: {
        totalAssignments,
        completedAssignments: completed,
        cancelledAssignments: assignmentStatus.CANCELLED ?? 0,
        activeAssignments: (assignmentStatus.ACTIVE ?? 0) + (assignmentStatus.RECEIVED ?? 0),
        completionRate: totalAssignments > 0 ? Math.round((completed / totalAssignments) * 100) : null,
        totalApplications,
        acceptanceRate: totalApplications > 0 ? Math.round((approvedApps / totalApplications) * 100) : null,
        ratingAverage: ratingsAgg._avg.overall ? Number(ratingsAgg._avg.overall.toFixed(2)) : null,
        ratingCount: ratingsAgg._count,
        isAvailable: !busy,
        busyWith: busy?.title ?? null,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
