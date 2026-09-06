import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { notify } from '@/lib/notifications'
import { formatCurrency, formatDateTime } from '@/lib/utils'

const patchSchema = z.object({
  status: z.enum(['PAID', 'REJECTED'], { error: 'الحالة غير صحيحة' }),
  note: z.string().max(400).optional().or(z.literal('')),
})

/**
 * PATCH /api/admin/withdrawals/[id]
 * معالجة طلب سحب أرباح المستلم الإداري: تم الدفع / مرفوض — مع إشعار المستلم.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole('ADMIN')
    const { id } = await params

    const parsed = patchSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }
    const { status, note } = parsed.data

    const withdrawal = await db.withdrawal.findUnique({
      where: { id },
      include: { receiver: { select: { id: true, name: true } } },
    })
    if (!withdrawal) return jsonError('طلب السحب غير موجود', 404)
    if (withdrawal.status !== 'PENDING') {
      return jsonError('تمت معالجة طلب السحب مسبقاً', 409)
    }

    const updated = await db.withdrawal.update({
      where: { id },
      data: { status, note: note?.trim() || null, processedAt: new Date() },
    })

    await notify(withdrawal.receiverId, {
      title: status === 'PAID' ? 'تم صرف أرباحك' : 'تم رفض طلب السحب',
      body:
        status === 'PAID'
          ? `تم صرف طلب سحب أرباحك بمبلغ ${formatCurrency(withdrawal.amount)} إلى الحساب (${withdrawal.accountNumber}) — المحفظة (${withdrawal.walletAddress})${note?.trim() ? ` — ملاحظة: ${note.trim()}` : ''}`
          : `تم رفض طلب سحب أرباحك بمبلغ ${formatCurrency(withdrawal.amount)}.${note?.trim() ? ` السبب: ${note.trim()}` : ''}`,
      type: 'GENERIC',
      link: '/receiver/earnings',
    })

    return NextResponse.json({
      message:
        status === 'PAID'
          ? `تم تأكيد صرف ${formatCurrency(updated.amount)} للمستلم ${withdrawal.receiver.name}`
          : `تم رفض طلب السحب وإشعار ${withdrawal.receiver.name}`,
      withdrawal: updated,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * GET /api/admin/withdrawals/[id] — تفاصيل طلب سحب
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole('ADMIN')
    const { id } = await params

    const withdrawal = await db.withdrawal.findUnique({
      where: { id },
      include: { receiver: { select: { id: true, name: true, phone: true } } },
    })
    if (!withdrawal) return jsonError('طلب السحب غير موجود', 404)

    return NextResponse.json({ withdrawal })
  } catch (error) {
    return handleApiError(error)
  }
}
