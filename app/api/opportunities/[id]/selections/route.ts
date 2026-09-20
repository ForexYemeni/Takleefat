import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError, ApiError } from '@/lib/api-helpers'
import { forsahSelectionSchema } from '@/lib/validations/forsah'
import { requireForsahPermission, assertOpportunityOwnership } from '@/lib/forsah/server'
import { isOpportunityOpen, FORSAH_MESSAGES } from '@/lib/forsah/constants'
import { logForsahAudit } from '@/lib/forsah/audit'
import { settleOpportunitySelection, assertSelectionsAvailable } from '@/lib/forsah/finance'
import { rateLimit } from '@/lib/rate-limit'
import { notify } from '@/lib/notifications'
import { maskPhone } from '@/lib/phone-privacy'

/**
 * مسار اختيار الموظفين — الجولة 66 | ميزة «فرصة» (المواصفة 13/14/16)
 * ============================================================
 * GET  /api/opportunities/[id]/selections — المختارون (HR المالك/الإدارة)
 * POST /api/opportunities/[id]/selections — اختيار دفعة مرشحين:
 *  - يحترم عدد الموظفين المطلوبين — يرفض ما يتجاوزه.
 *  - يُمنع في الفرص المغلقة/المتوقفة (server-side enforced).
 *  - لكل اختيار يُنشأ سجل مالي فوري Atomic + Idempotent (idempotencyKey
 *    فريد للاختيار) — الضغط المزدوج لا ينشئ عملية مكررة أبداً.
 *  - إشعار «تم اختيارك للفرصة» + فتح رقم المتقدم المختار له (خصوصية).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('HR', 'ADMIN')
    const actor = await requireForsahPermission(session, 'opportunity.viewFinancials')
    const { id } = await params

    const opportunity = await db.opportunity.findUnique({
      where: { id },
      select: { id: true, title: true, createdById: true, positionsNeeded: true },
    })
    if (!opportunity) throw new ApiError(FORSAH_MESSAGES.NOT_AVAILABLE, 404)
    await assertOpportunityOwnership(opportunity, actor)

    const selections = await db.opportunitySelection.findMany({
      where: { opportunityId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        application: { select: { id: true, status: true } },
        candidate: { select: { id: true, name: true, phone: true, profilePhotoBlobId: true } },
      },
    })
    const transactions = await db.opportunityTransaction.findMany({
      where: { opportunityId: id },
      select: { id: true, selectionId: true, status: true, feeAmount: true, hrCommissionAmount: true, adminAmount: true, currency: true },
    })
    const txBySelection = new Map(transactions.map((t) => [t.selectionId, t]))

    return NextResponse.json({
      selections: selections.map((s) => ({
        id: s.id,
        applicationId: s.applicationId,
        applicationStatus: s.application.status,
        candidate: {
          id: s.candidate.id,
          name: s.candidate.name,
          // المختارون: رقمهم مفتوح لحاجة التواصل الفعلية (المواصفة 13)
          phone: s.candidate.phone,
          phoneMasked: maskPhone(s.candidate.phone),
          photoUrl: s.candidate.profilePhotoBlobId
            ? `/api/files/blob/${s.candidate.profilePhotoBlobId}`
            : null,
        },
        note: s.note,
        createdAt: s.createdAt,
        transaction: txBySelection.get(s.id) ?? null,
      })),
      positionsNeeded: opportunity.positionsNeeded,
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
    const actor = await requireForsahPermission(session, 'opportunity.selectCandidate')
    const { id } = await params

    if (!rateLimit(`forsah:select:${actor.id}`, 30, 60 * 60 * 1000)) {
      return jsonError('محاولات كثيرة — انتقل دقيقة وأعد المحاولة', 429)
    }

    const opportunity = await db.opportunity.findUnique({
      where: { id },
      select: { id: true, title: true, createdById: true, status: true, audience: true, positionsNeeded: true },
    })
    if (!opportunity) throw new ApiError(FORSAH_MESSAGES.NOT_AVAILABLE, 404)
    await assertOpportunityOwnership(opportunity, actor)

    // الإغلاق مؤثر فعلياً — لا اختيارات جديدة في الفرص المغلقة/المتوقفة
    if (opportunity.status === 'CLOSED' || opportunity.status === 'ARCHIVED') {
      throw new ApiError(FORSAH_MESSAGES.CLOSED_APPLY_BLOCK, 403)
    }
    if (!isOpportunityOpen(opportunity.status)) {
      return jsonError('الفرصة ليست منشورة — لا اختيارات في المسودة أو الإيقاف المؤقت', 409)
    }

    const parsed = forsahSelectionSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    const { applicationIds, note } = parsed.data

    // احترام العدد المطلوب — المواصفة 13 («يتم احترام عدد الموظفين المطلوبين»)
    await assertSelectionsAvailable(id, opportunity.positionsNeeded, applicationIds.length)

    // الطلبات: لهذه الفرصة + مؤهلة للاختيار (مقابلة مؤكدة أو مراجعة أو ترشيح)
    const applications = await db.opportunityApplication.findMany({
      where: {
        id: { in: applicationIds },
        opportunityId: id,
        status: { in: ['PENDING', 'REVIEWED', 'INTERVIEW_INVITED', 'INTERVIEW_CONFIRMED', 'INTERVIEW_DECLINED'] },
      },
      select: { id: true, userId: true, status: true },
    })
    if (applications.length === 0) {
      return jsonError('الطلبات المختارة غير متاحة للاختيار', 409)
    }

    const selections: Awaited<ReturnType<typeof db.opportunitySelection.create>>[] = []
    await db.$transaction(async (tx) => {
      for (const app of applications) {
        const selection = await tx.opportunitySelection.create({
          data: {
            opportunityId: id,
            applicationId: app.id,
            candidateId: app.userId,
            selectedById: actor.id,
            note: note || null,
          },
        })
        await tx.opportunityApplication.update({
          where: { id: app.id },
          data: { status: 'SELECTED' },
        })
        selections.push(selection)
      }
    })

    // العملية المالية لكل اختيار — idempotent (لا تكرار مهما تكرر الاستدعاء)
    const settleResults: Awaited<ReturnType<typeof settleOpportunitySelection>>[] = []
    for (const selection of selections) {
      settleResults.push(await settleOpportunitySelection(selection.id))
    }

    await logForsahAudit({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'CANDIDATE_SELECTED',
      entityType: 'Opportunity',
      entityId: id,
      meta: { count: selections.length, positionsNeeded: opportunity.positionsNeeded },
    })

    // إشعارات الاختيار + إغلاق تلقائي إذا اكتمل العدد (سلوك عملي منطقي)
    const workerLink = opportunity.audience === 'DOCTOR' ? '/doctor/opportunities' : '/nurse/opportunities'
    await Promise.allSettled(
      applications.map((app) =>
        notify(app.userId, {
          title: 'تم اختيارك للفرصة',
          body: `«${opportunity.title}» — مبروك! تواصل مع الجهة المعنية عبر بيانات الاتصال المفتوحة الآن في صفحة «فرصي»`,
          type: 'OPPORTUNITY_CANDIDATE_SELECTED',
          link: workerLink,
        })
      )
    )

    const newSelectedCount = await db.opportunitySelection.count({ where: { opportunityId: id } })
    const completed = newSelectedCount >= opportunity.positionsNeeded
    let autoClosed = false
    if (completed && isOpportunityOpen(opportunity.status)) {
      // اكتمال العدد: الفرصة تُغلق تلقائياً عن التقديم الجديد (حفظ كامل للبيانات)
      await db.opportunity.update({
        where: { id },
        data: { status: 'CLOSED', closedAt: new Date(), closedById: actor.id, closedByRole: actor.role },
      })
      autoClosed = true
      await logForsahAudit({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'OPPORTUNITY_CLOSED_BY_HR',
        entityType: 'Opportunity',
        entityId: id,
        meta: { auto: true, reason: 'POSITIONS_FILLED' },
      })
    }

    return NextResponse.json(
      {
        message: `تم اختيار ${selections.length} موظفاً${autoClosed ? ' — واكتمل العدد فأُغلقت الفرصة عن التقديم الجديد' : ''}`,
        selections,
        settlements: settleResults,
        selectedCount: newSelectedCount,
        autoClosed,
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof Error && error.message === FORSAH_MESSAGES.SELECTIONS_FULL) {
      return jsonError(FORSAH_MESSAGES.SELECTIONS_FULL, 409)
    }
    return handleApiError(error)
  }
}
