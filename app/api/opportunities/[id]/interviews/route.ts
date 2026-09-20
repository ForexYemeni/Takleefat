import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError, ApiError } from '@/lib/api-helpers'
import { forsahInterviewSchema } from '@/lib/validations/forsah'
import { requireForsahPermission, assertOpportunityOwnership } from '@/lib/forsah/server'
import { OPPORTUNITY_INTERVIEW_MODE_LABELS, FORSAH_MESSAGES } from '@/lib/forsah/constants'
import { logForsahAudit } from '@/lib/forsah/audit'
import { rateLimit } from '@/lib/rate-limit'
import { notify } from '@/lib/notifications'
import { meccaDateTime } from '@/lib/utils'

/**
 * مسار مقابلات فرصة — الجولة 66 | ميزة «فرصة» (المواصفة 12)
 * ============================================================
 * GET  /api/opportunities/[id]/interviews — HR المالك/الإدارة: دعوات الفرصة
 * POST /api/opportunities/[id]/interviews — HR بصلاحية inviteInterview:
 *      دفعة دعوات لعدة متقدمين (التاريخ/الوقت/المكان/العنوان/الخريطة/الملاحظات/
 *      حضورية أو عن بُعد) — كل متقدم يصلته إشعارات تفصيلية + ربط حالة الطلب
 *      بمرحلة INTERVIEW_INVITED، والفرصة المغلقة تمنع الدعوات الجديدة.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('HR', 'ADMIN')
    const actor = await requireForsahPermission(session, 'opportunity.viewApplicants')
    const { id } = await params

    const opportunity = await db.opportunity.findUnique({
      where: { id },
      select: { id: true, title: true, createdById: true },
    })
    if (!opportunity) throw new ApiError(FORSAH_MESSAGES.NOT_AVAILABLE, 404)
    await assertOpportunityOwnership(opportunity, actor)

    const interviews = await db.opportunityInterview.findMany({
      where: { opportunityId: id },
      orderBy: [{ scheduledDate: 'asc' }, { scheduledTime: 'asc' }],
      include: {
        application: { select: { id: true, status: true } },
        candidate: { select: { id: true, name: true, profilePhotoBlobId: true } },
      },
      take: 200,
    })

    return NextResponse.json({
      interviews: interviews.map((i) => ({
        id: i.id,
        applicationId: i.applicationId,
        applicationStatus: i.application.status,
        candidate: {
          id: i.candidate.id,
          name: i.candidate.name,
          photoUrl: i.candidate.profilePhotoBlobId
            ? `/api/files/blob/${i.candidate.profilePhotoBlobId}`
            : null,
        },
        scheduledDate: i.scheduledDate,
        scheduledTime: i.scheduledTime,
        mode: i.mode,
        location: i.location,
        address: i.address,
        mapUrl: i.mapUrl,
        notes: i.notes,
        response: i.response,
        respondedAt: i.respondedAt,
        createdAt: i.createdAt,
      })),
      opportunity: { id: opportunity.id, title: opportunity.title },
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('HR', 'ADMIN')
    const actor = await requireForsahPermission(session, 'opportunity.inviteInterview')
    const { id } = await params

    if (!rateLimit(`forsah:interview:${actor.id}`, 30, 60 * 60 * 1000)) {
      return jsonError('عدد كبير من دفعات الدعوات — انتقل دقيقة وأعد المحاولة', 429)
    }

    const opportunity = await db.opportunity.findUnique({
      where: { id },
      select: { id: true, title: true, createdById: true, status: true, audience: true },
    })
    if (!opportunity) throw new ApiError(FORSAH_MESSAGES.NOT_AVAILABLE, 404)
    await assertOpportunityOwnership(opportunity, actor)

    // الفرصة المغلقة/المتوقفة/المسودة تمنع دعوات جديدة — إغلاق مؤثر فعلياً
    if (opportunity.status === 'CLOSED' || opportunity.status === 'ARCHIVED') {
      throw new ApiError(FORSAH_MESSAGES.CLOSED_APPLY_BLOCK, 403)
    }
    if (opportunity.status === 'DRAFT' || opportunity.status === 'PAUSED') {
      return jsonError('الفرصة ليست منشورة — انشرها أو استأنفها قبل دعوة المتقدمين', 409)
    }

    const parsed = forsahInterviewSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    const data = parsed.data

    // تحقق التاريخ: لا مقابلات في الماضي
    const scheduledDate = meccaDateTime(data.scheduledDate.slice(0, 10), data.scheduledTime)
    if (Number.isNaN(scheduledDate.getTime())) return jsonError('تاريخ المقابلة غير صحيح', 422)

    // الطلبات يجب أن تنتمي لهذه الفرصة وأن تكون في مراحل تسمح بالدعوة
    const applications = await db.opportunityApplication.findMany({
      where: {
        id: { in: data.applicationIds },
        opportunityId: id,
        status: { in: ['PENDING', 'REVIEWED', 'INTERVIEW_DECLINED'] },
      },
      select: { id: true, userId: true },
    })
    if (applications.length === 0) {
      return jsonError('الطلبات المختارة غير متاحة للدعوة (دُعيت سابقاً أو في مرحلة أخرى)', 409)
    }

    // حساب المكان والوسوم — حضورية تتطلب مكاناً
    if (data.mode === 'ONSITE' && !data.location?.trim()) {
      return jsonError('حدد مكان المقابلة الحضورية', 422)
    }

    const modeLabel = OPPORTUNITY_INTERVIEW_MODE_LABELS[data.mode]
    const created: Awaited<ReturnType<typeof db.opportunityInterview.create>>[] = []
    await db.$transaction(async (tx) => {
      for (const app of applications) {
        const invite = await tx.opportunityInterview.create({
          data: {
            opportunityId: id,
            applicationId: app.id,
            candidateId: app.userId,
            scheduledDate,
            scheduledTime: data.scheduledTime,
            mode: data.mode,
            location: data.location || null,
            address: data.address || null,
            mapUrl: data.mapUrl || null,
            notes: data.notes || null,
            createdById: actor.id,
          },
        })
        await tx.opportunityApplication.update({
          where: { id: app.id },
          data: { status: 'INTERVIEW_INVITED' },
        })
        created.push(invite)
      }
    })

    await logForsahAudit({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'INTERVIEW_INVITED',
      entityType: 'Opportunity',
      entityId: id,
      meta: { count: created.length, mode: data.mode, date: data.scheduledDate },
    })

    // إشعارات تفصيلية لكل مرشح (المواصفة 12): اسم الفرصة/الجهة/التاريخ/الوقت/الموقع/الملاحظات
    const workerLink = opportunity.audience === 'DOCTOR' ? '/doctor/opportunities' : '/nurse/opportunities'
    await Promise.allSettled(
      applications.map((app) =>
        notify(app.userId, {
          title: 'دعوة مقابلة لفرصة عمل',
          body: `«${opportunity.title}» — ${modeLabel} — ${data.scheduledDate.slice(0, 10)} الساعة ${data.scheduledTime}${data.location ? ` — ${data.location}` : ''} — أكد حضورك أو اعتذر من صفحة «فرصي»`,
          type: 'OPPORTUNITY_INTERVIEW_INVITED',
          link: workerLink,
        })
      )
    )

    return NextResponse.json(
      { message: `أُرسلت ${created.length} دعوة مقابلة وأُشعر المرشحون`, interviews: created },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
