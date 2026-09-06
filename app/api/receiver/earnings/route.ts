import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError } from '@/lib/api-helpers'
import { getSettings } from '@/lib/settings'

/**
 * GET /api/receiver/earnings — قسم أرباحي (المستلم الإداري)
 * إجمالي الأرباح (نسبة من كل تكليف تُحتسب من حساب الإدارة) + الرصيد المتاح للسحب
 * + قائمة أرباح التكليفات + طلبات السحب السابقة + بيانات المحفظة المحفوظة.
 */
export async function GET() {
  try {
    const session = await requireRole('RECEIVER')

    const [earnings, withdrawals, settings, me] = await Promise.all([
      db.receiverEarning.findMany({
        where: { receiverId: session.user.id },
        orderBy: { createdAt: 'desc' },
        include: {
          assignment: { select: { id: true, title: true, facility: true, value: true } },
        },
      }),
      db.withdrawal.findMany({
        where: { receiverId: session.user.id },
        orderBy: { createdAt: 'desc' },
      }),
      getSettings(),
      db.user.findUnique({
        where: { id: session.user.id },
        select: { walletAddress: true, accountNumber: true },
      }),
    ])

    const totalEarned = earnings.reduce((sum, e) => sum + e.amount, 0)
    const withdrawn = withdrawals
      .filter((w) => w.status === 'PAID')
      .reduce((sum, w) => sum + w.amount, 0)
    const pending = withdrawals
      .filter((w) => w.status === 'PENDING')
      .reduce((sum, w) => sum + w.amount, 0)
    const available = Math.max(0, totalEarned - withdrawn - pending)

    return NextResponse.json({
      summary: {
        totalEarned,
        withdrawn,
        pending,
        available,
        sharePercent: settings.receiverSharePercent,
      },
      earnings: earnings.map((e) => ({
        id: e.id,
        amount: e.amount,
        percent: e.percent,
        createdAt: e.createdAt,
        assignment: e.assignment,
      })),
      withdrawals,
      wallet: {
        walletAddress: me?.walletAddress ?? '',
        accountNumber: me?.accountNumber ?? '',
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
