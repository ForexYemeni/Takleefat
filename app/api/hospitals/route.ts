import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError } from '@/lib/api-helpers'

/**
 * GET /api/hospitals — الجهات الصحية النشطة (لكل الأدوار المعتمدة)
 * تُستخدم في قوائم الاختيار عند إنشاء التكليف — الموقع يُشتق تلقائياً من الجهة.
 */
export async function GET() {
  try {
    await requireRole('ADMIN', 'NURSE', 'RECEIVER')
    const hospitals = await db.hospital.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, location: true, lat: true, lng: true },
    })
    return NextResponse.json({ hospitals })
  } catch (error) {
    return handleApiError(error)
  }
}
