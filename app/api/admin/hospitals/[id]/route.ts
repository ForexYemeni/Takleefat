import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { hospitalUpdateSchema } from '@/lib/validations/post'
import { AFFILIATION_STATUS_LABELS, healReceiverPendingAffiliations, computeOrgCadreStats, busyStaffIds } from '@/lib/network'
import { notify } from '@/lib/notifications'

/**
 * GET /api/admin/hospitals/[id] — لوحة الجهة الصحية (شبكة الكوادر الصحية المعتمدة)
 * إحصاءات الكوادر المرتبطين بالحالة + التكليفات النشطة والسابقة + قائمة الكوادر مفصلة.
 *
 * PATCH /api/admin/hospitals/[id] — تعديل جهة صحية (البيانات الكاملة + الحالة + التفعيل)
 * DELETE /api/admin/hospitals/[id] — حذف الجهة حذفاً كاملاً نهائياً: تُحذف الجهة
 * وارتباطات كوادرها، وتُفكَّك ارتباط التكليفات السابقة مع بقاء سجلها التاريخي النصي.
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

    // شفاء كسول: ارتباطات كوادر أُضيفت من المستلم ثم اعتُمدت الجهة وتوقفت على PENDING
    await healReceiverPendingAffiliations(id)

    const [affiliations, activePosts, completedPosts, statusGroups] = await Promise.all([
      db.nurseAffiliation.findMany({
        where: { hospitalId: id },
        orderBy: { createdAt: 'desc' },
        include: {
          nurse: {
            select: {
              id: true, name: true, phone: true, gender: true, specialty: true,
              qualification: true, yearsOfExperience: true, status: true,
              // الجولة 38: الدور لعرض «كادر تمريضي / طبيب» في مجتمع الجهة
              role: true,
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

    // الجولة 38: إحصاءات مجتمع كوادر الجهة الصحية في لوحة الجهة
    const community = await computeOrgCadreStats(id)
    const busy = await busyStaffIds(affiliations.map((a) => a.nurse.id))

    return NextResponse.json({
      hospital,
      community,
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
        // الجولة 38: متاح الآن = بلا تكليف سارٍ
        available: !busy.has(a.nurse.id),
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
    const session = await requireRole('ADMIN')
    const { id } = await params

    const parsed = hospitalUpdateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const existing = await db.hospital.findUnique({ where: { id } })
    if (!existing) return jsonError('الجهة الصحية غير موجودة', 404)

    const d = parsed.data
    const status = d.status
    // الحالة الفعلية بعد التحديث (تشمل التفعيل عبر isActive دون status صريح)
    const nextStatus =
      status ?? (d.isActive != null ? (d.isActive ? 'ACTIVE' : existing.status) : existing.status)
    // اعتماد جهة معلقة → الارتباطات المعلقة المعلقة عليها تُعتمد تلقائياً (إصلاح الجولة الثامنة)
    const approvingPendingOrg = existing.status === 'PENDING' && nextStatus === 'ACTIVE'

    const { hospital, autoApproved, affected } = await db.$transaction(async (tx) => {
      const updated = await tx.hospital.update({
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

      let approved = 0
      const impacted: Array<{
        nurseId: string
        requestedById: string | null
        finalStatus: string
      }> = []
      if (approvingPendingOrg) {
        const pending = await tx.nurseAffiliation.findMany({
          where: { hospitalId: id, status: 'PENDING' },
          select: { id: true, nurseId: true, requestedStatus: true, requestedById: true },
        })
        for (const aff of pending) {
          const finalStatus = aff.requestedStatus ?? 'WORKING'
          await tx.nurseAffiliation.update({
            where: { id: aff.id },
            data: {
              status: finalStatus,
              reviewedById: session.user.id,
              reviewedAt: new Date(),
            },
          })
          approved++
          impacted.push({ nurseId: aff.nurseId, requestedById: aff.requestedById, finalStatus })
        }
      }
      return { hospital: updated, autoApproved: approved, affected: impacted }
    })

    // إشعارات الاعتماد التلقائي للكادر ولمن طلب الارتباط
    if (affected.length > 0) {
      const notifications: Array<Promise<unknown>> = []
      for (const a of affected) {
        notifications.push(
          notify(a.nurseId, {
            title: 'تم اعتماد الجهة الصحية — سجلك المهني محدّث',
            body: `اعتُمدت جهة (${hospital.name}) وأصبح ارتباطك بها بحالة: ${
              AFFILIATION_STATUS_LABELS[a.finalStatus] ?? a.finalStatus
            }`,
            type: 'AFFILIATION_UPDATED',
            link: '/nurse/profile',
          })
        )
        if (a.requestedById && a.requestedById !== a.nurseId) {
          notifications.push(
            notify(a.requestedById, {
              title: 'اعتُمدت الجهة الصحية — كوادر الجهة مفعّلة',
              body: `اعتُمدت جهة (${hospital.name}) وأُعتمد ارتباط الكوادر المضاف تلقائياً — تبقى موافقة حساب كل كادر ورفع مستنداته لدى الإدارة شرطاً لاستقبال التكليفات`,
              type: 'AFFILIATION_UPDATED',
              link: '/receiver/staff',
            })
          )
        }
      }
      await Promise.all(notifications)
    }

    return NextResponse.json({
      message: autoApproved
        ? `تم تحديث الجهة الصحية بنجاح — واعتُمد ${autoApproved} ارتباط معلق تلقائياً مع اعتماد الجهة`
        : 'تم تحديث الجهة الصحية بنجاح',
      hospital,
      autoApprovedAffiliations: autoApproved,
    })
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
      include: { _count: { select: { posts: true, affiliations: true } } },
    })
    if (!hospital) return jsonError('الجهة الصحية غير موجودة', 404)

    // الحذف الكامل (الجولة 22): الجهة تُحذف نهائياً أياً كان ما يرتبط بها —
    // ارتباطات كوادرها تُحذف تلقائياً (onDelete: Cascade)، والتكليفات السابقة
    // تُفكَّك ارتباطها بالجهة مع بقاء سجلها التاريخي النصي كاملاً (لا فقد بيانات).
    const detachedPosts = await db.$transaction(async (tx) => {
      const detached = await tx.post.updateMany({
        where: { hospitalId: id },
        data: { hospitalId: null },
      })
      await tx.hospital.delete({ where: { id } })
      return detached.count
    })

    return NextResponse.json({
      message: [
        `تم حذف الجهة الصحية (${hospital.name}) حذفاً كاملاً من المنصة`,
        hospital._count.affiliations > 0
          ? `مع ${hospital._count.affiliations} ارتباط كوادر`
          : null,
        detachedPosts > 0
          ? `وفُكَّ ارتباط ${detachedPosts} تكليف سابق (سجلها التاريخي محفوظ)`
          : null,
      ]
        .filter(Boolean)
        .join(' — '),
      deletedAffiliations: hospital._count.affiliations,
      detachedPosts,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
