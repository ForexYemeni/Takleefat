import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError } from '@/lib/api-helpers'

/**
 * GET /api/me/assignments
 * تكليفات المستخدم الحالي (الكادر التمريضي أو المستلم الإداري)
 */
export async function GET() {
  try {
    const session = await requireRole('NURSE', 'RECEIVER')
    const isNurse = session.user.role === 'NURSE'

    const assignments = await db.assignment.findMany({
      where: isNurse ? { nurseId: session.user.id } : { receiverId: session.user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        nurse: { select: { id: true, name: true, specialty: true } },
        receiver: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json({ assignments })
  } catch (error) {
    return handleApiError(error)
  }
}
