import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError, ApiError } from '@/lib/api-helpers'
import { favoriteSchema } from '@/lib/validations/post'
import { notify } from '@/lib/notifications'
import { findMatchingNurses } from '@/lib/network'

/**
 * الممرضون المفضلون | Favorite Nurses — قائمة خاصة بكل مستلم إداري لا تظهر لغيره
 *
 * GET /api/receiver/favorites?search=... — قائمة مفضلته مع البيانات المهنية والتقييم
 *   وحالة الارتباط بجهته والتوفر + بحث داخلي
 * POST /api/receiver/favorites { nurseId, category?, note? } — إضافة لمفضلته
 * ملاحظة: الإضافة تُرسل إشعاراً للكادر أن المستلم أضافه لمفضلته.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireRole('RECEIVER', 'DOCTOR_SUPERVISOR')
    const search = req.nextUrl.searchParams.get('search')

    // قائمته الخاصة حصراً — ثم تُرتب بالمطابقة الذكية (المفضلة أولاً بطبيعتها)
    const matched = await findMatchingNurses({
      receiverId: session.user.id,
      favoritesOnly: true,
      search: search ?? undefined,
    })

    const favorites = await db.favoriteNurse.findMany({
      where: { receiverId: session.user.id },
      select: { nurseId: true, category: true, note: true, createdAt: true },
    })
    const meta = new Map(favorites.map((f) => [f.nurseId, f]))

    return NextResponse.json({
      favorites: matched.map((n) => ({
        ...n,
        category: meta.get(n.id)?.category ?? null,
        note: meta.get(n.id)?.note ?? null,
        favoritedAt: meta.get(n.id)?.createdAt ?? null,
      })),
      total: matched.length,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole('RECEIVER', 'DOCTOR_SUPERVISOR')
    const parsed = favoriteSchema.safeParse(await req.json())
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const { nurseId, category, note } = parsed.data
    const nurse = await db.user.findFirst({
      where: { id: nurseId, role: 'NURSE' },
      select: { id: true, name: true },
    })
    if (!nurse) return jsonError('الكادر التمريضي غير موجود', 404)

    const existing = await db.favoriteNurse.findUnique({
      where: { receiverId_nurseId: { receiverId: session.user.id, nurseId } },
    })
    if (existing) return jsonError('هذا الكادر ضمن مفضلتك مسبقاً', 409)

    const favorite = await db.favoriteNurse.create({
      data: {
        receiverId: session.user.id,
        nurseId,
        category: category?.trim() || null,
        note: note?.trim() || null,
      },
    })

    await notify(nurseId, {
      title: 'أُضفت إلى قائمة المفضلين',
      body: 'قام مستلم إداري بإضافتك إلى قائمة كوادره المفضلة الموثوقة — ستكون أولوية لديه في التكليفات',
      type: 'FAVORITE_ADDED',
      link: '/nurse',
    })

    return NextResponse.json({ message: `تمت إضافة (${nurse.name}) إلى مفضلتيك`, favorite }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * PATCH /api/receiver/favorites?nurseId=... — تحديث التصنيف/الملاحظة
 * DELETE /api/receiver/favorites?nurseId=... — إزالة من المفضلة
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireRole('RECEIVER', 'DOCTOR_SUPERVISOR')
    const nurseId = req.nextUrl.searchParams.get('nurseId')
    if (!nurseId) throw new ApiError('معرّف الكادر مطلوب', 400)

    const body = await req.json().catch(() => ({}))
    const existing = await db.favoriteNurse.findUnique({
      where: { receiverId_nurseId: { receiverId: session.user.id, nurseId } },
    })
    if (!existing) return jsonError('هذا الكادر ليس ضمن مفضلتك', 404)

    const updated = await db.favoriteNurse.update({
      where: { id: existing.id },
      data: {
        ...(typeof body?.category === 'string' ? { category: body.category.trim() || null } : {}),
        ...(typeof body?.note === 'string' ? { note: body.note.trim() || null } : {}),
      },
    })
    return NextResponse.json({ message: 'تم تحديث بيانات المفضلة', favorite: updated })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireRole('RECEIVER', 'DOCTOR_SUPERVISOR')
    const nurseId = req.nextUrl.searchParams.get('nurseId')
    if (!nurseId) throw new ApiError('معرّف الكادر مطلوب', 400)

    const existing = await db.favoriteNurse.findUnique({
      where: { receiverId_nurseId: { receiverId: session.user.id, nurseId } },
    })
    if (!existing) return jsonError('هذا الكادر ليس ضمن مفضلتك', 404)

    await db.favoriteNurse.delete({ where: { id: existing.id } })
    return NextResponse.json({ message: 'تمت الإزالة من المفضلة' })
  } catch (error) {
    return handleApiError(error)
  }
}
