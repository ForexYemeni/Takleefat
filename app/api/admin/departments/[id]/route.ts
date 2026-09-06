import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { departmentUpdateSchema } from '@/lib/validations/post'

/**
 * PATCH /api/admin/departments/[id] — تعديل قسم (الاسم/التفعيل)
 * DELETE /api/admin/departments/[id] — حذف قسم
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole('ADMIN')
    const { id } = await params

    const parsed = departmentUpdateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const existing = await db.department.findUnique({ where: { id } })
    if (!existing) return jsonError('القسم غير موجود', 404)

    const { name, isActive } = parsed.data

    if (name && name.trim() !== existing.name) {
      const dup = await db.department.findUnique({ where: { name: name.trim() } })
      if (dup) return jsonError('يوجد قسم بنفس الاسم', 409)
    }

    const department = await db.department.update({
      where: { id },
      data: {
        ...(name != null ? { name: name.trim() } : {}),
        ...(isActive != null ? { isActive } : {}),
      },
    })

    return NextResponse.json({ message: 'تم تحديث القسم', department })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole('ADMIN')
    const { id } = await params

    const existing = await db.department.findUnique({ where: { id } })
    if (!existing) return jsonError('القسم غير موجود', 404)

    await db.department.delete({ where: { id } })
    return NextResponse.json({ message: 'تم حذف القسم' })
  } catch (error) {
    return handleApiError(error)
  }
}
