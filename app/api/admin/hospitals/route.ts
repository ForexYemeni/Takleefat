import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { hospitalSchema } from '@/lib/validations/post'

/**
 * GET /api/admin/hospitals — جميع الجهات الصحية (الإدارة)
 * POST /api/admin/hospitals — إضافة جهة صحية جديدة مع موقعها الفعلي
 */
export async function GET() {
  try {
    await requireRole('ADMIN')
    const hospitals = await db.hospital.findMany({
      orderBy: { createdAt: 'desc' },
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

    const hospital = await db.hospital.create({
      data: { name, location: parsed.data.location?.trim() || null },
    })

    return NextResponse.json(
      { message: 'تمت إضافة الجهة الصحية بنجاح', hospital },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
