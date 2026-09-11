import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { specialtySchema } from '@/lib/validations/post'

/**
 * GET /api/admin/specialties — جميع التخصصات الطبية (الإدارة) مع عدد الأطباء المرتبطين
 *   بكل تخصص عبر تخصصات العمل (DoctorSpecialty) — القسم المستقل «التخصصات الطبية»
 * POST /api/admin/specialties — إضافة تخصص طبي جديد (باطنية، جراحة، أطفال، نساء...)
 */
export async function GET() {
  try {
    await requireRole('ADMIN')
    const specialties = await db.specialty.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { doctors: true } } },
    })
    return NextResponse.json({ specialties })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole('ADMIN')

    const parsed = specialtySchema.safeParse(await req.json())
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const name = parsed.data.name.trim()
    const exists = await db.specialty.findUnique({ where: { name } })
    if (exists) return jsonError('هذا التخصص مضاف مسبقاً', 409)

    const specialty = await db.specialty.create({ data: { name } })

    return NextResponse.json(
      { message: 'تمت إضافة التخصص بنجاح', specialty },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
