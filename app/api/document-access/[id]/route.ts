import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { reviewDocumentAccessSchema } from '@/lib/validations/document-access'
import { notify } from '@/lib/notifications'

/**
 * قرار الإدارة في طلب رؤية المستندات — الجولة 61 | تكليفات | Takleefat
 * ============================================================
 * PATCH /api/document-access/[id] — للإدارة حصراً:
 *   { action: 'APPROVE' } — قبول الطلب ومنح الرؤية (من قيد المراجعة فقط)
 *   { action: 'REJECT'  } — رفض الطلب (من قيد المراجعة فقط)
 *   { action: 'REVOKE'  } — سحب منح قائم في أي وقت
 * مع ملاحظة اختيارية تصل للطالب، وإشعارات فورية للطالب وصاحب المستندات.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('ADMIN')
    const { id } = await params

    const parsed = reviewDocumentAccessSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }
    const { action, note } = parsed.data

    const request = await db.documentAccessRequest.findUnique({
      where: { id },
      include: {
        requester: { select: { id: true, name: true, role: true } },
        target: { select: { id: true, name: true, role: true } },
      },
    })
    if (!request) return jsonError('الطلب غير موجود', 404)

    if (action === 'APPROVE' && request.status !== 'PENDING') {
      return jsonError('يمكن قبول الطلبات قيد المراجعة فقط', 422)
    }
    if (action === 'REJECT' && request.status !== 'PENDING') {
      return jsonError('يمكن رفض الطلبات قيد المراجعة فقط', 422)
    }
    if (action === 'REVOKE' && request.status !== 'APPROVED') {
      return jsonError('يمكن سحب المنح المفعّلة فقط', 422)
    }

    const requesterLink =
      request.requester.role === 'DOCTOR_SUPERVISOR'
        ? '/supervisor/document-access'
        : '/receiver/document-access'
    const targetLink = request.target.role === 'DOCTOR' ? '/doctor/documents' : '/nurse/documents'

    const updated = await db.documentAccessRequest.update({
      where: { id },
      data: {
        status: action === 'APPROVE' ? 'APPROVED' : action === 'REJECT' ? 'REJECTED' : 'REVOKED',
        reviewNote: note?.trim() ? note.trim() : null,
        reviewedById: session.user.id,
        reviewedAt: new Date(),
      },
      select: { id: true, status: true, reviewedAt: true },
    })

    if (action === 'APPROVE') {
      // إشعار الطالب: منح الرؤية
      await notify(request.requester.id, {
        title: 'تمت الموافقة على طلبك',
        body: `أذنت الإدارة لك برؤية مستندات ${request.target.name} — يمكنك عرضها الآن من سيرته الذاتية`,
        type: 'DOCUMENT_ACCESS_DECIDED',
        link: requesterLink,
      })
      // إشعار صاحب المستندات: شفافية كاملة (اختيار صاحب المنصة — الجولة 61)
      await notify(request.target.id, {
        title: 'تم فتح مستنداتك لجهة طالبة',
        body: `أذنت الإدارة لـ${request.requester.name} برؤية مستنداتك بعد مراجعة طلبه — وكل مشاهدة لمستنداتك تُسجَّل`,
        type: 'DOCUMENT_ACCESS_GRANTED',
        link: targetLink,
      })
    } else if (action === 'REJECT') {
      await notify(request.requester.id, {
        title: 'تم رفض طلب رؤية المستندات',
        body: `رفضت الإدارة طلبك برؤية مستندات ${request.target.name}${note?.trim() ? ` — السبب: ${note.trim()}` : ''}`,
        type: 'DOCUMENT_ACCESS_DECIDED',
        link: requesterLink,
      })
    } else {
      // السحب — يصل للطالب وصاحب المستندات معاً
      await notify(request.requester.id, {
        title: 'سُحبت صلاحية رؤية المستندات',
        body: `سحبت الإدارة صلاحيتك برؤية مستندات ${request.target.name}${note?.trim() ? ` — السبب: ${note.trim()}` : ''}`,
        type: 'DOCUMENT_ACCESS_REVOKED',
        link: requesterLink,
      })
      await notify(request.target.id, {
        title: 'سُحبت صلاحية رؤية مستنداتك',
        body: `سحبت الإدارة صلاحية ${request.requester.name} برؤية مستنداتك — مستنداتك محمية الآن كالسابق`,
        type: 'DOCUMENT_ACCESS_REVOKED',
        link: targetLink,
      })
    }

    return NextResponse.json({
      message:
        action === 'APPROVE'
          ? 'تم منح الصلاحية — أصبح الطالب قادراً على رؤية مستندات هذا الكادر'
          : action === 'REJECT'
            ? 'تم رفض الطلب وإشعار الطالب'
            : 'تم سحب الصلاحية فوراً وإشعار الطرفين',
      request: updated,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
