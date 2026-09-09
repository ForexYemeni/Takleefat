import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { hospitalUpdateSchema } from '@/lib/validations/post'
import { AFFILIATION_STATUS_LABELS } from '@/lib/network'

/**
 * GET /api/admin/hospitals/[id] — لوحة الجهة الصحية (شبكة الكوادر الصحية المعتمدة)
 * إحصاءات الكوادر المرتبطين بالحالة + التكليفات النشطة والسابقة + قائمة الكوادر مفصلة.
 *
 * PATCH /api/admin/hospitals/[id] — تعديل جهة صحية (البيانات الكاملة + الحالة + التفعيل)
 * DELETE /api/admin/hospitals/[id] — حذف جهة (يُمنع إذا مرتبطة بتكليفات مُعلنة)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole('ADMIN')
    const { id } = await params

    const hospital = await db.hospital.findUnique({
      where: { id },
      include: { _count: { select: { posts: true } } },
    })
    if (!hospital) return jsonError('الجهة الصحية غير موجودة', 404)

    const [affiliations, activePosts, completedPosts, statusGroups] = await Promise.all([
      db.nurseAffiliation.findMany({
        where: { hospitalId: id },
        orderBy: { createdAt: 'desc' },
        include: {
          nurse: {
            select: {
              id: true, name: true, phone: true, gender: true, specialty: true,
              qualification: true, yearsOfExperience: true, status: true,
            },
          },
        },
      }),
      db.post.findMany({
        where: { hospitalId: id, status: { in: ['OPEN', 'ASSIGNED'] } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, number: true, title: true, status: true, value: true, department: true, createdAt: true },
      }),
      db.post.findMany({
        where: { hospitalId: id, status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, number: true, title: true, value: true, department: true, createdAt: true },
      }),
      db.nurseAffiliation.groupBy({ by: ['status'], where: { hospitalId: id }, _count: true }),
    ])

    const stats: Record<string, number> = {}
    for (const g of statusGroups) stats[g.status] = g._count

    return NextResponse.json({
      hospital,
      stats: {
        total: affiliations.length,
        working: stats.WORKING ?? 0,
        endorsed: stats.ENDORSED ?? 0,
        interviewed: stats.INTERVIEWED ?? 0,
        external: stats.EXTERNAL ?? 0,
        pending: stats.PENDING ?? 0,
        former: stats.FORMER ?? 0,
        suspended: stats.SUSPENDED ?? 0,
        posts: hospital._count.posts,
        activePosts: activePosts.length,
        completedPosts: completedPosts.length,
      },
      nurses: affiliations.map((a) => ({
        affiliationId: a.id,
        status: a.status,
        statusLabel: AFFILIATION_STATUS_LABELS[a.status] ?? a.status,
        note: a.note,
        workYears: a.workYears,
        requestedStatus: a.requestedStatus,
        createdAt: a.createdAt,
        nurse: a.nurse,
      })),
      activePosts,
      completedPosts,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

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
        ...(d.isActive != null && status == null
          ? { isActive: d.isActive, status: d.isActive ? 'ACTIVE' : existing.status }
          : {}),
      },
    })

    return NextResponse.json({ message: 'تم تحديث الجهة الصحية بنجاح', hospital })
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

    const hospital = await db.hospital.findUnique({
      where: { id },
      include: { _count: { select: { posts: true } } },
    })
    if (!hospital) return jsonError('الجهة الصحية غير موجودة', 404)
    if (hospital._count.posts > 0) {
      return jsonError(
        'لا يمكن حذف الجهة — مرتبطة بتكليفات مُعلنة. يمكنك جعلها «غير نشطة» بدلاً من حذفها',
        409
      )
    }

    await db.hospital.delete({ where: { id } })
    return NextResponse.json({ message: `تم حذف الجهة الصحية (${hospital.name}) نهائياً` })
  } catch (error) {
    return handleApiError(error)
  }
}
