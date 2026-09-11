import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError, ApiError } from '@/lib/api-helpers'
import { favoriteSchema } from '@/lib/validations/post'
import { notify } from '@/lib/notifications'
import { findMatchingNurses } from '@/lib/network'

/**
 * المفضلة الخاصة بصاحب التكليف — واعية بالجمهور (منظومة الأطباء):
 * المستلم الإداري → يفضّل الكادر التمريضي | مشرف الأطباء → يفضّل الأطباء
 *
 * GET /api/receiver/favorites?search=... — قائمة مفضلته مع البيانات المهنية والتقييم
 *   وحالة الارتباط بجهته والتوفر + بحث داخلي (بحسب جمهور صاحب الحساب)
 * POST /api/receiver/favorites { nurseId, category?, note? } — إضافة لمفضلته
 * ملاحظة: الإضافة تُرسل إشعاراً للكادر/الطبيب أن صاحب التكليف أضافه لمفضلته.
 */

/// جمهور المفضلة حسب دور صاحب الحساب: المشرف يفضّل أطباء — المستلم يفضّل كادراً تمريضياً
function favoritesAudience(role: string): 'NURSE' | 'DOCTOR' {
  return role === 'DOCTOR_SUPERVISOR' ? 'DOCTOR' : 'NURSE'
}

/// تسميات الجمهور — رسائل وإشعارات دقيقة بحسب نوع الحساب
const AUDIENCE_LABELS = {
  NURSE: {
    targetMissing: 'الكادر التمريضي غير موجود',
    targetDuplicate: 'هذا الكادر ضمن مفضلتك مسبقاً',
    targetNotInFavorites: 'هذا الكادر ليس ضمن مفضلتك',
    notifyTitle: 'أُضفت إلى قائمة المفضلين',
    notifyBody:
      'قام مستلم إداري بإضافتك إلى قائمة كوادره المفضلة الموثوقة — ستكون أولوية لديه في التكليفات',
    notifyLink: '/nurse',
  },
  DOCTOR: {
    targetMissing: 'الطبيب غير موجود',
    targetDuplicate: 'هذا الطبيب ضمن مفضلتك مسبقاً',
    targetNotInFavorites: 'هذا الطبيب ليس ضمن مفضلتك',
    notifyTitle: 'أُضفت إلى قائمة المفضلين',
    notifyBody:
      'قام مشرف الأطباء بإضافتك إلى قائمة أطبائه المفضلة الموثوقة — ستكون أولوية لديه في التكليفات',
    notifyLink: '/doctor',
  },
} as const

export async function GET(req: NextRequest) {
  try {
    const session = await requireRole('RECEIVER', 'DOCTOR_SUPERVISOR')
    const search = req.nextUrl.searchParams.get('search')
    const audience = favoritesAudience(session.user.role)

    // قائمته الخاصة حصراً — بحسب جمهور حسابه (كادر تمريضي للمستلم / أطباء للمشرف)
    // ثم تُرتب بالمطابقة الذكية (المفضلة أولاً بطبيعتها)
    const matched = await findMatchingNurses({
      receiverId: session.user.id,
      role: audience,
      favoritesOnly: true,
      search: search ?? undefined,
    })

    const [favorites, me] = await Promise.all([
      db.favoriteNurse.findMany({
        where: { receiverId: session.user.id },
        select: { nurseId: true, category: true, note: true, createdAt: true },
      }),
      // الجولة 32: إذن رؤية البيانات الكاملة — تُظهر الواجهة زر «السيرة الذاتية الكاملة» حسبه
      db.user.findUnique({
        where: { id: session.user.id },
        select: { fullProfileAccess: true },
      }),
    ])
    const meta = new Map(favorites.map((f) => [f.nurseId, f]))

    return NextResponse.json({
      fullProfileAccess: me?.fullProfileAccess ?? false,
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
    const audience = favoritesAudience(session.user.role)
    const labels = AUDIENCE_LABELS[audience]

    const parsed = favoriteSchema.safeParse(await req.json())
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const { nurseId, category, note } = parsed.data
    // جمهور المفضلة بحسب الدور: المستلم يضيف كادراً تمريضياً — المشرف يضيف أطباء
    const target = await db.user.findFirst({
      where: { id: nurseId, role: audience },
      select: { id: true, name: true },
    })
    if (!target) return jsonError(labels.targetMissing, 404)

    const existing = await db.favoriteNurse.findUnique({
      where: { receiverId_nurseId: { receiverId: session.user.id, nurseId } },
    })
    if (existing) return jsonError(labels.targetDuplicate, 409)

    const favorite = await db.favoriteNurse.create({
      data: {
        receiverId: session.user.id,
        nurseId,
        category: category?.trim() || null,
        note: note?.trim() || null,
      },
    })

    await notify(nurseId, {
      title: labels.notifyTitle,
      body: labels.notifyBody,
      type: 'FAVORITE_ADDED',
      link: labels.notifyLink,
    })

    return NextResponse.json({ message: `تمت إضافة (${target.name}) إلى مفضلتيك`, favorite }, { status: 201 })
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
    const labels = AUDIENCE_LABELS[favoritesAudience(session.user.role)]
    const nurseId = req.nextUrl.searchParams.get('nurseId')
    if (!nurseId) throw new ApiError('معرّف الكادر مطلوب', 400)

    const body = await req.json().catch(() => ({}))
    const existing = await db.favoriteNurse.findUnique({
      where: { receiverId_nurseId: { receiverId: session.user.id, nurseId } },
    })
    if (!existing) return jsonError(labels.targetNotInFavorites, 404)

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
    const labels = AUDIENCE_LABELS[favoritesAudience(session.user.role)]
    const nurseId = req.nextUrl.searchParams.get('nurseId')
    if (!nurseId) throw new ApiError('معرّف الكادر مطلوب', 400)

    const existing = await db.favoriteNurse.findUnique({
      where: { receiverId_nurseId: { receiverId: session.user.id, nurseId } },
    })
    if (!existing) return jsonError(labels.targetNotInFavorites, 404)

    await db.favoriteNurse.delete({ where: { id: existing.id } })
    return NextResponse.json({ message: 'تمت الإزالة من المفضلة' })
  } catch (error) {
    return handleApiError(error)
  }
}
