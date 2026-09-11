import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError } from '@/lib/api-helpers'
import { ensureQualificationDefaults } from '@/lib/qualifications'

/**
 * GET /api/qualifications/public?audience=NURSE|DOCTOR
 * المؤهلات العلمية النشطة من كتالوج الإدارة — تُستخدم في:
 * - صفحة التسجيل (اختيار مؤهل الكادر/الطبيب)
 * - نماذج إنشاء كادر/طبيب من الإدارة والمستلمين والمشرفين
 * تعيد الخيارات التاريخية تلقائياً عند أول استخدام قبل أي تعديل من الإدارة.
 */
export async function GET(req: NextRequest) {
  try {
    await requireRole('ADMIN', 'NURSE', 'RECEIVER', 'DOCTOR', 'DOCTOR_SUPERVISOR')

    const audience = req.nextUrl.searchParams.get('audience') === 'DOCTOR' ? 'DOCTOR' : 'NURSE'

    await ensureQualificationDefaults()

    const qualifications = await db.qualification.findMany({
      where: { audience, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true },
    })

    return NextResponse.json({ qualifications })
  } catch (error) {
    return handleApiError(error)
  }
}
