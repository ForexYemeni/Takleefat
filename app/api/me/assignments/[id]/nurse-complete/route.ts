import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { notify, notifyAdmins } from '@/lib/notifications'
import { formatDateTime } from '@/lib/utils'

const nurseCompleteSchema = z.object({
  // تأكيد استلام مبلغ التكليف من الجهة المعنية — إلزامي
  receivedAmount: z.literal(true, {
    error: 'يجب تأكيد استلام مبلغ التكليف',
  }),
  note: z.string().max(500).optional().or(z.literal('')),
})

/**
 * POST /api/me/assignments/[id]/nurse-complete
 * تأكيد الكادر التمريضي: تم الانتهاء من التكليف وتم استلام مبلغ التكليف.
 * يُسجَّل التأكيد ويُشعَر المستلم الإداري والإدارة — بلا تغيير الحالة النهائية
 * (الإنهاء الرسمي يتم من المستلم الإداري عبر receiver-complete).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('NURSE', 'DOCTOR')
    const { id } = await params

    const parsed = nurseCompleteSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const assignment = await db.assignment.findUnique({ where: { id } })
    if (!assignment) return jsonError('التكليف غير موجود', 404)
    if (assignment.nurseId !== session.user.id) {
      return jsonError('ليست لديك صلاحية على هذا التكليف', 403)
    }
    if (assignment.status === 'CANCELLED') {
      return jsonError('لا يمكن تأكيد إنهاء تكليف ملغى', 409)
    }
    if (assignment.nurseDoneAt) {
      return jsonError('لقد أكدت إنهاء هذا التكليف مسبقاً', 409)
    }

    const updated = await db.assignment.update({
      where: { id },
      data: {
        nurseDoneAt: new Date(),
        nurseConfirmedReceipt: true,
      },
    })

    await db.assignmentLog.create({
      data: {
        assignmentId: id,
        userId: session.user.id,
        action: 'تأكيد إنهاء التكليف من الكادر',
        note: parsed.data.note?.trim() || 'أكد الكادر انتهاء التكليف واستلام مبلغ التكليف',
      },
    })

    await Promise.all([
      notify(assignment.receiverId, {
        title: 'الكادر أنهى التكليف',
        body: `أكد ${session.user.name} انتهاء التكليف (${assignment.title}) واستلام مبلغ التكليف بتاريخ ${formatDateTime(updated.nurseDoneAt!)} — يمكنك الآن إنهاء التكليف وتقييم الكادر`,
        type: 'ASSIGNMENT_COMPLETED',
        link: '/receiver/assignments',
      }),
      notify(assignment.createdById, {
        title: 'تأكيد إنهاء تكليف من الكادر',
        body: `أكد ${session.user.name} انتهاء التكليف (${assignment.title}) واستلام المبلغ`,
        type: 'ASSIGNMENT_COMPLETED',
        link: '/admin/assignments',
      }),
    ])
    // الجولة الخامسة عشرة: بقية المديرين يرون تأكيد الكادر (غير مُنشئ التكليف المُشعَر أعلاه)
    await notifyAdmins(
      {
        title: 'الكادر أنهى تكليفاً',
        body: `أكد ${session.user.name} انتهاء التكليف (${assignment.title}) واستلام المبلغ`,
        type: 'ASSIGNMENT_COMPLETED',
        link: '/admin/assignments',
      },
      assignment.createdById
    )

    return NextResponse.json({
      message: 'تم تسجيل انتهاء التكليف واستلام المبلغ بنجاح — شكراً لك',
      assignment: { id: updated.id, nurseDoneAt: updated.nurseDoneAt },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
