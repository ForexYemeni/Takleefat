import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError } from '@/lib/api-helpers'
import { OPPORTUNITY_INTERVIEW_MODE_LABELS } from '@/lib/forsah/constants'

/**
 * GET /api/me/opportunities — «فرصي» للكادر/الطبيب (الجولة 66 — المواصفة 23)
 * ============================================================
 * كل ما قدم عليه المستخدم بترتيبه الزمني مع حالة كل طلب (شاهدها/قدم/قيد
 * المراجعة/مرشح للمقابلة/مقابلة مؤكدة/تم اختياري/غير مقبول/منسحب/مغلقة)
 * + دعوات المقابلة التابعة له لعرضها وطلب الرد عليها.
 */
export async function GET(_req: NextRequest) {
  try {
    const session = await requireRole('NURSE', 'DOCTOR')
    const role = session.user.activeRole ?? session.user.role

    const applications = await db.opportunityApplication.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        opportunity: {
          include: {
            hospital: { select: { name: true, location: true } },
            specialty: { select: { name: true } },
            department: { select: { name: true } },
            _count: { select: { applications: true } },
          },
        },
        interviews: {
          orderBy: { scheduledDate: 'asc' },
        },
        selection: { select: { id: true, createdAt: true } },
      },
      take: 100,
    })

    return NextResponse.json({
      applications: applications.map((a) => ({
        id: a.id,
        status: a.status,
        coverNote: a.coverNote,
        createdAt: a.createdAt,
        opportunityClosed: a.opportunity.status === 'CLOSED' || a.opportunity.status === 'ARCHIVED',
        opportunity: {
          id: a.opportunity.id,
          number: a.opportunity.number,
          title: a.opportunity.title,
          status: a.opportunity.status,
          hospitalName: a.opportunity.hospital.name,
          location: a.opportunity.hospital.location,
          audience: a.opportunity.audience,
          specialtyName: a.opportunity.specialty?.name ?? null,
          departmentName: a.opportunity.department?.name ?? null,
          salaryAmount: a.opportunity.salaryAmount,
          salaryType: a.opportunity.salaryType,
          salaryCurrency: a.opportunity.salaryCurrency,
          positionsNeeded: a.opportunity.positionsNeeded,
        },
        selected: !!a.selection,
        interviews: a.interviews.map((i) => ({
          id: i.id,
          scheduledDate: i.scheduledDate,
          scheduledTime: i.scheduledTime,
          mode: i.mode,
          modeLabel: OPPORTUNITY_INTERVIEW_MODE_LABELS[i.mode],
          location: i.location,
          address: i.address,
          mapUrl: i.mapUrl,
          notes: i.notes,
          response: i.response,
        })),
      })),
      viewerRole: role,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
