import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { departmentSchema } from '@/lib/validations/post'

/**
 * GET /api/admin/departments — جميع الأقسام (الإدارة)
 * POST /api/admin/departments — إضافة قسم طبي جديد (عناية، طوارئ، رقود، حضانة، قبالة، مختبر...)
 */
export async function GET() {
  try {
    await requireRole('ADMIN')
    const departments = await db.department.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ departments })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole('ADMIN')

    const parsed = departmentSchema.safeParse(await req.json())
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const name = parsed.data.name.trim()
    const exists = await db.department.findUnique({ where: { name } })
    if (exists) return jsonError('هذا القسم مضاف مسبقاً', 409)

    const department = await db.department.create({ data: { name } })

    return NextResponse.json(
      { message: 'تمت إضافة القسم بنجاح', department },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
