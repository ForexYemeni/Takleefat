import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError } from '@/lib/api-helpers'

/**
 * GET /api/me/ratings — تقييمات الكادر التمريضي (لملفي الشخصي)
 * جميع التقييمات الممنوحة من المستلمين الإداريين + المتوسط العام.
 */
export async function GET() {
  try {
    const session = await requireRole('NURSE')

    const ratings = await db.nurseRating.findMany({
      where: { nurseId: session.user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        receiver: { select: { name: true } },
        assignment: { select: { id: true, title: true, facility: true } },
      },
    })

    const count = ratings.length
    const average =
      count > 0
        ? Math.round((ratings.reduce((sum, r) => sum + r.overall, 0) / count) * 10) / 10
        : 0

    return NextResponse.json({ ratings, average, count })
  } catch (error) {
    return handleApiError(error)
  }
}
