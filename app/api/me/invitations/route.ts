import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError } from '@/lib/api-helpers'

/**
 * استدعاءات الكادر | Nurse Invitations
 * GET /api/me/invitations — كل استدعاءات الكادر الحالي بتفاصيل التكليف
 * (الرد على الاستدعاء في /api/me/invitations/[id])
 */

export async function GET() {
  try {
    const session = await requireRole('NURSE')

    const invitations = await db.nurseInvitation.findMany({
      where: { nurseId: session.user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        post: {
          select: {
            id: true, number: true, title: true, facility: true, department: true,
            location: true, startDate: true, hours: true, gender: true, value: true,
            status: true, description: true,
            receiver: { select: { id: true, name: true } },
          },
        },
      },
    })

    const pending = invitations.filter((i) => i.status === 'PENDING').length
    return NextResponse.json({ invitations, pending })
  } catch (error) {
    return handleApiError(error)
  }
}
