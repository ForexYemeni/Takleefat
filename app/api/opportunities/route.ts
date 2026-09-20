import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError, ApiError } from '@/lib/api-helpers'
import { opportunitySchema } from '@/lib/validations/forsah'
import { OPPORTUNITY_INCLUDE, requireForsahPermission, buildCandidate, assertForsahEnabled, computeOpportunityTitle } from '@/lib/forsah/server'
import { evaluateOpportunityEligibility } from '@/lib/forsah/eligibility'
import { isOpportunityOpen, FORSAH_MESSAGES } from '@/lib/forsah/constants'
import { buildCandidateFeePreview } from '@/lib/forsah/finance'
import { getSettings } from '@/lib/settings'
import { logForsahAudit } from '@/lib/forsah/audit'
import { rateLimit } from '@/lib/rate-limit'
import { notify } from '@/lib/notifications'
import type { Prisma } from '@prisma/client'

/**
 * GET /api/opportunities — قائمة الفرص حسب الدور (الجولة 66 — ميزة «فرصة»)
 * - NURSE/DOCTOR: الفرص المفتوحة لجمهوره والمؤهل لها (Eligibility Engine) + حالة تقديمه
 * - HR: فرصه هو فقط مع عداداتها (لا يرى فرص HR آخرين — المواصفة 22)
 * - ADMIN: كل الفرص
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireRole('NURSE', 'DOCTOR', 'HR', 'ADMIN')
    const role = session.user.activeRole ?? session.user.role
    // الجولة 67: الإغلاق الكلي — الإدارة مستثناة لرؤية كل شيء، والباقي محجوب
    await assertForsahEnabled(role)
    const { searchParams } = req.nextUrl
    const q = searchParams.get('q')?.trim() ?? ''
    const status = searchParams.get('status') ?? ''
    const audience = searchParams.get('audience') ?? ''
    const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1)
    const take = Math.min(50, Math.max(6, Number(searchParams.get('take') ?? 12) || 12))

    // ---------- الكادر والأطباء: الفرص المؤهلة فقط (server-side enforced) ----------
    if (role === 'NURSE' || role === 'DOCTOR') {
      const audienceValue = role === 'DOCTOR' ? 'DOCTOR' : 'NURSE'
      const candidate = await buildCandidate(session.user.id)
      if (!candidate) return NextResponse.json({ opportunities: [], total: 0, page, take })

      const where: Prisma.OpportunityWhereInput = {
        audience: audienceValue,
        status: { in: ['PUBLISHED', 'ACTIVE'] },
      }
      if (q) {
        where.OR = [
          { title: { contains: q, mode: 'insensitive' } },
          { hospital: { name: { contains: q, mode: 'insensitive' } } },
          { specialty: { name: { contains: q, mode: 'insensitive' } } },
          { department: { name: { contains: q, mode: 'insensitive' } } },
        ]
      }

      const [rows, total, feeSettings] = await Promise.all([
        db.opportunity.findMany({
          where,
          orderBy: [{ status: 'asc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
          include: {
            ...OPPORTUNITY_INCLUDE,
            applications: {
              where: { userId: session.user.id },
              select: { id: true, status: true, createdAt: true },
            },
          },
          take: 200, // سقف أمان ثم فلترة أهلية وترقيم منطقي أدناه
        }),
        db.opportunity.count({ where }),
        getSettings(),
      ])

      // فلترة الأهلية على مستوى الخادم — المؤهلون فقط يرون الفرصة (المواصفة 7)
      const eligibleRows = rows.filter((o) =>
        evaluateOpportunityEligibility(candidate, {
          audience: o.audience,
          gender: o.gender,
          specialtyId: o.specialtyId,
          departmentId: o.departmentId,
          qualificationId: o.qualificationId,
          minYearsExperience: o.minYearsExperience,
          licenseRequired: o.licenseRequired,
          qualificationName: o.qualification?.name ?? null,
        }).eligible
      )

      const start = (page - 1) * take
      // الجولة 70: شفافية الرسوم قبل التقديم — معاينة الرسوم لكل فرصة مؤهلة
      return NextResponse.json({
        opportunities: eligibleRows.slice(start, start + take).map((o) => ({
          ...o,
          feePreview: buildCandidateFeePreview(o.salaryAmount, o.salaryCurrency, feeSettings),
        })),
        total: eligibleRows.length,
        page,
        take,
      })
    }

    // ---------- HR: فرصه فقط / ADMIN: الكل ----------
    const isHr = role === 'HR'
    const where: Prisma.OpportunityWhereInput = {
      ...(isHr ? { createdById: session.user.id } : {}),
    }
    if (status && ['DRAFT', 'PUBLISHED', 'ACTIVE', 'PAUSED', 'CLOSED', 'ARCHIVED'].includes(status)) {
      where.status = status as 'DRAFT' | 'PUBLISHED' | 'ACTIVE' | 'PAUSED' | 'CLOSED' | 'ARCHIVED'
    }
    if (audience && ['NURSE', 'DOCTOR'].includes(audience)) {
      where.audience = audience as 'NURSE' | 'DOCTOR'
    }
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { hospital: { name: { contains: q, mode: 'insensitive' } } },
      ]
    }

    const [rows, total] = await Promise.all([
      db.opportunity.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: OPPORTUNITY_INCLUDE,
        skip: (page - 1) * take,
        take,
      }),
      db.opportunity.count({ where }),
    ])

    return NextResponse.json({ opportunities: rows, total, page, take })
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * POST /api/opportunities — إنشاء فرصة جديدة (HR بصلاحية create / الإدارة)
 * الرقم التسلسلي يُولَّد تلقائياً «فرصة رقم N» — الحالة الابتدائية مسودة
 * الجولة 67: اسم الفرصة يُولَّد تلقائياً «فرصة + القسم/التخصص» — بلا مدخل يدوي
 * ثم يُنشر من مسار التحويلات بعد فحص الاكتمال.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole('HR', 'ADMIN')
    const actor = await requireForsahPermission(session, 'opportunity.create')
    await assertForsahEnabled(actor.role)

    if (!rateLimit(`forsah:create:${actor.id}`, 20, 60 * 60 * 1000)) {
      return jsonError('عدد كبير من محاولات الإنشاء — انتقل دقيقة وأعد المحاولة', 429)
    }

    const parsed = opportunitySchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }
    const data = parsed.data

    // الجهة الصحية من الكتالوج الحالي — لا إنشاء جهات من هنا
    const hospital = await db.hospital.findUnique({ where: { id: data.hospitalId } })
    if (!hospital || !hospital.isActive) {
      return jsonError('الجهة الصحية غير موجودة أو غير نشطة — اختر من القائمة المعتمدة', 422)
    }
    // مراجع الكتالوجات الحالية حصراً — لا نسخ تخصص/قسم/مؤهل (المواصفة 6)
    // الجولة 67: نُرجع الاسم معنا لتوليد اسم الفرصة التلقائي من نفس المرجع
    if (data.specialtyId) {
      const exists = await db.specialty.findUnique({ where: { id: data.specialtyId }, select: { id: true, name: true } })
      if (!exists) return jsonError('التخصص غير موجود في الكتالوج', 422)
    }
    if (data.departmentId) {
      const exists = await db.department.findUnique({ where: { id: data.departmentId }, select: { id: true, name: true } })
      if (!exists) return jsonError('القسم غير موجود في الكتالوج', 422)
    }
    if (data.qualificationId) {
      const exists = await db.qualification.findUnique({ where: { id: data.qualificationId }, select: { id: true } })
      if (!exists) return jsonError('المؤهل غير موجود في الكتالوج', 422)
    }

    // الجولة 67: الاسم يُولَّد تلقائياً «فرصة + القسم (للكادر) / التخصص (للأطباء)» — بلا أي مدخل يدوي
    const title = await computeOpportunityTitle({
      audience: data.audience,
      departmentId: data.departmentId || null,
      specialtyId: data.specialtyId || null,
    })

    const last = await db.opportunity.aggregate({ _max: { number: true } })
    const number = (last._max.number ?? 0) + 1

    const opportunity = await db.opportunity.create({
      data: {
        number,
        title,
        hospitalId: data.hospitalId,
        audience: data.audience,
        specialtyId: data.specialtyId || null,
        departmentId: data.departmentId || null,
        qualificationId: data.qualificationId || null,
        salaryAmount: data.salaryAmount,
        salaryType: data.salaryType,
        salaryCurrency: data.salaryCurrency,
        workStartTime: data.workStartTime || null,
        workEndTime: data.workEndTime || null,
        positionsNeeded: data.positionsNeeded,
        gender: data.gender,
        vacations: data.vacations || null,
        procedureSharePercent: data.procedureSharePercent,
        minYearsExperience: data.minYearsExperience,
        licenseRequired: data.licenseRequired,
        requiredDocuments: data.requiredDocuments,
        description: data.description || null,
        responsibilities: data.responsibilities || null,
        benefits: data.benefits || null,
        notes: data.notes || null,
        status: 'DRAFT',
        createdById: actor.id,
      },
      include: OPPORTUNITY_INCLUDE,
    })

    await logForsahAudit({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'OPPORTUNITY_CREATED',
      entityType: 'Opportunity',
      entityId: opportunity.id,
      meta: { number, title: opportunity.title },
    })

    return NextResponse.json(
      { message: `أُنشئت «فرصة رقم ${number}» كمسودة — أكمل بياناتها وانشرها حين تكون جاهزة`, opportunity },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
