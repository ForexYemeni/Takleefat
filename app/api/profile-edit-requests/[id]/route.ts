import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError, ApiError } from '@/lib/api-helpers'
import { profileEditDecisionSchema } from '@/lib/validations/user'
import { notify } from '@/lib/notifications'

/**
 * الجولة 74 — حسم طلب تعديل الملف المهني (إضافي بحت كلياً)
 * ============================================================
 * PATCH /api/profile-edit-requests/[id] — الإدارة أو الموارد البشرية
 *   { decision: 'APPROVED' | 'REJECTED', reviewNote? }
 *
 * APPROVED: تُطبَّق القيم المطلوبة على حساب صاحب الطلب فوراً (توثيق applied*
 * داخل الطلب لسجل شفاف دائم) + إشعار صاحب الطلب بالقيم الجديدة.
 * REJECTED: تُوثَّق ملاحظة المراجع ويُشعَر صاحب الطلب ليعيد الطلب بصيغة صحيحة.
 * الطلب المحسوم مسبقاً لا يُقبل حسمه مرة أخرى.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('ADMIN', 'HR')
    const { id } = await params

    const body = await req.json().catch(() => ({}))
    const parsed = profileEditDecisionSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }
    const { decision, reviewNote } = parsed.data

    const request = await db.profileEditRequest.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        userId: true,
        requestedSpecialty: true,
        requestedQualification: true,
        requestedYearsOfExperience: true,
        user: { select: { name: true, role: true } },
      },
    })
    if (!request) throw new ApiError('الطلب غير موجود', 404)
    if (request.status !== 'PENDING') {
      throw new ApiError('هذا الطلب محسوم مسبقاً ولا يمكن حسمه مرة أخرى', 409)
    }

    // ---------- الاعتماد: تطبيق القيم المطلوبة على الحساب + التوثيق ----------
    const appliedData =
      decision === 'APPROVED'
        ? {
            appliedSpecialty: request.requestedSpecialty,
            appliedQualification: request.requestedQualification,
            appliedYearsOfExperience: request.requestedYearsOfExperience,
          }
        : {}

    const [updated] = await db.$transaction([
      db.profileEditRequest.update({
        where: { id },
        data: {
          status: decision,
          reviewedById: session.user.id,
          reviewedAt: new Date(),
          reviewNote: reviewNote ?? null,
          ...appliedData,
        },
        select: { id: true, status: true },
      }),
      ...(decision === 'APPROVED'
        ? [
            db.user.update({
              where: { id: request.userId },
              data: {
                ...(request.requestedSpecialty !== null && {
                  specialty: request.requestedSpecialty,
                }),
                ...(request.requestedQualification !== null && {
                  qualification: request.requestedQualification,
                }),
                ...(request.requestedYearsOfExperience !== null && {
                  yearsOfExperience: request.requestedYearsOfExperience,
                }),
              },
              select: { id: true },
            }),
          ]
        : []),
    ])

    // ---------- إشعار صاحب الطلب بالنتيجة (داخلي + بريد + دفع) ----------
    const profileLink =
      request.user.role === 'DOCTOR' ? '/doctor/profile' : '/nurse/profile'
    const appliedSummary =
      [
        request.requestedSpecialty !== null && `التخصص: ${request.requestedSpecialty}`,
        request.requestedQualification !== null && `المؤهل: ${request.requestedQualification}`,
        request.requestedYearsOfExperience !== null &&
          `سنوات الخبرة: ${request.requestedYearsOfExperience}`,
      ]
        .filter(Boolean)
        .join(' — ') || 'التعديلات المطلوبة'

    try {
      if (decision === 'APPROVED') {
        await notify(request.userId, {
          title: '✅ تم اعتماد تعديل ملفك المهني',
          body: `تم تحديث بياناتك: ${appliedSummary} — تظهر الآن في ملفك وسيرتك الذاتية والبطاقة المهنية.`,
          type: 'PROFILE_EDIT_DECIDED',
          link: profileLink,
        })
      } else {
        await notify(request.userId, {
          title: '❌ تم رفض طلب تعديل ملفك المهني',
          body: reviewNote
            ? `سبب الرفض: ${reviewNote} — يمكنك تعديل بيانات الطلب وإرساله من جديد.`
            : 'راجع ملاحظات المراجعة وأعد إرسال الطلب بصيغة صحيحة من ملفك الشخصي.',
          type: 'PROFILE_EDIT_DECIDED',
          link: profileLink,
        })
      }
    } catch (e) {
      console.error('profile-edit decision notify failed:', e)
    }

    return NextResponse.json({
      message:
        decision === 'APPROVED'
          ? 'تم اعتماد الطلب وتطبيق التعديلات على حساب الطالب'
          : 'تم رفض الطلب — وصل الإشعار لصاحب الطلب',
      request: updated,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
