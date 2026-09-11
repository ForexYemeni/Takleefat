import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError } from '@/lib/api-helpers'

/**
 * GET /api/specialties — التخصصات الطبية النشطة (لكل الأدوار المعتمدة)
 * كتالوج مستقل تُديره الإدارة: باطنية، جراحة عامة، أطفال، نساء وولادة، قلبية...
 * يُستخدم في نافذة إنشاء تكليف الأطباء وفي تخصصات عمل الطبيب
 */
export async function GET() {
  try {
    await requireRole('ADMIN', 'NURSE', 'RECEIVER', 'DOCTOR', 'DOCTOR_SUPERVISOR')
    const specialties = await db.specialty.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      // isActive تُعاد صراحةً — بعض الواجهات تعتمد على وجودها في عقد البيانات
      select: { id: true, name: true, isActive: true },
    })
    return NextResponse.json({ specialties })
  } catch (error) {
    return handleApiError(error)
  }
}
