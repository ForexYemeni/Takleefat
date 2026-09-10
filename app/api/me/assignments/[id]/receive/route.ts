import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { notify, notifyAdmins } from '@/lib/notifications'
import { ASSIGNMENT_STATUS_LABELS } from '@/lib/utils'

/**
 * POST /api/me/assignments/[id]/receive
 * تأكيد استلام التكليف من المستلم الإداري
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('RECEIVER')
    const { id } = await params

    const assignment = await db.assignment.findUnique({
      where: { id },
      include: { nurse: { select: { id: true, name: true } } },
    })

    if (!assignment) {
      return jsonError('التكليف غير موجود', 404)
    }

    if (assignment.receiverId !== session.user.id) {
      return jsonError('ليست لديك صلاحية على هذا التكليف', 403)
    }

    if (assignment.status !== 'ACTIVE') {
      return jsonError('لا يمكن استلام تكليف تم استلامه أو إنجازه مسبقاً', 409)
    }

    const updated = await db.assignment.update({
      where: { id },
      data: { status: 'RECEIVED', receivedAt: new Date() },
    })

    await db.assignmentLog.create({
      data: {
        assignmentId: id,
        userId: session.user.id,
        action: 'تأكيد الاستلام',
        note: `تم استلام التكليف من قبل ${session.user.name}`,
      },
    })

    // إشعار الكادر التمريضي والمدير
    await notify(assignment.nurseId, {
      title: 'تم استلام التكليف',
      body: `تم تأكيد استلام تكليف "${assignment.title}" من قبل المستلم الإداري`,
      type: 'ASSIGNMENT_RECEIVED',
      link: '/nurse/assignments',
    })
    await notify(assignment.createdById, {
      title: 'تم استلام تكليف',
      body: `تم استلام تكليف "${assignment.title}" بنجاح`,
      type: 'ASSIGNMENT_RECEIVED',
      link: '/admin/assignments',
    })
    // الجولة الخامسة عشرة: بقية المديرين يرون الاستلام (غير مُنشئ التكليف المُشعَر أعلاه)
    await notifyAdmins(
      {
        title: 'استلام تكليف',
        body: `استلم المستلم الإداري تكليف "${assignment.title}" من الكادر`,
        type: 'ASSIGNMENT_RECEIVED',
        link: '/admin/assignments',
      },
      assignment.createdById
    )

    return NextResponse.json({
      message: `تم تأكيد الاستلام — الحالة الآن: ${ASSIGNMENT_STATUS_LABELS[updated.status]}`,
      assignment: updated,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
