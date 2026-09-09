import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { hospitalSchema, hospitalUpdateSchema } from '@/lib/validations/post'

/**
 * GET /api/admin/hospitals — جميع الجهات الصحية مع إحصاءات الارتباط (الإدارة)
 * POST /api/admin/hospitals — إضافة جهة صحية ببياناتها الكاملة
 * PATCH /api/admin/hospitals?id=... — تعديل جهة (بيانات كاملة + حالة)
 * DELETE /api/admin/hospitals?id=... — حذف جهة (يُمنع إذا مرتبطة بتكليفات)
 */
export async function GET() {
  try {
    await requireRole('ADMIN')
    const hospitals = await db.hospital.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { affiliations: true, posts: true } } },
    })
    return NextResponse.json({ hospitals })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole('ADMIN')

    const parsed = hospitalSchema.safeParse(await req.json())
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const name = parsed.data.name.trim()
    const exists = await db.hospital.findUnique({ where: { name } })
    if (exists) return jsonError('هذه الجهة الصحية مضافة مسبقاً', 409)

    const status = parsed.data.status ?? 'ACTIVE'
    const hospital = await db.hospital.create({
      data: {
        name,
        location: parsed.data.location?.trim() || null,
        lat: parsed.data.lat ?? null,
        lng: parsed.data.lng ?? null,
        type: parsed.data.type ?? 'HOSPITAL',
        city: parsed.data.city?.trim() || null,
        address: parsed.data.address?.trim() || null,
        phone: parsed.data.phone?.trim() || null,
        email: parsed.data.email?.trim() || null,
        status,
        isActive: status === 'ACTIVE',
      },
    })

    return NextResponse.json(
      { message: 'تمت إضافة الجهة الصحية بنجاح', hospital },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireRole('ADMIN')
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return jsonError('معرّف الجهة مطلوب', 400)

    const parsed = hospitalUpdateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const existing = await db.hospital.findUnique({ where: { id } })
    if (!existing) return jsonError('الجهة الصحية غير موجودة', 404)

    const d = parsed.data
    const status = d.status
    const hospital = await db.hospital.update({
      where: { id },
      data: {
        ...(d.name != null ? { name: d.name.trim() } : {}),
        ...(d.location !== undefined ? { location: d.location?.trim() || null } : {}),
        ...(d.lat !== undefined ? { lat: d.lat ?? null } : {}),
        ...(d.lng !== undefined ? { lng: d.lng ?? null } : {}),
        ...(d.type != null ? { type: d.type } : {}),
        ...(d.city !== undefined ? { city: d.city?.trim() || null } : {}),
        ...(d.address !== undefined ? { address: d.address?.trim() || null } : {}),
        ...(d.phone !== undefined ? { phone: d.phone?.trim() || null } : {}),
        ...(d.email !== undefined ? { email: d.email?.trim() || null } : {}),
        ...(status != null ? { status, isActive: status === 'ACTIVE' } : {}),
        ...(d.isActive != null && status == null ? { isActive: d.isActive, status: d.isActive ? 'ACTIVE' : existing.status } : {}),
      },
    })

    return NextResponse.json({ message: 'تم تحديث الجهة الصحية بنجاح', hospital })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireRole('ADMIN')
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return jsonError('معرّف الجهة مطلوب', 400)

    const hospital = await db.hospital.findUnique({
      where: { id },
      include: { _count: { select: { posts: true } } },
    })
    if (!hospital) return jsonError('الجهة الصحية غير موجودة', 404)
    if (hospital._count.posts > 0) {
      return jsonError('لا يمكن حذف الجهة — مرتبطة بتكليفات مُعلنة. يمكنك جعلها «غير نشطة» بدلاً من حذفها', 409)
    }

    await db.hospital.delete({ where: { id } })
    return NextResponse.json({ message: `تم حذف الجهة الصحية (${hospital.name}) نهائياً` })
  } catch (error) {
    return handleApiError(error)
  }
}
