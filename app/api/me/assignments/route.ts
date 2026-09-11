import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError } from '@/lib/api-helpers'
import { getSettings } from '@/lib/settings'

/**
 * GET /api/me/assignments
 * تكليفات المستخدم الحالي (الكادر التمريضي أو المستلم الإداري)
 * تشمل البيانات المالية (القيمة، حصة الإدارة، حالة الدفع).
 */
export async function GET() {
  try {
    const session = await requireRole('NURSE', 'RECEIVER', 'DOCTOR', 'DOCTOR_SUPERVISOR')
    const isNurse = session.user.role === 'NURSE'

    const [assignments, settings] = await Promise.all([
      db.assignment.findMany({
        where: isNurse ? { nurseId: session.user.id } : { receiverId: session.user.id },
        orderBy: { createdAt: 'desc' },
        include: {
          nurse: { select: { id: true, name: true, specialty: true, phone: true } },
          receiver: { select: { id: true, name: true, phone: true } },
          post: { select: { id: true, title: true } },
          rating: {
            select: { overall: true, comment: true, createdAt: true },
          },
          earning: {
            select: { amount: true, percent: true },
          },
        },
      }),
      getSettings(),
    ])

    return NextResponse.json({ assignments, settings })
  } catch (error) {
    return handleApiError(error)
  }
}
