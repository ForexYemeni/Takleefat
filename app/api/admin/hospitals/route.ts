import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { hospitalSchema, hospitalUpdateSchema } from '@/lib/validations/post'
import { computeAllOrgCadreStats, EMPTY_ORG_CADRE_STATS } from '@/lib/network'

/**
 * GET /api/admin/hospitals — جميع الجهات الصحية مع إحصاءات الارتباط (الإدارة)
 * الجولة 38: لكل جهة إحصاءات «مجتمع كوادر الجهة الصحية» (الممرضون المعتمدون /
 * الأطباء المعتمدون / المتاحون الآن) في حقل community.
 * POST /api/admin/hospitals — إضافة جهة صحية ببياناتها الكاملة
 * PATCH /api/admin/hospitals?id=... — تعديل جهة (بيانات كاملة + حالة)
 * DELETE /api/admin/hospitals?id=... — حذف جهة (يُمنع إذا مرتبطة بتكليفات)
 */
export async function GET() {
  try {
    await requireRole('ADMIN')
    const [hospitals, statsMap] = await Promise.all([
      db.hospital.findMany({
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { affiliations: true, posts: true } } },
      }),
      computeAllOrgCadreStats(),
    ])
    return NextResponse.json({
      hospitals: hospitals.map((h) => ({
        ...h,
        community: statsMap.get(h.id) ?? { ...EMPTY_ORG_CADRE_STATS },
      })),
    })
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
