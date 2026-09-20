import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError, ApiError } from '@/lib/api-helpers'
import { forsahReviewSchema } from '@/lib/validations/forsah'
import { assertForsahEnabled, requireForsahPermission } from '@/lib/forsah/server'
import { phoneView, maskPhone } from '@/lib/phone-privacy'
import { FORSAH_MESSAGES } from '@/lib/forsah/constants'
import { logForsahAudit } from '@/lib/forsah/audit'
import { hasDocumentAccess } from '@/lib/document-access'
import { rateLimit } from '@/lib/rate-limit'
import { notify } from '@/lib/notifications'

/**
 * مسار طلب تقديم واحد — الجولة 66 | ميزة «فرصة»
 * ============================================================
 * GET    /api/opportunities/applications/[id] — تفاصيل ملف المتقدم:
 *        - HR المالك/الإدارة: الملف المهني الكامل من بيانات الملف القائم (لا نسخ)
 *          + الهاتف: مقنع حصراً حتى اختيار المتقدم (يُفتح تلقائياً بعده مع تسجيل)
 *          + المستندات: فقط بمنح إداري قائم (نظام الجولة 61) — مع تسجيل المشاهدة.
 *        - المتقدم نفسه: حالة طلبه (فرصي).
 * PATCH  /api/opportunities/applications/[id] — HR: مراجعة/رفض | المتقدم: سحب.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('HR', 'ADMIN', 'NURSE', 'DOCTOR')
    const { id } = await params
    const role = session.user.activeRole ?? session.user.role
    // الجولة 67: الإغلاق الكلي — الإدارة مستثناة (يعيد التشغيل من لوحته)
    await assertForsahEnabled(role)

    const application = await db.opportunityApplication.findUnique({
      where: { id },
      include: {
        opportunity: { select: { id: true, title: true, createdById: true, audience: true } },
      },
    })
    if (!application) throw new ApiError('الطلب غير موجود', 404)

    // ---------- المتقدم يرى حالة طلبه ----------
    if (role === 'NURSE' || role === 'DOCTOR') {
      if (application.userId !== session.user.id) {
        throw new ApiError('هذا الطلب ليس لك', 403)
      }
      return NextResponse.json({ application: { id: application.id, status: application.status, createdAt: application.createdAt }, viewer: 'owner' })
    }

    // ---------- HR المالك / الإدارة ----------
    const actor = await requireForsahPermission(session, 'opportunity.viewApplicants')
    // الجولة 67: الإغلاق الكلي — الإدارة مستثناة
    await assertForsahEnabled(actor.role)
    if (actor.role !== 'ADMIN' && application.opportunity.createdById !== actor.id) {
      throw new ApiError('هذا المتقدم ليس من فرصك', 403)
    }

    const candidate = await db.user.findUnique({
      where: { id: application.userId },
      select: {
        id: true,
        name: true,
        phone: true,
        gender: true,
        qualification: true,
        yearsOfExperience: true,
        status: true,
        profilePhotoBlobId: true,
        hospitalName: true,
        createdAt: true,
        workDepartments: { include: { department: { select: { name: true } } } },
        workSpecialties: { include: { specialty: { select: { name: true } } } },
        affiliations: {
          include: { hospital: { select: { name: true } } },
          where: { status: { in: ['WORKING', 'ENDORSED', 'ON_CALL', 'FORMER'] } },
          take: 10,
        },
        ratingsReceived: {
          select: { overall: true, punctuality: true, quality: true, communication: true, discipline: true, comment: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    })
    if (!candidate) throw new ApiError('ملف المتقدم غير موجود', 404)

    // الخصوصية: الرقم الكامل بعد الاختيار حصراً + تسجيل الفتح (المواصفة 11/18)
    const selection = await db.opportunitySelection.findUnique({
      where: { applicationId: application.id },
      select: { id: true },
    })
    const phoneRevealed = !!selection
    const phone = phoneRevealed
      ? { phone: candidate.phone, phoneMasked: maskPhone(candidate.phone), phoneLocked: false }
      : { phone: null, phoneMasked: maskPhone(candidate.phone), phoneLocked: true }
    if (phoneRevealed) {
      await logForsahAudit({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'APPLICANT_CONTACT_VIEWED',
        entityType: 'Application',
        entityId: application.id,
      })
    }

    // المستندات: بمنح إداري قائم فقط — لا روابط تُرسل قبل التحقق (المواصفة 18)
    const docsAccess = await hasDocumentAccess(actor.id, application.userId)
    let documents: Array<{ id: string; title: string; type: string; status: string; fileUrl: string }> = []
    if (docsAccess) {
      const docs = await db.document.findMany({
        where: { userId: application.userId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, type: true, status: true, fileUrl: true },
        take: 30,
      })
      documents = docs
      await logForsahAudit({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'APPLICANT_DOCUMENTS_VIEWED',
        entityType: 'Application',
        entityId: application.id,
      })
    }

    await logForsahAudit({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'APPLICANT_PROFILE_VIEWED',
      entityType: 'Application',
      entityId: application.id,
    })

    const avgRating =
      candidate.ratingsReceived.length > 0
        ? Math.round(
            (candidate.ratingsReceived.reduce((s, r) => s + r.overall, 0) /
              candidate.ratingsReceived.length) *
              10
          ) / 10
        : null

    return NextResponse.json({
      application: {
        id: application.id,
        status: application.status,
        coverNote: application.coverNote,
        createdAt: application.createdAt,
        matchSnapshot: application.matchSnapshot,
      },
      opportunity: application.opportunity,
      candidate: {
        id: candidate.id,
        name: candidate.name,
        photoUrl: candidate.profilePhotoBlobId ? `/api/files/blob/${candidate.profilePhotoBlobId}` : null,
        gender: candidate.gender,
        qualification: candidate.qualification,
        yearsOfExperience: candidate.yearsOfExperience,
        accountStatus: candidate.status,
        memberSince: candidate.createdAt,
        workTags: {
          departments: candidate.workDepartments.map((d) => d.department.name),
          specialties: candidate.workSpecialties.map((s) => s.specialty.name),
        },
        affiliations: candidate.affiliations.map((a) => ({
          hospital: a.hospital.name,
          status: a.status,
          workYears: a.workYears,
        })),
        ratings: candidate.ratingsReceived,
        avgRating,
        phone,
        documentsState: docsAccess ? 'granted' : 'locked',
        documents,
        selected: !!selection,
      },
      viewer: 'manager',
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('HR', 'ADMIN', 'NURSE', 'DOCTOR')
    const { id } = await params
    const role = session.user.activeRole ?? session.user.role
    // الجولة 67: الإغلاق الكلي — الإدارة مستثناة (يعيد التشغيل من لوحته)
    await assertForsahEnabled(role)

    const application = await db.opportunityApplication.findUnique({
      where: { id },
      include: {
        opportunity: { select: { id: true, title: true, createdById: true, audience: true } },
      },
    })
    if (!application) throw new ApiError('الطلب غير موجود', 404)

    // ---------- المتقدم: سحب تقديمه (المواصفة 23 — منسحب) ----------
    if (role === 'NURSE' || role === 'DOCTOR') {
      if (application.userId !== session.user.id) throw new ApiError('هذا الطلب ليس لك', 403)
      if (!rateLimit(`forsah:withdraw:${session.user.id}`, 10, 10 * 60 * 1000)) {
        return jsonError('محاولات كثيرة — انتظر قليلاً', 429)
      }
      if (['SELECTED', 'WITHDRAWN', 'REJECTED'].includes(application.status)) {
        return jsonError('لا يمكن سحب الطلب في هذه المرحلة — تواصل مع الجهة المعلنة', 409)
      }
      const updated = await db.opportunityApplication.update({
        where: { id },
        data: { status: 'WITHDRAWN' },
        select: { id: true, status: true },
      })
      await logForsahAudit({
        actorId: session.user.id,
        actorRole: role,
        action: 'APPLICATION_WITHDRAWN',
        entityType: 'Application',
        entityId: id,
      })
      await notify(application.opportunity.createdById, {
        title: 'انسحب متقدم من فرصتك',
        body: `«${application.opportunity.title}» — سحب أحد المتقدمين طلبه`,
        type: 'OPPORTUNITY_APPLICATION_REVIEWED',
        link: `/hr/opportunities/${application.opportunity.id}`,
      })
      return NextResponse.json({ message: 'سُحب طلبك من هذه الفرصة', application: updated })
    }

    // ---------- HR: مراجعة / رفض ----------
    const actor = await requireForsahPermission(session, 'opportunity.viewApplicants')
    // الجولة 67: الإغلاق الكلي — الإدارة مستثناة
    await assertForsahEnabled(actor.role)
    if (actor.role !== 'ADMIN' && application.opportunity.createdById !== actor.id) {
      throw new ApiError('هذا المتقدم ليس من فرصك', 403)
    }
    const parsed = forsahReviewSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)

    if (!['PENDING', 'REVIEWED'].includes(application.status)) {
      return jsonError('الطلب في مرحلة لا تسمح بتغييرها بهذا الإجراء', 409)
    }
    const updated = await db.opportunityApplication.update({
      where: { id },
      data: {
        status: parsed.data.status,
        reviewedById: actor.id,
        reviewedAt: new Date(),
      },
      select: { id: true, status: true },
    })
    await logForsahAudit({
      actorId: actor.id,
      actorRole: actor.role,
      action: parsed.data.status === 'REJECTED' ? 'APPLICATION_REJECTED' : 'APPLICATION_REVIEWED',
      entityType: 'Application',
      entityId: id,
      meta: { note: parsed.data.reviewNote || null },
    })
    await notify(application.userId, {
      title: parsed.data.status === 'REJECTED' ? 'تحديث بخصوص تقديمك' : 'تمت مراجعة تقديمك',
      body:
        parsed.data.status === 'REJECTED'
          ? `«${application.opportunity.title}» — لم يُعتمد طلبك هذه المرة، وستُتيح الفرص الأخرى للتقديم`
          : `«${application.opportunity.title}» — طلبك تحت الدراسة للترشيح للمقابلة`,
      type: 'OPPORTUNITY_APPLICATION_REVIEWED',
      link: application.opportunity.audience === 'DOCTOR' ? '/doctor/opportunities' : '/nurse/opportunities',
    })
    return NextResponse.json({ message: parsed.data.status === 'REJECTED' ? 'رُفض الطلب وأُبلغ المتقدم' : 'تمت مراجعة الطلب', application: updated })
  } catch (error) {
    return handleApiError(error)
  }
}
