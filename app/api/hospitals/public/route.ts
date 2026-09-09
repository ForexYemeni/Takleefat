import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { handleApiError } from '@/lib/api-helpers'

/**
 * GET /api/hospitals/public — قائمة الجهات الصحية المعتمدة للعامة
 * تُستخدم في صفحة التسجيل (بلا جلسة): المستلم الإداري يختار جهته من جهات الإدارة،
 * والجهات المقترحة الجديدة (PENDING/REJECTED/INACTIVE) لا تظهر هنا — الإدارة وحدها تعتمدها.
 */
export async function GET() {
  try {
    const hospitals = await db.hospital.findMany({
      where: { isActive: true, status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, type: true, city: true },
    })
    return NextResponse.json({ hospitals })
  } catch (error) {
    return handleApiError(error)
  }
}
