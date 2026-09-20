import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError, ApiError } from '@/lib/api-helpers'
import { OPPORTUNITY_INTERVIEW_RESPONSE_LABELS, FORSAH_MESSAGES } from '@/lib/forsah/constants'
import { logForsahAudit } from '@/lib/forsah/audit'
import { rateLimit } from '@/lib/rate-limit'
import { notify } from '@/lib/notifications'
import { assertForsahEnabled } from '@/lib/forsah/server'

/**
 * POST /api/opportunities/interviews/[id]/respond — رد المرشح على دعوة المقابلة
 * (المواصفة 12: «تأكيد الحضور» و«عدم الحضور») — الجولة 66
 * المرشح يرد على دعوته هو فقط؛ الرد يحدّث حالة الطلب (مؤكدة) ويُشعر HR.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('NURSE', 'DOCTOR')
    const { id } = await params
    const role = session.user.activeRole ?? session.user.role
    // الجولة 67: الإغلاق الكلي — الإدارة مستثناة (يعيد التشغيل من لوحته)
    await assertForsahEnabled(role)

    if (!rateLimit(`forsah:respond:${session.user.id}`, 20, 10 * 60 * 1000)) {
      return jsonError('محاولات كثيرة — انتظر قليلاً', 429)
    }

    const body = await req.json().catch(() => ({}))
    const response = String(body?.response ?? '')
    if (!['CONFIRMED', 'DECLINED'].includes(response)) {
      return jsonError('اختر «تأكيد الحضور» أو «عدم الحضور»', 422)
    }

    const interview = await db.opportunityInterview.findUnique({
      where: { id },
      include: {
        opportunity: {
          select: { id: true, title: true, status: true, createdById: true },
        },
      },
    })
    if (!interview) throw new ApiError('دعوة المقابلة غير موجودة', 404)
    if (interview.candidateId !== session.user.id) {
      throw new ApiError('هذه الدعوة ليست لك', 403)
    }
    if (interview.response !== 'PENDING') {
      return jsonError(`سبق أن ردّيت على هذه الدعوة (${OPPORTUNITY_INTERVIEW_RESPONSE_LABELS[interview.response]})`, 409)
    }
    if (interview.opportunity.status === 'CLOSED' || interview.opportunity.status === 'ARCHIVED') {
      return jsonError(FORSAH_MESSAGES.CLOSED_APPLY_BLOCK, 403)
    }

    const updated = await db.opportunityInterview.update({
      where: { id },
      data: { response: response as 'CONFIRMED' | 'DECLINED', respondedAt: new Date() },
      select: { id: true, response: true },
    })

    // تأكيد الحضور يرفع حالة الطلب إلى «مقابلة مؤكدة» — الاعتذار يُبقي مرحلة الترشيح
    if (response === 'CONFIRMED') {
      await db.opportunityApplication.update({
        where: { id: interview.applicationId },
        data: { status: 'INTERVIEW_CONFIRMED' },
      })
    }

    await logForsahAudit({
      actorId: session.user.id,
      actorRole: role,
      action: 'INTERVIEW_RESPONDED',
      entityType: 'Interview',
      entityId: id,
      meta: { response },
    })

    await notify(interview.opportunity.createdById, {
      title: response === 'CONFIRMED' ? 'أكّد مرشح حضور المقابلة' : 'اعتذر مرشح عن حضور المقابلة',
      body: `«${interview.opportunity.title}» — ${OPPORTUNITY_INTERVIEW_RESPONSE_LABELS[response as 'CONFIRMED' | 'DECLINED']}`,
      type: response === 'CONFIRMED' ? 'OPPORTUNITY_INTERVIEW_CONFIRMED' : 'OPPORTUNITY_INTERVIEW_DECLINED',
      link: `/hr/opportunities/${interview.opportunity.id}`,
    })

    return NextResponse.json({
      message: response === 'CONFIRMED' ? 'أكدت حضورك — حظاً موفقاً' : 'سجلنا اعتذارك عن الحضور',
      interview: updated,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
