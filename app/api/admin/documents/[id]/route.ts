import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { notify } from '@/lib/notifications'
import { DOCUMENT_STATUS_LABELS } from '@/lib/utils'

const reviewDocumentSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED'], { error: 'الحالة غير صحيحة' }),
  reviewNote: z.string().max(500).optional().or(z.literal('')),
})

/**
 * PATCH /api/admin/documents/[id]
 * اعتماد أو رفض مستند — مع إشعار صاحبه
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('ADMIN')
    const { id } = await params

    const parsed = reviewDocumentSchema.safeParse(await req.json())
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const document = await db.document.findUnique({ where: { id } })
    if (!document) return jsonError('المستند غير موجود', 404)

    const { status, reviewNote } = parsed.data
    if (status === 'REJECTED' && !reviewNote) {
      return jsonError('يجب إدخال سبب رفض المستند', 422)
    }

    const updated = await db.document.update({
      where: { id },
      data: {
        status,
        reviewNote: status === 'REJECTED' ? reviewNote : null,
        reviewedById: session.user.id,
        reviewedAt: new Date(),
      },
    })

    await notify(document.userId, {
      title: status === 'APPROVED' ? 'تم اعتماد مستندك' : 'تم رفض مستندك',
      body:
        status === 'APPROVED'
          ? `تم اعتماد المستند: ${document.title}`
          : `تم رفض المستند: ${document.title} — السبب: ${reviewNote}`,
      type: 'DOCUMENT_REVIEWED',
      link: '/nurse/documents',
    })

    return NextResponse.json({
      message: `تم تحديث حالة المستند إلى: ${DOCUMENT_STATUS_LABELS[status]}`,
      document: updated,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
