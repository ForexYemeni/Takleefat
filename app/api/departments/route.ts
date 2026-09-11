import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError } from '@/lib/api-helpers'

/**
 * GET /api/departments — الأقسام الطبية النشطة (لكل الأدوار المعتمدة)
 * القائمة تُدار من حساب الإدارة: عناية، طوارئ، رقود، حضانة، قبالة، مختبر...
 */
export async function GET() {
  try {
    await requireRole('ADMIN', 'NURSE', 'RECEIVER', 'DOCTOR', 'DOCTOR_SUPERVISOR')
    const departments = await db.department.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      // isActive تُعاد صراحةً — بعض الواجهات تعتمد على وجودها في عقد البيانات
      select: { id: true, name: true, isActive: true },
    })
    return NextResponse.json({ departments })
  } catch (error) {
    return handleApiError(error)
  }
}
