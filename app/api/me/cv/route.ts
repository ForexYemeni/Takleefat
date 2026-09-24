import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError } from '@/lib/api-helpers'
import { AFFILIATION_STATUS_LABELS } from '@/lib/network'
import { profilePhotoUrl } from '@/lib/document-access'

/**
 * الجولة 74 — السيرة الذاتية الكاملة لصاحب الحساب (إضافي بحت كلياً)
 * ====================================================================
 * GET /api/me/cv — للكادر الصحي والطبيب: تجميع كل ما يعرض في «سيرتي الذاتية»
 * من مصادرها الحية حصراً (لا نسخ بيانات): الملف الأساسي، أقسام/تخصصات العمل،
 * السجل المهني بجهات العمل، التقييمات بأبعادها الأربعة وأحدثها، إحصاءات
 * التكليفات والتقديمات، وحالة التوفر — لتُعرض في البطاقة المهنية بشكل احترافي.
 * الخصوصية: بيانات صاحبها فقط — لا هاتف ولا مستندات هنا (هناك مساراتها الخاصة).
 */
export async function GET() {
  try {
    const session = await requireRole('NURSE', 'DOCTOR')
    const meId = session.user.id

    const [user, workDepartments, workSpecialties, affiliations, ratingsAgg, recentRatings, assignmentAgg, applicationAgg, busy] =
      await Promise.all([
        db.user.findUnique({
          where: { id: meId },
          select: {
            name: true,
            role: true,
            status: true,
            gender: true,
            specialty: true,
            qualification: true,
            yearsOfExperience: true,
            createdAt: true,
            profilePhotoBlobId: true,
          },
        }),
        db.workDepartment.findMany({
          where: { nurseId: meId, department: { isActive: true } },
          orderBy: { createdAt: 'asc' },
          select: { department: { select: { name: true } } },
        }),
        db.doctorSpecialty.findMany({
          where: { doctorId: meId, specialty: { isActive: true } },
          orderBy: { createdAt: 'asc' },
          select: { specialty: { select: { name: true } } },
        }),
        db.nurseAffiliation.findMany({
          where: { nurseId: meId },
          orderBy: { createdAt: 'desc' },
          select: {
            status: true,
            workYears: true,
            createdAt: true,
            hospital: { select: { name: true, type: true, city: true } },
          },
        }),
        db.nurseRating.aggregate({
          where: { nurseId: meId },
          _avg: { overall: true, punctuality: true, quality: true, communication: true, discipline: true },
          _count: true,
        }),
        db.nurseRating.findMany({
          where: { nurseId: meId },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            overall: true,
            comment: true,
            createdAt: true,
            receiver: { select: { name: true } },
            assignment: { select: { title: true } },
          },
        }),
        db.assignment.groupBy({ by: ['status'], where: { nurseId: meId }, _count: true }),
        db.application.groupBy({ by: ['status'], where: { nurseId: meId }, _count: true }),
        db.assignment.findFirst({
          where: { nurseId: meId, status: { in: ['ACTIVE', 'RECEIVED'] } },
          select: { title: true },
        }),
      ])

    if (!user) return handleApiError(new Error('الحساب غير موجود'))

    const assignmentStatus = Object.fromEntries(assignmentAgg.map((a) => [a.status, a._count]))
    const totalAssignments = assignmentAgg.reduce((s, a) => s + a._count, 0)
    const completed = assignmentStatus.COMPLETED ?? 0
    const appStatus = Object.fromEntries(applicationAgg.map((a) => [a.status, a._count]))
    const totalApplications = applicationAgg.reduce((s, a) => s + a._count, 0)

    return NextResponse.json({
      cv: {
        name: user.name,
        role: user.role,
        status: user.status,
        gender: user.gender,
        specialty: user.specialty,
        qualification: user.qualification,
        yearsOfExperience: user.yearsOfExperience,
        photoUrl: profilePhotoUrl(user.profilePhotoBlobId),
        memberSince: user.createdAt,
        generatedAt: new Date().toISOString(),
        workDepartments: workDepartments.map((w) => w.department.name),
        workSpecialties: workSpecialties.map((w) => w.specialty.name),
        affiliations: affiliations.map((a) => ({
          status: a.status,
          statusLabel: AFFILIATION_STATUS_LABELS[a.status] ?? a.status,
          workYears: a.workYears,
          createdAt: a.createdAt,
          hospital: a.hospital,
        })),
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
        stats: {
          totalAssignments,
          completedAssignments: completed,
          completionRate: totalAssignments > 0 ? Math.round((completed / totalAssignments) * 100) : null,
          totalApplications,
          acceptanceRate:
            totalApplications > 0 ? Math.round(((appStatus.APPROVED ?? 0) / totalApplications) * 100) : null,
          isAvailable: !busy,
          busyWith: busy?.title ?? null,
        },
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
