import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError, ApiError } from '@/lib/api-helpers'
import { opportunitySchema, hrDeleteSchema } from '@/lib/validations/forsah'
import {
  OPPORTUNITY_INCLUDE,
  requireForsahPermission,
  assertOpportunityOwnership,
  buildCandidate,
  assertForsahEnabled,
  computeOpportunityTitle,
} from '@/lib/forsah/server'
import { evaluateOpportunityEligibility } from '@/lib/forsah/eligibility'
import { FORSAH_MESSAGES } from '@/lib/forsah/constants'
import { buildCandidateFeePreview } from '@/lib/forsah/finance'
import { getSettings } from '@/lib/settings'
import { logForsahAudit } from '@/lib/forsah/audit'
import { notify, notifyAdmins } from '@/lib/notifications'
import { rateLimit } from '@/lib/rate-limit'
import bcrypt from 'bcryptjs'

/**
 * مسار الفرصة الواحدة — الجولة 66 | ميزة «فرصة»
 * ============================================================
 * GET   /api/opportunities/[id] — التفاصيل حسب الدور:
 *       - NURSE/DOCTOR: التفاصيل + نتيجة Eligibility الحية + حالة تقديمه
 *       - HR المالك/ADMIN: التفاصيل الكاملة + عدادات المراحل
 * PATCH /api/opportunities/[id] — تحولات الحالة والتعديل (حسب الصلاحية):
 *       edit | publish | pause | resume | close | archive
 *
 * الإغلاق (close) محمي server-side حصراً:
 *  - الإدارة: تُغلق أي فرصة في أي لحظة (السلطة العليا — المواصفة 14).
 *  - HR: فقط بمنح صلاحية opportunity.close له وحصراً لفرصه هو.
 *  - بعد الإغلاق: لا تقديم جديد (يُرفض في مسار التقديم من القاعدة/المنطق)،
 *    تختفي من قوائم المؤهلين، وتبقى كل الطلبات والمقابلات والاختيارات
 *    والمالية وسجل التدقيق محفوظة.
 * DELETE /api/opportunities/[id] — حذف نهائي للفرص المغلقة/المؤرشفة (الجولة 69):
 *  - الإدارة المنفّذة حصراً + تأكيد بكلمة مرورها + تحديد معدل.
 *  - لا يضيع أي سجل: لقطة JSON كاملة (فرصة + طلبات + مقابلات + اختيارات + مالية)
 *    تُخزَّن في opportunity_deletion_archives قبل الحذف داخل معاملة واحدة.
 *  - سجل التدقيق يبقى محفوظاً (نصي بلا FK) — مع إدخال OPPORTUNITY_DELETED دائم.
 */

