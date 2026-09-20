import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError } from '@/lib/api-helpers'
import { requireForsahPermission } from '@/lib/forsah/server'

/**
 * GET /api/forsah/dashboard — إحصائيات لوحة HR (الجولة 66 — المواصفة 4)
 * ============================================================
 * الإحصائيات العشر المطلوبة: إجمالي الفرص / المنشورة / النشطة / المغلقة /
 * المتقدمون / المرشحون للمقابلات / المقابلات القادمة / المختارون /
 * إجمالي الرسوم / مستحقات HR — كلها من فرص HR هو حصراً.
 * الإدارة تستدعي نفس المسار فترى الإجماليات الكلية.
 */
export async function GET(_req: NextRequest) {
  try {
    const session = await requireRole('HR', 'ADMIN')
    const actor = await requireForsahPermission(session, 'opportunity.view')
    const scope = actor.role === 'ADMIN' ? {} : { createdById: actor.id }

    const [
      totalOpportunities,
      published,
      active,
      paused,
      closed,
      totalApplications,
      interviewInvited,
      upcomingInterviews,
      selections,
      txAggregate,
      pendingApplications,
    ] = await Promise.all([
      db.opportunity.count({ where: scope }),
      db.opportunity.count({ where: { ...scope, status: 'PUBLISHED' } }),
      db.opportunity.count({ where: { ...scope, status: 'ACTIVE' } }),
      db.opportunity.count({ where: { ...scope, status: 'PAUSED' } }),
      db.opportunity.count({ where: { ...scope, status: 'CLOSED' } }),
      db.opportunityApplication.count({ where: { opportunity: scope } }),
      db.opportunityApplication.count({
        where: { opportunity: scope, status: { in: ['INTERVIEW_INVITED', 'INTERVIEW_CONFIRMED'] } },
      }),
      db.opportunityInterview.count({
        where: { opportunity: scope, scheduledDate: { gte: new Date() } },
      }),
      db.opportunitySelection.count({ where: { opportunity: scope } }),
      db.opportunityTransaction.aggregate({
        where: { opportunity: scope },
        _sum: { feeAmount: true, hrCommissionAmount: true, adminAmount: true },
      }),
      db.opportunityApplication.count({
        where: { opportunity: scope, status: 'PENDING' },
      }),
    ])

    // مقابلات اليوم — للعرض السريع
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date(todayStart)
    todayEnd.setDate(todayEnd.getDate() + 1)
    const todayInterviews = await db.opportunityInterview.count({
      where: { opportunity: scope, scheduledDate: { gte: todayStart, lt: todayEnd } },
    })

    return NextResponse.json({
      stats: {
        totalOpportunities,
        published,
        active,
        paused,
        closed,
        totalApplications,
        pendingApplications,
        interviewInvited,
        upcomingInterviews,
        todayInterviews,
        selections,
        totalFees: txAggregate._sum.feeAmount ?? 0,
        hrCommission: txAggregate._sum.hrCommissionAmount ?? 0,
        adminAmount: txAggregate._sum.adminAmount ?? 0,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
