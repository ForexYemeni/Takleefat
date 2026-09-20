import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError, ApiError } from '@/lib/api-helpers'
import { forsahApplySchema } from '@/lib/validations/forsah'
import { assertForsahEnabled, buildCandidate } from '@/lib/forsah/server'
import { evaluateOpportunityEligibility } from '@/lib/forsah/eligibility'
import { isOpportunityOpen, FORSAH_MESSAGES } from '@/lib/forsah/constants'
import { logForsahAudit } from '@/lib/forsah/audit'
import { rateLimit } from '@/lib/rate-limit'
import { notify } from '@/lib/notifications'

/**
 * POST /api/opportunities/[id]/apply — التقديم على فرصة (كادر/طبيب)
 * ============================================================
 * الفحص كله server-side حصراً (المواصفة 7/10/14):
 *  1) الفرصة مفتوحة (PUBLISHED/ACTIVE) — المغلقة تُرفض برسالة عربية واضحة:
 *     «هذه الفرصة مغلقة ولم تعد متاحة للتقديم.»
 *  2) الأهلية الكاملة عبر Eligibility Engine — غير المؤهل لا يقدّم إطلاقاً.
 *  3) التقديم الواحد مرة واحدة — قيد فريد (opportunityId, userId) في القاعدة
 *     يمنع التكرار حتى مع الضغط المزدوج أو تزامن الطلبات.
 *  4) الطلب يرتبط بـ User ID الحالي — لا حساب ولا ملف جديد (المواصفة 10).
 *  5) لقطة الأهلية تُحفظ مع الطلب (شفافية تاريخية).
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

    if (session.user.status !== 'APPROVED') {
      throw new ApiError('حسابك غير معتمد بعد — لا يمكنك التقديم حتى اعتماده من الإدارة', 403)
    }
    if (!rateLimit(`forsah:apply:${session.user.id}`, 10, 10 * 60 * 1000)) {
      return jsonError('محاولات كثيرة متتالية — انتظر قليلاً ثم أعد المحاولة', 429)
    }

    const opportunity = await db.opportunity.findUnique({
      where: { id },
      include: {
        hospital: { select: { name: true } },
        specialty: { select: { name: true } },
        department: { select: { name: true } },
        qualification: { select: { name: true } },
      },
    })
    if (!opportunity) throw new ApiError(FORSAH_MESSAGES.NOT_AVAILABLE, 404)

    // 1) الإغلاق يُرفض من الخادم دائماً — وليس مجرد إخفاء زر
    if (!isOpportunityOpen(opportunity.status)) {
      throw new ApiError(
        opportunity.status === 'PAUSED'
          ? 'الفرصة متوقفة مؤقتاً حالياً — انتظر استئناف النشر'
          : FORSAH_MESSAGES.CLOSED_APPLY_BLOCK,
        403
      )
    }

    // منع التقديم على فرصة جمهور مخالف (طبيب على فرصة كادر والعكس)
    const audienceValue = role === 'DOCTOR' ? 'DOCTOR' : 'NURSE'
    if (opportunity.audience !== audienceValue) {
      throw new ApiError(FORSAH_MESSAGES.CANNOT_APPLY, 403)
    }

    // 2) الأهلية الكاملة من الخادم
    const candidate = await buildCandidate(session.user.id)
    if (!candidate) throw new ApiError(FORSAH_MESSAGES.CANNOT_APPLY, 403)
    const eligibility = evaluateOpportunityEligibility(candidate, {
      audience: opportunity.audience,
      gender: opportunity.gender,
      specialtyId: opportunity.specialtyId,
      departmentId: opportunity.departmentId,
      qualificationId: opportunity.qualificationId,
      minYearsExperience: opportunity.minYearsExperience,
      licenseRequired: opportunity.licenseRequired,
      qualificationName: opportunity.qualification?.name ?? null,
    })
    if (!eligibility.eligible) {
      throw new ApiError(FORSAH_MESSAGES.NOT_ELIGIBLE, 403)
    }

    // 3) لا تقديم مكرر — فحص + قيد فريد مزدوج
    const existing = await db.opportunityApplication.findUnique({
      where: { opportunityId_userId: { opportunityId: id, userId: session.user.id } },
      select: { id: true, status: true },
    })
    if (existing) {
      throw new ApiError(FORSAH_MESSAGES.APPLIED_BEFORE, 409)
    }

    const parsed = forsahApplySchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const application = await db.opportunityApplication.create({
      data: {
        opportunityId: id,
        userId: session.user.id,
        coverNote: parsed.data.coverNote || null,
        matchSnapshot: JSON.stringify(eligibility),
      },
      select: { id: true, status: true, createdAt: true },
    })

    await logForsahAudit({
      actorId: session.user.id,
      actorRole: role,
      action: 'APPLICATION_SUBMITTED',
      entityType: 'Application',
      entityId: application.id,
      meta: { opportunityId: id, eligible: true },
    })

    // إشعار HR المالك + الإدارة (المواصفة 19 — APPLICATION_RECEIVED)
    await Promise.allSettled([
      notify(opportunity.createdById, {
        title: 'متقدم جديد على فرصتك',
        body: `«${opportunity.title}» — ورد تقديم جديد، راجع ملف المتقدم من لوحة المتقدمين`,
        type: 'OPPORTUNITY_APPLICATION_RECEIVED',
        link: `/hr/opportunities/${id}`,
      }),
    ])

    return NextResponse.json(
      { message: FORSAH_MESSAGES.APPLIED_OK, application },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
