import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { handleApiError } from '@/lib/api-helpers'

/**
 * GET /api/departments/public — الأقسام الطبية النشطة للعامة (بلا جلسة)
 * تُستخدم في صفحة التسجيل: التخصص الاختياري للكادر التمريضي هو نفسه
 * الأقسام التي تُعمل بها التكليفات (كتالوج الإدارة).
 */
export async function GET() {
  try {
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
