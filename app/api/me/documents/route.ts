import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError } from '@/lib/api-helpers'

/**
 * GET /api/me/documents — مستندات الكادر التمريضي الحالي
 */
export async function GET() {
  try {
    const session = await requireRole('NURSE')

    const documents = await db.document.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ documents })
  } catch (error) {
    return handleApiError(error)
  }
}
