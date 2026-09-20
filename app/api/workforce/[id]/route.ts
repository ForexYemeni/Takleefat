import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { isTrustedViewer, phoneView, revealedStaffIds } from '@/lib/phone-privacy'
import { latestDocumentAccessRequest, logDocumentAccess, profilePhotoUrl } from '@/lib/document-access'

/**
 * GET /api/workforce/[id] — السيرة الذاتية الكاملة لكادر صحي أو طبيب
 * ------------------------------------------------------------------
 * الجولة 46 — البلاغ الحرفي:
 * «الكوادر في المنصة تخفى المستندات كاملة معدا انه موثق او لا تظهر مع
 * بقية السيرة ... كوادر جهتي اتمكن من رؤية المستندات عادي جداً»:
 *  - السيرة الذاتية (بقية البيانات) متاحة لكل مستلم إداري/مشرف أطباء —
 *    بلا شرط إذن «رؤية البيانات الكاملة» — والمطابقة الجمهورية باقية:
 *    المستلم → كادر صحي | مشرف الأطباء → أطباء.
 *  - الإدارة: ترى كل شيء دائماً.
 *
 * بوابة المستندات (الجولة 61 — السياسة المعتمدة من صاحب المنصة):
 *  - الإدارة: ترى المستندات دائماً.
 *  - المستلم/المشرف: محتوى المستندات مخفي نهائياً — يُفتح حصراً بمنح إداري
 *    صريح قائم (طلب رؤية بسبب معلن أقرّته الإدارة) — وتُسجَّل كل مشاهدة،
 *    ويبقى العَلم بجاهزية المستندات (شارات معتمدة/مرفوضة/قيد المراجعة)
 *    والصورة البروفايلية (باختيار صاحبها) معروضاً للشفافية.
 *    (تحل هذه القاعدة محل بوابة «نفس الجهة» للجولتين 45-46 — سجل المنح
 *    هو المصدر الوحيد للفتح، والسحب الإداري يسري فوراً.)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('ADMIN', 'RECEIVER', 'DOCTOR_SUPERVISOR')
    const { id } = await params

    const target = await db.user.findUnique({
      where: { id },
      select: { id: true, role: true, status: true },
    })
    if (!target || (target.role !== 'NURSE' && target.role !== 'DOCTOR')) {
      return jsonError('الحساب المطلوب ليس كادراً تمريضياً أو طبيباً', 404)
    }

    // ---------- مطابقة الجمهور (الجولة 46): المستلم → كادر | المشرف → طبيب ----------
    // الجولة 60: المطابقة على الوضع النشط (صاحب الصلاحية المركّبة يتصفح بحسب لوحته)
    if (session.user.role !== 'ADMIN') {
      const operatingRole = session.user.activeRole ?? session.user.role
      const permittedAudience =
        operatingRole === 'DOCTOR_SUPERVISOR' ? 'DOCTOR' : 'NURSE'
      if (target.role !== permittedAudience) {
        return jsonError(
          operatingRole === 'DOCTOR_SUPERVISOR'
            ? 'يمكنك عرض السير الذاتية للأطباء حصراً'
            : 'يمكنك عرض السير الذاتية للكادر الصحيي حصراً',
          403
        )
      }
    }

    const [user, documents, ratingsAgg, recentRatings, assignmentsCount] = await Promise.all([
      db.user.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          phone: true,
          gender: true,
          role: true,
          status: true,
          specialty: true,
          qualification: true,
          yearsOfExperience: true,
          createdAt: true,
          // الجولة 61: صورة البروفايل — يظهر رابطها لكل المشاهدات (اختيار صاحبها)
          profilePhotoBlobId: true,
          // أقسام عمل الكادر (ممرض طوارئ/رقود/عناية/مختبر...)
          workDepartments: {
            select: { department: { select: { id: true, name: true } } },
          },
          // تخصصات عمل الطبيب (منظومة الأطباء)
          workSpecialties: {
            select: { specialty: { select: { id: true, name: true } } },
          },
          // السجل المهني المعتمد — الطلبات قيد المراجعة مستثناة
          affiliations: {
            where: { status: { not: 'PENDING' } },
            orderBy: { createdAt: 'desc' },
            select: {
              status: true,
              workYears: true,
              createdAt: true,
              hospital: { select: { name: true, type: true, city: true } },
            },
          },
        },
      }),
      db.document.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          type: true,
          title: true,
          fileUrl: true,
          fileName: true,
          fileSize: true,
          mimeType: true,
          status: true,
          createdAt: true,
        },
      }),
      db.nurseRating.aggregate({
        where: { nurseId: id },
        _avg: { overall: true, punctuality: true, quality: true, communication: true, discipline: true },
        _count: true,
      }),
      db.nurseRating.findMany({
        where: { nurseId: id },
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: {
          id: true,
          overall: true,
          comment: true,
          createdAt: true,
          receiver: { select: { name: true } },
          assignment: { select: { title: true } },
        },
      }),
      db.assignment.count({ where: { nurseId: id } }),
    ])

    if (!user) return jsonError('الحساب غير موجود', 404)

    // الجولة 34: فتح رقم التواصل حسب قاعدة السداد — الإدارة ترى دائماً
    // الجولة 36: «الموثوق جداً» يرى الرقم دائماً حتى بعد إنهاء التكليفات
    // الجولة 45: التكليف بلا أي رسوم (عرض بدون رسوم) يفتح الرقم أثناء السير
    // الجولة 46: الإسناد المباشر بلا قيمة وبلا حصة يفتح الرقم أثناء السير أيضاً
    const trusted = await isTrustedViewer(session.user.id)
    let revealed = true
    if (session.user.role !== 'ADMIN' && !trusted) {
      const paid = await revealedStaffIds(session.user.id, [user.id])
      revealed = paid.has(user.id)
    }

    // الجولة 61 — سياسة المستندات الجديدة (بطلب صريح من صاحب المنصة):
    // مستندات الكادر مخفية عن المستلمين الإداريين ومشرفي الأطباء نهائياً —
    // تُفتح حصراً بمنح إداري صريح قائم (طلب رسمي بسبب معلن أقرّته الإدارة)،
    // وكل فتح لمحتوى المستندات بمنح يُسجَّل في سجل المشاهدات (شفافية كاملة).
    // (تحل هذه القاعدة محل بوابة «نفس الجهة» للجولتين 45-46.)
    let canSeeDocuments = session.user.role === 'ADMIN'
    const accessRequest = canSeeDocuments
      ? null
      : await latestDocumentAccessRequest(session.user.id, id)
    if (!canSeeDocuments) {
      canSeeDocuments = accessRequest?.status === 'APPROVED'
      if (canSeeDocuments && accessRequest) {
        await logDocumentAccess(accessRequest.id, session.user.id, id)
      }
    }
    const visibleDocs = canSeeDocuments ? documents : []
    const approvedDocsCount = documents.filter((d) => d.status === 'APPROVED').length

    // الجولة 61: فصل معرف صورة البروفايل عن بقية بيانات الملف — يُرسل رابطاً فقط
    const { profilePhotoBlobId, ...profileData } = user

    return NextResponse.json({
      profile: {
        ...profileData,
        // الجولة 61: رابط صورة البروفايل — يُقدَّم عامة من مسار الملفات (اختيار صاحبها)
        profilePhotoUrl: profilePhotoUrl(profilePhotoBlobId),
        ...phoneView(session.user.role, user.phone, revealed, trusted),
        workDepartments: user.workDepartments.map((w) => w.department.name),
        workSpecialties: user.workSpecialties.map((w) => w.specialty.name),
        assignmentsCount,
        ratings: {
          average: ratingsAgg._avg.overall ? Number(ratingsAgg._avg.overall.toFixed(2)) : null,
          count: ratingsAgg._count,
          axes: {
            punctuality: ratingsAgg._avg.punctuality ? Number(ratingsAgg._avg.punctuality.toFixed(2)) : null,
            quality: ratingsAgg._avg.quality ? Number(ratingsAgg._avg.quality.toFixed(2)) : null,
            communication: ratingsAgg._avg.communication ? Number(ratingsAgg._avg.communication.toFixed(2)) : null,
            discipline: ratingsAgg._avg.discipline ? Number(ratingsAgg._avg.discipline.toFixed(2)) : null,
          },
          latest: recentRatings.map((r) => ({
            overall: r.overall,
            comment: r.comment,
            createdAt: r.createdAt,
            receiverName: r.receiver.name,
            assignmentTitle: r.assignment.title,
          })),
        },
      },
      // الجولة 61: المستندات تُفتح بمنح إداري صريح حصراً — مع حالة الطلب للواجهة
      documents: visibleDocs,
      documentsHidden: !canSeeDocuments,
      documentsVerified: approvedDocsCount > 0,
      approvedDocuments: approvedDocsCount,
      documentStatuses: documents.map((d) => ({ type: d.type, status: d.status })),
      documentAccess: {
        status: accessRequest?.status ?? 'NONE',
        reviewNote: accessRequest?.reviewNote ?? null,
        requestedAt: accessRequest?.createdAt ?? null,
        decidedAt: accessRequest?.reviewedAt ?? null,
        canRequest: !canSeeDocuments && accessRequest?.status !== 'PENDING',
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
