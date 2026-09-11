import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { handleApiError } from '@/lib/api-helpers'

/**
 * GET /api/specialties/public — التخصصات الطبية النشطة للعامة (بلا جلسة)
 * تُستخدم في صفحة التسجيل: التخصص الطبي للطبيب من كتالوج التخصصات
 * المُدار من حساب الإدارة (منظومة الأطباء).
 */
export async function GET() {
  try {
    const specialties = await db.specialty.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    })
    return NextResponse.json({ specialties })
  } catch (error) {
    return handleApiError(error)
  }
}
