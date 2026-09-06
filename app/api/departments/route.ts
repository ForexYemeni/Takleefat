import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError } from '@/lib/api-helpers'

/**
 * GET /api/departments — الأقسام الطبية النشطة (لكل الأدوار المعتمدة)
 * القائمة تُدار من حساب الإدارة: عناية، طوارئ، رقود، حضانة، قبالة، مختبر...
 */
export async function GET() {
  try {
    await requireRole('ADMIN', 'NURSE', 'RECEIVER')
    const departments = await db.department.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    })
    return NextResponse.json({ departments })
  } catch (error) {
    return handleApiError(error)
  }
}
