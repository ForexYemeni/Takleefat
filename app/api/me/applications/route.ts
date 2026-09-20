import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError } from '@/lib/api-helpers'
import { getSettings, calcAdminFee, calcApplicationFee } from '@/lib/settings'
import {
  isAssignmentContactOpen,
  isAssignmentFeelessActive,
  receiverPhoneForStaff,
} from '@/lib/phone-privacy'

/**
 * GET /api/me/applications — تقديمات الكادر الصحي/الطبيب الحالي
 * تشمل بيانات التكليف المُعلن + تفاصيل الدفع بعد الاعتماد.
 * الجولة 48 (البلاغ الحرفي: «في تقديماتي يبقى رقم التواصل مغلق رغم انه تم
 * تاكيد الدفع»): كل تقديم يُربط بتكليفه الفعلي إن وُجد، ويُفتح رقم
 * المستلم/المشرف بالقاعدة الموحدة isAssignmentContactOpen: بعد تأكيد
 * الإدارة سداد الرسوم (أو بلا أي رسوم) أثناء سير التكليف حصراً، ويُغلق
 * تلقائياً فور الإنهاء/الإلغاء — تناظر كامل مع مسار التكليفات.
 * كما يُرسل ملخص التكليف المرتبط (assignment) للواجهة لتمييز احترافي
 * بين التكليفات بلا رسوم والتكليفات ذات الرسوم في تقديماتي.
 */
export async function GET() {
  try {
    const session = await requireRole('NURSE', 'DOCTOR')

    const [applications, settings] = await Promise.all([
      db.application.findMany({
        where: { nurseId: session.user.id },
        orderBy: { createdAt: 'desc' },
        include: {
          post: {
            select: {
              id: true,
              title: true,
              description: true,
              facility: true,
              department: true,
              location: true,
              startDate: true,
              value: true,
              status: true,
              receiver: { select: { id: true, name: true, phone: true } },
            },
          },
        },
      }),
      getSettings(),
    ])

    // الجولة 48: تكليفات الكادر المرتبطة بهذه التقديمات (نفس المنشور + نفس الكادر)
    // — مصدر الحقيقة لحالة السداد والرسوم المحفوظة وقت الاعتماد
    const postIds = [...new Set(applications.map((a) => a.post.id))]
    const linkedAssignments = postIds.length
      ? await db.assignment.findMany({
          where: {
            nurseId: session.user.id,
            postId: { in: postIds },
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            postId: true,
            status: true,
            paymentStatus: true,
            adminFee: true,
            value: true,
            createdAt: true,
          },
        })
      : []

    // أفضل تكليف مرتبط لكل منشور: الساري أولاً (RECEIVED/ACTIVE) ثم الأحدث
    const activeStatuses = new Set(['RECEIVED', 'ACTIVE'])
    const assignmentByPost = new Map<string, (typeof linkedAssignments)[number]>()
    for (const a of linkedAssignments) {
      if (!a.postId) continue
      const current = assignmentByPost.get(a.postId)
      if (!current || (activeStatuses.has(a.status) && !activeStatuses.has(current.status))) {
        assignmentByPost.set(a.postId, a)
      }
    }

    const applicationFee = calcApplicationFee(settings)

    // حساب المبلغ الواجب لكل تقديم — يُحصّل نوع واحد فقط حسب نمط الرسوم
    const enriched = applications.map((app) => {
      const adminFee = calcAdminFee(app.post.value, settings)
      const linked = assignmentByPost.get(app.post.id) ?? null
      return {
        ...app,
        fees: {
          value: app.post.value,
          adminFee,
          applicationFee,
          dueToAdmin: adminFee + applicationFee,
          netForNurse: app.post.value - adminFee - applicationFee,
        },
        // الجولة 48: ملخص التكليف المرتبط + حالة فتح الاتصال بالقاعدة الموحدة
        assignment: linked
          ? {
              id: linked.id,
              status: linked.status,
              paymentStatus: linked.paymentStatus,
              adminFee: linked.adminFee,
              value: linked.value,
              feeless: isAssignmentFeelessActive(linked, applicationFee),
            }
          : null,
        post: {
          ...app.post,
          receiver: {
            ...app.post.receiver,
            ...receiverPhoneForStaff(
              app.post.receiver.phone,
              linked ? isAssignmentContactOpen(linked, applicationFee) : false
            ),
          },
        },
      }
    })

    return NextResponse.json({ applications: enriched, settings })
  } catch (error) {
    return handleApiError(error)
  }
}
