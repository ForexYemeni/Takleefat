import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { hospitalUpdateSchema } from '@/lib/validations/post'

/**
 * PATCH /api/admin/hospitals/[id] — تعديل جهة صحية (الاسم/الموقع/التفعيل)
 * DELETE /api/admin/hospitals/[id] — حذف جهة صحية
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole('ADMIN')
    const { id } = await params

    const parsed = hospitalUpdateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const existing = await db.hospital.findUnique({ where: { id } })
    if (!existing) return jsonError('الجهة الصحية غير موجودة', 404)

    const { name, location, isActive, lat, lng } = parsed.data

    if (name && name.trim() !== existing.name) {
      const dup = await db.hospital.findUnique({ where: { name: name.trim() } })
      if (dup) return jsonError('يوجد جهة صحية بنفس الاسم', 409)
    }

    const hospital = await db.hospital.update({
      where: { id },
      data: {
        ...(name != null ? { name: name.trim() } : {}),
        ...(location !== undefined ? { location: location.trim() || null } : {}),
        ...(lat !== undefined ? { lat } : {}),
        ...(lng !== undefined ? { lng } : {}),
        ...(isActive != null ? { isActive } : {}),
      },
    })

    return NextResponse.json({ message: 'تم تحديث الجهة الصحية', hospital })
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

    const existing = await db.hospital.findUnique({ where: { id } })
    if (!existing) return jsonError('الجهة الصحية غير موجودة', 404)

    await db.hospital.delete({ where: { id } })
    return NextResponse.json({ message: 'تم حذف الجهة الصحية' })
  } catch (error) {
    return handleApiError(error)
  }
}
