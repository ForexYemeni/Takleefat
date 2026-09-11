import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'

/**
 * DELETE /api/me/documents/[id]
 * حذف مستند قيد المراجعة (للكادر التمريضي المالك فقط)
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('NURSE', 'DOCTOR')
    const { id } = await params

    const document = await db.document.findUnique({ where: { id } })
    if (!document) {
      return jsonError('المستند غير موجود', 404)
    }
    if (document.userId !== session.user.id) {
      return jsonError('ليست لديك صلاحية على هذا المستند', 403)
    }
    if (document.status === 'APPROVED') {
      return jsonError('لا يمكن حذف مستند معتمد', 409)
    }

    await db.document.delete({ where: { id } })

    return NextResponse.json({ message: 'تم حذف المستند' })
  } catch (error) {
    return handleApiError(error)
  }
}
