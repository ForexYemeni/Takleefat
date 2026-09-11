import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { specialtyUpdateSchema } from '@/lib/validations/post'

/**
 * PATCH /api/admin/specialties/[id] — تعديل تخصص (الاسم/التفعيل)
 * DELETE /api/admin/specialties/[id] — حذف تخصص
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole('ADMIN')
    const { id } = await params

    const parsed = specialtyUpdateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const existing = await db.specialty.findUnique({ where: { id } })
    if (!existing) return jsonError('التخصص غير موجود', 404)

    const { name, isActive } = parsed.data

    if (name && name.trim() !== existing.name) {
      const dup = await db.specialty.findUnique({ where: { name: name.trim() } })
      if (dup) return jsonError('يوجد تخصص بنفس الاسم', 409)
    }

    const specialty = await db.specialty.update({
      where: { id },
      data: {
        ...(name != null ? { name: name.trim() } : {}),
        ...(isActive != null ? { isActive } : {}),
      },
    })

    return NextResponse.json({ message: 'تم تحديث التخصص', specialty })
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

    const existing = await db.specialty.findUnique({ where: { id } })
    if (!existing) return jsonError('التخصص غير موجود', 404)

    await db.specialty.delete({ where: { id } })
    return NextResponse.json({ message: 'تم حذف التخصص' })
  } catch (error) {
    return handleApiError(error)
  }
}
