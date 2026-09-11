import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { notify } from '@/lib/notifications'
import { formatCurrency } from '@/lib/utils'

const createWithdrawalSchema = z.object({
  amount: z.coerce
    .number({ error: 'مبلغ السحب غير صحيح' })
    .int('مبلغ السحب يجب أن يكون رقماً صحيحاً')
    .min(1, 'مبلغ السحب يجب أن يكون أكبر من صفر')
    .max(999_999_999, 'المبلغ كبير جداً'),
  // عنوان المحفظة ورقم الحساب — يُحفظان بشكل رئيسي للسحب
  walletAddress: z
    .string({ error: 'عنوان المحفظة مطلوب' })
    .min(3, 'عنوان المحفظة مطلوب')
    .max(120, 'عنوان المحفظة طويل جداً'),
  accountNumber: z
    .string({ error: 'رقم الحساب مطلوب' })
    .min(3, 'رقم الحساب مطلوب')
    .max(60, 'رقم الحساب طويل جداً'),
})

/**
 * GET /api/receiver/withdrawals — طلبات سحب المستلم الإداري الحالي
 */
export async function GET() {
  try {
    const session = await requireRole('RECEIVER', 'DOCTOR_SUPERVISOR')
    const withdrawals = await db.withdrawal.findMany({
      where: { receiverId: session.user.id },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ withdrawals })
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * POST /api/receiver/withdrawals — طلب سحب الأرباح
 * يتحقق من الرصيد المتاح (إجمالي الأرباح − المسحوب − قيد المعالجة)
 * ويحفظ عنوان المحفظة ورقم الحساب بشكل رئيسي للسحب.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole('RECEIVER', 'DOCTOR_SUPERVISOR')

    const parsed = createWithdrawalSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }
    const { amount, walletAddress, accountNumber } = parsed.data

    const [earnings, withdrawals] = await Promise.all([
      db.receiverEarning.aggregate({
        where: { receiverId: session.user.id },
        _sum: { amount: true },
      }),
      db.withdrawal.findMany({
        where: { receiverId: session.user.id, status: { in: ['PENDING', 'PAID'] } },
        select: { amount: true, status: true },
      }),
    ])

    const totalEarned = earnings._sum.amount ?? 0
    const committed = withdrawals.reduce((sum, w) => sum + w.amount, 0)
    const available = Math.max(0, totalEarned - committed)

    if (amount > available) {
      return jsonError(
        `مبلغ السحب يتجاوز رصيدك المتاح (${formatCurrency(available)}) — لا يمكن طلب سحب غير متاح`,
        422
      )
    }

    const withdrawal = await db.$transaction(async (tx) => {
      // حفظ بيانات المحفظة والحساب بشكل رئيسي للسحب
      await tx.user.update({
        where: { id: session.user.id },
        data: { walletAddress, accountNumber },
      })
      return tx.withdrawal.create({
        data: {
          receiverId: session.user.id,
          amount,
          walletAddress,
          accountNumber,
          status: 'PENDING',
        },
      })
    })

    // إشعار الإدارة بطلب السحب
    const admins = await db.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
    await Promise.all(
      admins.map((admin) =>
        notify(admin.id, {
          title: 'طلب سحب أرباح جديد',
          body: `${session.user.name} طلب سحب أرباح بمبلغ ${formatCurrency(amount)} — رقم الحساب: ${accountNumber} — عنوان المحفظة: ${walletAddress}`,
          type: 'GENERIC',
          link: '/admin/assignments',
        })
      )
    )

    return NextResponse.json(
      { message: 'تم إرسال طلب السحب بنجاح — سيُراجع من إدارة المنصة', withdrawal },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
