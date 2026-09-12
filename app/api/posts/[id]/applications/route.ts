import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError, ApiError } from '@/lib/api-helpers'
import { isTrustedViewer, phoneView, revealedStaffIds } from '@/lib/phone-privacy'

/**
 * GET /api/posts/[id]/applications — تقديمات التكليف المُعلن
 * للمستلم الإداري المالك (وللإدارة) — تشمل السيرة الذاتية الاحترافية:
 * البيانات، بيانات التواصل، المستندات كاملة لكل متقدم.
 * الجولة 34: أرقام المتقدمين تُقنّع للمالك — تُفتح بتكليف مسدد النسبة
 * بين الطرفين (lib/phone-privacy) — الإدارة ترى الأرقام دائماً.
 * الجولة 46 — البلاغ الحرفي: «عند التقديم على تكليف لأي كان كادر تمريضي
 * او طبيب يجب ان تظهر المستندات بشكل طبيعي جداً» — مستندات كل متقدم
 * تُرسل كاملة مع بقية السيرة (مثل كوادر الجهة) — الإخفاء بقي حصراً
 * لسياق تصفّح «كل الكوادر في المنصة» (/api/workforce).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('RECEIVER', 'ADMIN', 'DOCTOR_SUPERVISOR')
    const { id } = await params

    const post = await db.post.findUnique({
      where: { id },
      select: { id: true, receiverId: true, title: true, status: true },
    })
    if (!post) return jsonError('التكليف غير موجود', 404)

    if (
      (session.user.role === 'RECEIVER' || session.user.role === 'DOCTOR_SUPERVISOR') &&
      post.receiverId !== session.user.id
    ) {
      throw new ApiError('يمكنك عرض تقديمات تكليفاتك فقط', 403)
    }

    const applications = await db.application.findMany({
      where: { postId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        nurse: {
          select: {
            id: true,
            name: true,
            phone: true,
            gender: true,
            specialty: true,
            qualification: true,
            yearsOfExperience: true,
            createdAt: true,
            documents: {
              select: {
                id: true,
                type: true,
                title: true,
                fileUrl: true,
                fileName: true,
                fileSize: true,
                mimeType: true,
                status: true,
              },
              orderBy: { createdAt: 'desc' },
            },
            // أقسام عمل الكادر — تظهر في السيرة الذاتية (ممرض طوارئ/رقود/عناية...)
            workDepartments: {
              select: { department: { select: { id: true, name: true } } },
            },
            // السجل المهني — الجهات التي عمل بها مع سنوات العمل (الجولة الثامنة)
            // تُستثنى الطلبات قيد المراجعة — يظهر التاريخ المهني المعتمد فقط
            affiliations: {
              where: { status: { not: 'PENDING' } },
              orderBy: { createdAt: 'desc' },
              select: {
                status: true,
                workYears: true,
                hospital: { select: { name: true, type: true, city: true } },
              },
            },
            // التقييمات الاحترافية — تُضاف إلى السيرة الذاتية عند التقديم لأي تكليف
            ratingsReceived: {
              orderBy: { createdAt: 'desc' },
              select: {
                overall: true,
                punctuality: true,
                quality: true,
                communication: true,
                discipline: true,
                comment: true,
                createdAt: true,
                receiver: { select: { name: true } },
                assignment: { select: { title: true } },
              },
            },
          },
        },
      },
    })

    // ملخص التقييمات لكل متقدم (المتوسط + العدد + أحدث التعليقات) + علم المفضلة الخاص بالمستلم
    const favorites = await db.favoriteNurse.findMany({
      where: { receiverId: session.user.id },
      select: { nurseId: true },
    })
    const favSet = new Set(favorites.map((f) => f.nurseId))

    const applicationsWithRatings = applications.map((a) => {
      const rs = a.nurse.ratingsReceived
      const count = rs.length
      const average =
        count > 0
          ? Math.round((rs.reduce((s, r) => s + r.overall, 0) / count) * 10) / 10
          : 0
      const avg = (key: 'punctuality' | 'quality' | 'communication' | 'discipline') => {
        const vals = rs.map((r) => r[key]).filter((v): v is number => typeof v === 'number')
        return vals.length > 0
          ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10
          : null
      }
      const { ratingsReceived, affiliations, workDepartments, ...nurse } = a.nurse
      return {
        ...a,
        nurse: {
          ...nurse,
          affiliations,
          workDepartments: workDepartments.map((w) => w.department.name),
          isFavorite: favSet.has(a.nurse.id),
          ratings: {
            average,
            count,
            axes: {
              punctuality: avg('punctuality'),
              quality: avg('quality'),
              communication: avg('communication'),
              discipline: avg('discipline'),
            },
            latest: ratingsReceived.slice(0, 3).map((r) => ({
              overall: r.overall,
              comment: r.comment,
              createdAt: r.createdAt,
              receiverName: r.receiver.name,
              assignmentTitle: r.assignment.title,
            })),
          },
        },
      }
    })

    // applicationId = معرّف التقديم (تتوقعه بطاقة السيرة الذاتية في الواجهة)
    // الجولة 34: قناع أرقام المتقدمين للمالك — الإدارة ترى الأرقام كاملة
    // الجولة 36: «الموثوق جداً» يرى كل الأرقام
    let revealed: Set<string> = new Set()
    const trusted = await isTrustedViewer(session.user.id)
    if (session.user.role !== 'ADMIN') {
      revealed = await revealedStaffIds(
        session.user.id,
        applicationsWithRatings.map((a) => a.nurse.id),
        trusted
      )
    }

    // ---------- الجولة 46 — البلاغ الحرفي:
    // «عند التقديم على تكليف لأي كان كادر تمريضي او طبيب يجب ان تظهر
    // المستندات بشكل طبيعي جداً ... كوادر جهتي اتمكن من رؤية المستندات عادي جداً»:
    // كل من قدّم على تكليفِك يُراجَع سيرته ومستنداته بشكل طبيعي — مثل كوادر
    // الجهة تماماً: فالمستلم/المشرف يختار الكادر من بينهم ويحتاج رؤية
    // المستندات كاملة قبل الاعتماد (الإدارة ترى كل شيء دائماً).
    // الإخفاء بقي حصراً لسياق تصفّح «كل الكوادر في المنصة» (workforce).
    const verifiedMap = new Map<string, number>()
    if (session.user.role !== 'ADMIN') {
      const applicantIds = applicationsWithRatings.map((a) => a.nurse.id)
      if (applicantIds.length > 0) {
        const verifiedRows = await db.document.groupBy({
          by: ['userId'],
          where: { userId: { in: applicantIds }, status: 'APPROVED' },
          _count: { _all: true },
        })
        for (const v of verifiedRows) verifiedMap.set(v.userId, v._count._all)
      }
    }

    return NextResponse.json({
      applications: applicationsWithRatings.map((a) => {
        return {
          ...a,
          applicationId: a.id,
          nurse: {
            ...a.nurse,
            ...phoneView(session.user.role, a.nurse.phone, revealed.has(a.nurse.id), trusted),
            // الجولة 46: المستندات تُعرض بشكل طبيعي مع بقية السيرة —
            // مع شارات حالة المراجعة (معتمدة/مرفوضة/قيد المراجعة) لكل مستند
            documentsHidden: false,
            documentsVerified: (verifiedMap.get(a.nurse.id) ?? 0) > 0,
            approvedDocuments: verifiedMap.get(a.nurse.id) ?? 0,
          },
        }
      }),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
