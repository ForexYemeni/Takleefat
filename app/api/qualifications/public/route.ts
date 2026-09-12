import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureQualificationDefaults } from '@/lib/qualifications'

/**
 * GET /api/qualifications/public?audience=NURSE|DOCTOR
 * المؤهلات العلمية النشطة من كتالوج الإدارة — تُستخدم في:
 * - صفحة التسجيل (اختيار مؤهل الكادر/الطبيب) — **بلا جلسة**: زائر التسجيل
 *   لم يسجل دخوله بعد، وكان تشترط المصادقة فيفشل الجلب بصمت وترجع الصفحة
 *   للقوائم الثابتة بدل كتالوج الإدارة (إصلاح الطلب المباشر)
 * - نماذج إنشاء كادر/طبيب من الإدارة والمستلمين والمشرفين
 * تعيد الخيارات التاريخية تلقائياً عند أول استخدام قبل أي تعديل من الإدارة.
 * الأسماء فقط (بلا أي بيانات حساسة) — عامة لجميع الزوار.
 */
export async function GET(req: NextRequest) {
  try {
    const audience = req.nextUrl.searchParams.get('audience') === 'DOCTOR' ? 'DOCTOR' : 'NURSE'

    await ensureQualificationDefaults()

    const qualifications = await db.qualification.findMany({
      where: { audience, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true },
    })

    return NextResponse.json({ qualifications })
  } catch (error) {
    console.error('qualifications/public failed:', error)
    return NextResponse.json({ error: 'تعذر تحميل المؤهلات العلمية' }, { status: 500 })
  }
}
