import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError } from '@/lib/api-helpers'
import type { DocumentStatus } from '@prisma/client'

/**
 * GET /api/admin/documents?status=PENDING
 * قائمة المستندات مع بيانات أصحابها — لمراجعة المستندات
 */
export async function GET(req: NextRequest) {
  try {
    await requireRole('ADMIN')

    const status = req.nextUrl.searchParams.get('status')

    const documents = await db.document.findMany({
      where: {
        ...(status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status)
          ? { status: status as DocumentStatus }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, name: true, phone: true, specialty: true, status: true },
        },
      },
    })

    return NextResponse.json({ documents })
  } catch (error) {
    return handleApiError(error)
  }
}
