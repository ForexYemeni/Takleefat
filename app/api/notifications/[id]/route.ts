import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSession, handleApiError, jsonError } from '@/lib/api-helpers'

/**
 * DELETE /api/notifications/[id] — حذف إشعار واحد للمستخدم الحالي
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession()
    const { id } = await params

    const notification = await db.notification.findUnique({ where: { id } })
    if (!notification || notification.userId !== session.user.id) {
      return jsonError('الإشعار غير موجود', 404)
    }

    await db.notification.delete({ where: { id } })
    return NextResponse.json({ message: 'تم حذف الإشعار' })
  } catch (error) {
    return handleApiError(error)
  }
}
