import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError, ApiError } from '@/lib/api-helpers'
import { assertForsahEnabled, assertOpportunityOwnership, requireForsahPermission } from '@/lib/forsah/server'
import { maskPhone } from '@/lib/phone-privacy'
import { FORSAH_MESSAGES } from '@/lib/forsah/constants'
import { logForsahAudit } from '@/lib/forsah/audit'
import type { Prisma, OpportunityApplicationStatus } from '@prisma/client'

/**
 * GET /api/opportunities/[id]/applications — متقدمو فرصة واحدة (HR المالك / الإدارة)
 * ============================================================
 * الخصوصية بالتصميم (المواصفة 11/18):
 *  - HR يرى متقدمي فرصه هو فقط (فحص ملكية من الخادم).
 *  - رقم الهاتف لا يُرسل كاملاً إطلاقاً في هذه القائمة — قناع فقط؛
 *    يُفتح الرقم الكامل من الخادم تلقائياً بعد اختيار المتقدم (SELECTED)
 *    لأن الاختيار هو لحظة الحاجة المشروعة للتواصل، مع تسجيل الفتح.
 *  - المستندات لا تُدرج هنا إطلاقاً — تُفتح بمنح إداري فقط عبر نظام الجولة 61.
 *
 * الفلاتر (search/status) + الترتيب (الأحدث/الأكثر خبرة) + ترقيم server-side.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('HR', 'ADMIN')
    const actor = await requireForsahPermission(session, 'opportunity.viewApplicants')
    // الجولة 67: الإغلاق الكلي — الإدارة مستثناة
    await assertForsahEnabled(actor.role)
    const { id } = await params

    const opportunity = await db.opportunity.findUnique({
      where: { id },
      include: {
        specialty: { select: { name: true } },
        department: { select: { name: true } },
        qualification: { select: { name: true } },
      },
    })
    if (!opportunity) throw new ApiError(FORSAH_MESSAGES.NOT_AVAILABLE, 404)
    await assertOpportunityOwnership(opportunity, actor)

    const { searchParams } = req.nextUrl
    const q = searchParams.get('q')?.trim() ?? ''
    const status = searchParams.get('status') ?? ''
    const sort = searchParams.get('sort') ?? 'newest'
    const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1)
    const take = Math.min(100, Math.max(6, Number(searchParams.get('take') ?? 20) || 20))

    const where: Prisma.OpportunityApplicationWhereInput = { opportunityId: id }
    if (
      status &&
      ['PENDING', 'REVIEWED', 'INTERVIEW_INVITED', 'INTERVIEW_CONFIRMED', 'INTERVIEW_DECLINED', 'SELECTED', 'REJECTED', 'WITHDRAWN'].includes(status)
    ) {
      where.status = status as OpportunityApplicationStatus
    }
    if (q) {
      where.user = {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { qualification: { contains: q, mode: 'insensitive' } },
        ],
      }
    }

    const orderBy: Prisma.OpportunityApplicationOrderByWithRelationInput[] =
      sort === 'experience'
        ? [{ user: { yearsOfExperience: 'desc' } }, { createdAt: 'desc' }]
        : [{ createdAt: 'desc' }]

    const [rows, total] = await Promise.all([
      db.opportunityApplication.findMany({
        where,
        orderBy,
        skip: (page - 1) * take,
        take,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              phone: true,
              gender: true,
              qualification: true,
              yearsOfExperience: true,
              profilePhotoBlobId: true,
              status: true,
              // أقسام/تخصصات العمل للعرض السريع (يُختار الجمهور المناسب في التحويل أدناه)
              workSpecialties: { include: { specialty: { select: { name: true } } } },
              workDepartments: { include: { department: { select: { name: true } } } },
              ratingsReceived: { select: { overall: true } },
            },
          },
          interviews: { select: { id: true, response: true, scheduledDate: true, scheduledTime: true } },
          selection: { select: { id: true, createdAt: true } },
        },
      }),
      db.opportunityApplication.count({ where }),
    ])

    const selectedCount = await db.opportunitySelection.count({ where: { opportunityId: id } })

    const applications = rows.map((a) => ({
      id: a.id,
      status: a.status,
      coverNote: a.coverNote,
      createdAt: a.createdAt,
      selected: !!a.selection,
      interview: a.interviews.length > 0 ? a.interviews[0] : null,
      candidate: {
        id: a.user.id,
        name: a.user.name,
        photoUrl: a.user.profilePhotoBlobId ? `/api/files/blob/${a.user.profilePhotoBlobId}` : null,
        gender: a.user.gender,
        qualification: a.user.qualification,
        yearsOfExperience: a.user.yearsOfExperience,
        accountStatus: a.user.status,
        workTags:
          opportunity.audience === 'DOCTOR'
            ? a.user.workSpecialties.map((s) => s.specialty.name)
            : a.user.workDepartments.map((d) => d.department.name),
        avgRating:
          a.user.ratingsReceived.length > 0
            ? Math.round(
                (a.user.ratingsReceived.reduce((s, r) => s + r.overall, 0) /
                  a.user.ratingsReceived.length) *
                  10
              ) / 10
            : null,
        // الخصوصية: قناع حصراً في القائمة — الرقم الكامل بعد الاختيار من مسار التفاصيل
        phoneMasked: maskPhone(a.user.phone),
        phoneRevealed: !!a.selection,
      },
    }))

    return NextResponse.json({
      applications,
      total,
      page,
      take,
      opportunity: {
        id: opportunity.id,
        title: opportunity.title,
        audience: opportunity.audience,
        positionsNeeded: opportunity.positionsNeeded,
        specialty: opportunity.specialty?.name ?? null,
        department: opportunity.department?.name ?? null,
        qualification: opportunity.qualification?.name ?? null,
      },
      selectedCount,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