async function loadOpportunity(id: string) {
  const opportunity = await db.opportunity.findUnique({
    where: { id },
    include: OPPORTUNITY_INCLUDE,
  })
  if (!opportunity) throw new ApiError(FORSAH_MESSAGES.NOT_AVAILABLE, 404)
  return opportunity
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('NURSE', 'DOCTOR', 'HR', 'ADMIN')
    const { id } = await params
    const role = session.user.activeRole ?? session.user.role
    // الجولة 67: الإغلاق الكلي — الإدارة مستثناة، والباقي محجوب
    await assertForsahEnabled(role)
    const opportunity = await loadOpportunity(id)
    const isManager = role === 'ADMIN' || (role === 'HR' && opportunity.createdById === session.user.id)

    if (isManager) {
      const [pendingCount, interviewedCount, selectedCount, txCount] = await Promise.all([
        db.opportunityApplication.count({ where: { opportunityId: id, status: 'PENDING' } }),
        db.opportunityInterview.count({ where: { opportunityId: id } }),
        db.opportunitySelection.count({ where: { opportunityId: id } }),
        db.opportunityTransaction.count({ where: { opportunityId: id } }),
      ])
      return NextResponse.json({
        opportunity,
        viewer: 'manager',
        counters: {
          pending: pendingCount,
          interviews: interviewedCount,
          selections: selectedCount,
          transactions: txCount,
          positionsNeeded: opportunity.positionsNeeded,
          remaining: Math.max(0, opportunity.positionsNeeded - selectedCount),
        },
      })
    }

    // ---------- المتقدم المحتمل (كادر/طبيب): أهلية حية + حالة تقديمه ----------
    const candidate = await buildCandidate(session.user.id)
    const eligibility = candidate
      ? evaluateOpportunityEligibility(candidate, {
          audience: opportunity.audience,
          gender: opportunity.gender,
          specialtyId: opportunity.specialtyId,
          departmentId: opportunity.departmentId,
          qualificationId: opportunity.qualificationId,
          minYearsExperience: opportunity.minYearsExperience,
          licenseRequired: opportunity.licenseRequired,
          qualificationName: opportunity.qualification?.name ?? null,
        })
      : { eligible: false, checks: [] }

    const myApplication = await db.opportunityApplication.findUnique({
      where: { opportunityId_userId: { opportunityId: id, userId: session.user.id } },
      select: { id: true, status: true, coverNote: true, createdAt: true },
    })

    // الجولة 70: شفافية الرسوم قبل التقديم — معاينة الرسوم لهذه الفرصة تحديداً
    const feeSettings = await getSettings()

    return NextResponse.json({
      opportunity,
      viewer: 'worker',
      eligibility,
      myApplication,
      feePreview: buildCandidateFeePreview(opportunity.salaryAmount, opportunity.salaryCurrency, feeSettings),
      canApply:
        eligibility.eligible && !myApplication && (opportunity.status === 'PUBLISHED' || opportunity.status === 'ACTIVE'),
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
    const session = await requireRole('HR', 'ADMIN')
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const action = String(body?.action ?? 'edit')

    const opportunity = await loadOpportunity(id)
    const actorRole = session.user.activeRole ?? session.user.role
    // الجولة 67: الإغلاق الكلي — الإدارة فقط تُدير الفرص بعد الإغلاق الكلي
    await assertForsahEnabled(actorRole)

    // ---------- الإغلاق: صلاحية عليا محمية من الخادم (المواصفة 14) ----------
    if (action === 'close') {
      if (actorRole === 'ADMIN') {
        // الإدارة تُغلق أي فرصة دائماً
      } else {
        await requireForsahPermission(session, 'opportunity.close')
        await assertOpportunityOwnership(opportunity, { id: session.user.id, role: 'HR' })
      }
      if (opportunity.status === 'CLOSED' || opportunity.status === 'ARCHIVED') {
        return jsonError('الفرصة مغلقة مسبقاً', 409)
      }
      const closed = await db.opportunity.update({
        where: { id },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          closedById: session.user.id,
          closedByRole: actorRole,
        },
        include: OPPORTUNITY_INCLUDE,
      })
      await logForsahAudit({
        actorId: session.user.id,
        actorRole: actorRole,
        action: actorRole === 'ADMIN' ? 'OPPORTUNITY_CLOSED_BY_ADMIN' : 'OPPORTUNITY_CLOSED_BY_HR',
        entityType: 'Opportunity',
        entityId: id,
        meta: { number: opportunity.number, title: opportunity.title },
      })
      // إشعار الأطراف المتأثرة حسب الحالة (المواصفة 19): مالك الفرصة + الإدارة + المتقدمون النشطون
      const baseLink = actorRole === 'ADMIN' ? '/hr/opportunities' : '/admin/forsah'
      if (actorRole === 'ADMIN' && opportunity.createdById !== session.user.id) {
        await notify(opportunity.createdById, {
          title: 'أُغلقت فرصة من الإدارة',
          body: `«${opportunity.title}» — أوقفت الإدارة الفرصة عن استقبال التقديمات الجديدة. جميع الطلبات والمقابلات والاختيارات محفوظة.`,
          type: 'OPPORTUNITY_CLOSED',
          link: `/hr/opportunities/${id}`,
        })
      }
      const activeApplicants = await db.opportunityApplication.findMany({
        where: {
          opportunityId: id,
          status: { in: ['PENDING', 'REVIEWED', 'INTERVIEW_INVITED', 'INTERVIEW_CONFIRMED'] },
        },
        select: { userId: true },
      })
      await Promise.allSettled([
        ...activeApplicants.map((a) =>
          notify(a.userId, {
            title: 'أُغلقت فرصة تقدمت عليها',
            body: `«${opportunity.title}» — لم تعد الفرصة متاحة للتقديم الجديد. حالة طلبك السابق محفوظة.`,
            type: 'OPPORTUNITY_CLOSED',
            link: actorRole === 'ADMIN' ? baseLink : '/nurse/opportunities',
          })
        ),
        ...(actorRole === 'HR'
          ? [
              notifyAdmins({
                title: 'أغلق الموارد البشرية فرصة',
                body: `${session.user.name} أغلق «${opportunity.title}» — محفوظة كاملة في السجل.`,
                type: 'OPPORTUNITY_CLOSED',
                link: '/admin/forsah',
              }),
            ]
          : []),
      ])
      return NextResponse.json({ message: 'أُغلقت الفرصة نهائياً — كل البيانات محفوظة ولا تقديم جديد', opportunity: closed })
    }

    // ---------- بقية الأفعال: HR مالك بصلاحيته المناسبة / الإدارة ----------
    const permissionByAction: Record<string, 'opportunity.edit' | 'opportunity.publish' | 'opportunity.pause' | 'opportunity.manage'> = {
      edit: 'opportunity.edit',
      publish: 'opportunity.publish',
      pause: 'opportunity.pause',
      resume: 'opportunity.pause',
      archive: 'opportunity.manage',
    }
    const needed = permissionByAction[action]
    if (!needed) return jsonError('نوع العملية غير صحيح', 422)
    const actor = await requireForsahPermission(session, needed)
    await assertOpportunityOwnership(opportunity, actor)

    if (action === 'edit') {
      if (opportunity.status === 'CLOSED' || opportunity.status === 'ARCHIVED') {
        return jsonError('لا يمكن تعديل فرصة مغلقة أو مؤرشفة', 409)
      }
      const parsed = opportunitySchema.safeParse(body?.data ?? {})
      if (!parsed.success) {
        return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
      }
      const data = parsed.data
      const hospital = await db.hospital.findUnique({ where: { id: data.hospitalId }, select: { id: true } })
      if (!hospital) return jsonError('الجهة الصحية غير موجودة', 422)
      // الجولة 67: الاسم يُعاد توليده تلقائياً من القسم/التخصص بعد كل تعديل
      const title = await computeOpportunityTitle({
        audience: data.audience,
        departmentId: data.departmentId || null,
        specialtyId: data.specialtyId || null,
      })
      const updated = await db.opportunity.update({
        where: { id },
        data: {
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
        },
        include: OPPORTUNITY_INCLUDE,
      })
      await logForsahAudit({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'OPPORTUNITY_UPDATED',
        entityType: 'Opportunity',
        entityId: id,
        meta: { number: opportunity.number },
      })
      return NextResponse.json({ message: 'حُفظت تعديلات الفرصة', opportunity: updated })
    }

    if (action === 'publish') {
      if (opportunity.status !== 'DRAFT' && opportunity.status !== 'PAUSED') {
        return jsonError('الفرصة منشورة بالفعل أو في حالة لا تسمح بالنشر', 409)
      }
      // فحص اكتمال النشر — لا نشر بلا جهة أو عنوان
      if (!opportunity.hospitalId || !opportunity.title) {
        return jsonError('أكمل بيانات الفرصة قبل النشر (العنوان + الجهة الصحية)', 422)
      }
      const published = await db.opportunity.update({
        where: { id },
        data: {
          status: 'PUBLISHED',
          publishedAt: opportunity.publishedAt ?? new Date(),
          pausedAt: null,
        },
        include: OPPORTUNITY_INCLUDE,
      })
      await logForsahAudit({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'OPPORTUNITY_PUBLISHED',
        entityType: 'Opportunity',
        entityId: id,
        meta: { number: opportunity.number },
      })
      // إشعار المؤهلين فقط (Eligibility Engine يقود التوزيع — المواصفة 7/37)
      const audienceRole = opportunity.audience === 'DOCTOR' ? 'DOCTOR' : 'NURSE'
      const candidates = await db.user.findMany({
        where: { role: audienceRole, status: 'APPROVED' },
        select: { id: true, gender: true },
      })
      const link = opportunity.audience === 'DOCTOR' ? '/doctor/opportunities' : '/nurse/opportunities'
      const candidateIds: string[] = []
      for (const c of candidates) {
        const full = await buildCandidate(c.id)
        if (!full) continue
        const result = evaluateOpportunityEligibility(full, {
          audience: opportunity.audience,
          gender: opportunity.gender,
          specialtyId: opportunity.specialtyId,
          departmentId: opportunity.departmentId,
          qualificationId: opportunity.qualificationId,
          minYearsExperience: opportunity.minYearsExperience,
          licenseRequired: opportunity.licenseRequired,
          qualificationName: opportunity.qualification?.name ?? null,
        })
        if (result.eligible) candidateIds.push(c.id)
      }
      await Promise.allSettled(
        candidateIds.map((userId) =>
          notify(userId, {
            title: 'فرصة عمل جديدة تناسب ملفك',
            body: `«${opportunity.title}» — ${opportunity.hospital.name} — استعرض التفاصيل وقدّم الآن`,
            type: 'OPPORTUNITY_PUBLISHED',
            link,
          })
        )
      )
      return NextResponse.json({
        message: `نُشرت الفرصة وأُشعر ${candidateIds.length} مؤهلاً بها`,
        opportunity: published,
      })
    }

    if (action === 'pause') {
      if (opportunity.status !== 'PUBLISHED' && opportunity.status !== 'ACTIVE') {
        return jsonError('الفرصة ليست في حالة قابلة للإيقاف المؤقت', 409)
      }
      const paused = await db.opportunity.update({
        where: { id },
        data: { status: 'PAUSED', pausedAt: new Date() },
        include: OPPORTUNITY_INCLUDE,
      })
      await logForsahAudit({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'OPPORTUNITY_PAUSED',
        entityType: 'Opportunity',
        entityId: id,
        meta: { number: opportunity.number },
      })
      return NextResponse.json({ message: 'أُوقفت الفرصة مؤقتاً — لا تقديم جديد حتى الاستئناف', opportunity: paused })
    }

    if (action === 'resume') {
      if (opportunity.status !== 'PAUSED') {
        return jsonError('الفرصة ليست متوقفة مؤقتاً', 409)
      }
      const resumed = await db.opportunity.update({
        where: { id },
        data: { status: 'PUBLISHED', pausedAt: null },
        include: OPPORTUNITY_INCLUDE,
      })
      await logForsahAudit({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'OPPORTUNITY_RESUMED',
        entityType: 'Opportunity',
        entityId: id,
        meta: { number: opportunity.number },
      })
      return NextResponse.json({ message: 'استؤنف نشر الفرصة', opportunity: resumed })
    }

    // archive — إدارية فقط (بعد الإغلاق)
    if (opportunity.status !== 'CLOSED') {
      return jsonError('الأرشفة تتم للفرص المغلقة فقط', 409)
    }
    const archived = await db.opportunity.update({
      where: { id },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
      include: OPPORTUNITY_INCLUDE,
    })
    await logForsahAudit({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'OPPORTUNITY_ARCHIVED',
      entityType: 'Opportunity',
      entityId: id,
      meta: { number: opportunity.number },
    })
    return NextResponse.json({ message: 'أُرشفت الفرصة — البيانات محفوظة كاملة', opportunity: archived })
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * DELETE /api/opportunities/[id] — حذف نهائي للفرص المغلقة/المؤرشفة (الجولة 69)
 * ============================================================
 * الإدارة المنفّذة حصراً + تأكيد إلزامي بكلمة مرورها (عملية لا رجعة فيها).
 * حفاظاً على السجلات بلا أي فقد بيانات (قاعدة ADDITIVE):
 * - الحذف مسموح حصراً للفرص CLOSED أو ARCHIVED — النشطة تُغلق أولاً.
 * - لقطة JSON كاملة (الفرصة + الطلبات + المقابلات + الاختيارات + العمليات
 *   المالية بكل حقولها) تُخزَّن في opportunity_deletion_archives قبل الحذف.
 * - المعاملة واحدة: إما أرشفة + حذف معاً أو لا شيء.
 * - سجل التدقيق نصي بلا FK — يبقى كاملاً مع إدخال OPPORTUNITY_DELETED دائم.
 * - مالك الفرصة (HR) يُشعَر دائماً أن فرصته حُذفت من الإدارة.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('ADMIN')
    const { id } = await params
    // الجولة 67: الإغلاق الكلي — الإدارة مستثناة دائماً
    await assertForsahEnabled('ADMIN')

    if (!rateLimit(`forsah:opp-delete:${session.user.id}`, 10, 60 * 60 * 1000)) {
      return jsonError('محاولات كثيرة — انتقل دقيقة وأعد المحاولة', 429)
    }

    const parsed = hrDeleteSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'كلمة مرور الإدارة مطلوبة لتأكيد الحذف', 422)
    }

    // الفرصة مع كل سجلاتها — للفحص ولقطة الأرشيف الكاملة
    const opportunity = await db.opportunity.findUnique({
      where: { id },
      include: {
        hospital: { select: { name: true } },
        createdBy: { select: { name: true } },
        applications: true,
        interviews: true,
        selections: true,
        transactions: true,
      },
    })
    if (!opportunity) return jsonError('الفرصة غير موجودة', 404)

    // الحذف النهائي للمغلقة/المؤرشفة حصراً — النشطة تُغلق أولاً من التبويب نفسه
    if (opportunity.status !== 'CLOSED' && opportunity.status !== 'ARCHIVED') {
      return jsonError('الحذف النهائي يتم للفرص المغلقة أو المؤرشفة فقط — أغلق الفرصة أولاً', 409)
    }

    // التأكيد بكلمة مرور الإدارة المنفّذة — حصراً (نمط حذف HR — الجولة 68)
    const admin = await db.user.findUnique({
      where: { id: session.user.id },
      select: { password: true },
    })
    if (!admin?.password) {
      return jsonError('حسابك بلا كلمة مرور محلية — عيّن كلمة مرور أولاً لتأكيد عمليات الحذف', 403)
    }
    const ok = await bcrypt.compare(parsed.data.password, admin.password)
    if (!ok) return jsonError('كلمة مرور الإدارة غير صحيحة — أُلغي الحذف', 403)

    const counts = {
      applications: opportunity.applications.length,
      interviews: opportunity.interviews.length,
      selections: opportunity.selections.length,
      transactions: opportunity.transactions.length,
    }

    // معاملة الحذف الحفاظية: لقطة كاملة أولاً ثم الحذف — أو لا شيء
    await db.$transaction(async (tx) => {
      await tx.opportunityDeletionArchive.create({
        data: {
          opportunityId: opportunity.id,
          number: opportunity.number,
          title: opportunity.title,
          hospitalName: opportunity.hospital.name,
          audience: opportunity.audience,
          status: opportunity.status,
          createdByName: opportunity.createdBy?.name ?? null,
          snapshotJson: JSON.stringify(opportunity),
          applicationsCount: counts.applications,
          interviewsCount: counts.interviews,
          selectionsCount: counts.selections,
          transactionsCount: counts.transactions,
          deletedById: session.user.id,
          deletedByRole: 'ADMIN',
        },
      })
      await tx.opportunity.delete({ where: { id } })
    })

    await logForsahAudit({
      actorId: session.user.id,
      actorRole: 'ADMIN',
      action: 'OPPORTUNITY_DELETED',
      entityType: 'Opportunity',
      entityId: id,
      meta: { number: opportunity.number, title: opportunity.title, ...counts },
    })

    // إشعار مالك الفرصة إن كان غير المنفّذ — الفرصة السابقة حُذفت مع حفظ لقطتها
    if (opportunity.createdById !== session.user.id) {
      await notify(opportunity.createdById, {
        title: 'حُذفت فرصة سابقة من الإدارة',
        body: `«${opportunity.title}» (فرصة ${opportunity.number}) — حُذفت نهائياً من الإدارة بعد إغلاقها، ولقطتها الكاملة محفوظة في أرشيف الحذف.`,
        type: 'OPPORTUNITY_CLOSED',
        link: '/hr/opportunities',
      })
    }

    return NextResponse.json({
      message: `حُذفت «فرصة ${opportunity.number}» نهائياً — لقطة كاملة (${counts.applications} طلب، ${counts.transactions} عملية مالية) محفوظة في أرشيف الحذف`,
      counts,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
