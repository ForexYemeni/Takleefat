import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError } from '@/lib/api-helpers'

/**
 * GET /api/admin/withdrawals — جميع طلبات سحب أرباح المستلمين الإداريين
 * تعرض المبلغ ورقم الحساب وعنوان المحفظة وبيانات المستلم.
 */
export async function GET() {
  try {
    await requireRole('ADMIN')

    const withdrawals = await db.withdrawal.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        receiver: { select: { id: true, name: true, phone: true } },
      },
    })

    return NextResponse.json({ withdrawals })
  } catch (error) {
    return handleApiError(error)
  }
}
