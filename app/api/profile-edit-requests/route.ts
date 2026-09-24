import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError } from '@/lib/api-helpers'
import { profilePhotoUrl } from '@/lib/document-access'

/**
 * الجولة 74 — مراجعة طلبات تعديل الملف المهني (إضافي بحت كلياً)
 * ================================================================
 * GET /api/profile-edit-requests — قائمة الطلبات للإدارة والموارد البشرية
 *      (قيد المراجعة أولاً ثم الأحدث) مع بيانات الطالب وقيمه الحالية
 *      — الرقم مقنّع: المراجعة لا تحتاج الاتصال المباشر هنا.
 */
export async function GET() {
  try {
    await requireRole('ADMIN', 'HR')

    const [requests, pendingCount] = await Promise.all([
      db.profileEditRequest.findMany({
        orderBy: [{ createdAt: 'desc' }],
        take: 100,
        select: {
          id: true,
          status: true,
          requestedSpecialty: true,
          requestedQualification: true,
          requestedYearsOfExperience: true,
          note: true,
          reviewNote: true,
          reviewedAt: true,
          createdAt: true,
          reviewer: { select: { name: true } },
          user: {
            select: {
              id: true,
              name: true,
              phone: true,
              role: true,
              gender: true,
              status: true,
              specialty: true,
              qualification: true,
              yearsOfExperience: true,
              profilePhotoBlobId: true,
              createdAt: true,
              _count: { select: { assignments: true, applications: true } },
            },
          },
        },
      }),
      db.profileEditRequest.count({ where: { status: 'PENDING' } }),
    ])

    const maskedPhone = (phone: string) =>
      phone.length < 4 ? '****' : `${phone.slice(0, 4)}••••${phone.slice(-2)}`

    return NextResponse.json({
      pendingCount,
      requests: requests.map((r) => ({
        id: r.id,
        status: r.status,
        requestedSpecialty: r.requestedSpecialty,
        requestedQualification: r.requestedQualification,
        requestedYearsOfExperience: r.requestedYearsOfExperience,
        note: r.note,
        reviewNote: r.reviewNote,
        reviewedAt: r.reviewedAt,
        createdAt: r.createdAt,
        reviewerName: r.reviewer?.name ?? null,
        applicant: {
          id: r.user.id,
          name: r.user.name,
          phoneMasked: maskedPhone(r.user.phone),
          role: r.user.role,
          gender: r.user.gender,
          accountStatus: r.user.status,
          specialty: r.user.specialty,
          qualification: r.user.qualification,
          yearsOfExperience: r.user.yearsOfExperience,
          photoUrl: profilePhotoUrl(r.user.profilePhotoBlobId),
          memberSince: r.user.createdAt,
          assignmentsCount: r.user._count.assignments,
          applicationsCount: r.user._count.applications,
        },
      })),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
