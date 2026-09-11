import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { workDepartmentsSchema } from '@/lib/validations/user'

/**
 * أقسام عمل الكادر التمريضي — تعدد أقسام من كتالوج الإدارة
 * GET /api/me/work-departments — أقسامي الحالية + كل الأقسام النشطة (للاختيار)
 * PUT  /api/me/work-departments — استبدال كامل لمجموعة الأقسام { departmentIds: [] }
 *
 * عند إنشاء تكليف في قسم محدد (رقود/طوارئ/عناية/مختبر...) يصل التكليف
 * مباشرة لكل كادر أضاف هذا القسم ضمن أقسام عمله.
 */

const DEPARTMENT_SELECT = { id: true, name: true } as const

export async function GET() {
  try {
    const session = await requireRole('NURSE')

    const [mine, allDepartments] = await Promise.all([
      db.workDepartment.findMany({
        where: { nurseId: session.user.id },
        orderBy: { createdAt: 'asc' },
        select: { department: { select: DEPARTMENT_SELECT } },
      }),
      db.department.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: DEPARTMENT_SELECT,
      }),
    ])

    return NextResponse.json({
      departments: mine.map((w) => w.department),
      allDepartments,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PUT(req: Request) {
  try {
    const session = await requireRole('NURSE')
    const body = await req.json().catch(() => ({}))

    const parsed = workDepartmentsSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    // إزالة التكرار مع حفظ الترتيب
    const ids = Array.from(new Set(parsed.data.departmentIds))
    if (ids.length === 0) {
      // مجموعة فارغة = مسح كل الأقسام (قرار مشروع)
      await db.workDepartment.deleteMany({ where: { nurseId: session.user.id } })
      return NextResponse.json({ message: 'تم تحديث أقسام عملك', departments: [] })
    }

    // كل الأقسام يجب أن تكون من كتالوج الإدارة النشط — لا أقسام يخترعها الكادر
    const valid = await db.department.findMany({
      where: { id: { in: ids }, isActive: true },
      select: DEPARTMENT_SELECT,
    })
    if (valid.length !== ids.length) {
      return jsonError('بعض الأقسام غير موجودة في كتالوج الإدارة أو غير نشطة — حدّث القائمة', 422)
    }

    // استبدال كامل ذري للمجموعة
    await db.$transaction([
      db.workDepartment.deleteMany({ where: { nurseId: session.user.id } }),
      db.workDepartment.createMany({
        data: ids.map((departmentId) => ({ nurseId: session.user.id, departmentId })),
      }),
    ])

    const departments = await db.workDepartment.findMany({
      where: { nurseId: session.user.id },
      orderBy: { createdAt: 'asc' },
      select: { department: { select: DEPARTMENT_SELECT } },
    })

    return NextResponse.json({
      message: `تم تحديث أقسام عملك (${departments.length} قسم) — ستصل تكليفات هذه الأقسام إليك مباشرة`,
      departments: departments.map((w) => w.department),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
