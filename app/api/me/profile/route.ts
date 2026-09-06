import { NextRequest, NextResponse } from 'next/server'
import { compare, hash } from 'bcryptjs'
import { db } from '@/lib/db'
import { requireSession, handleApiError, jsonError } from '@/lib/api-helpers'
import { updateProfileSchema, changePasswordSchema } from '@/lib/validations/user'

/**
 * GET /api/me/profile — الملف الشخصي الكامل للمستخدم الحالي (جميع الأدوار)
 * PATCH /api/me/profile — تحديث الاسم { name } أو تغيير كلمة المرور { currentPassword, newPassword }
 */
export async function GET() {
  try {
    const session = await requireSession()

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        phone: true,
        role: true,
        status: true,
        specialty: true,
        qualification: true,
        yearsOfExperience: true,
        gender: true,
        createdAt: true,
        _count: {
          select: {
            documents: true,
            assignments: true,
            posts: true,
            applications: true,
          },
        },
      },
    })
    if (!user) return jsonError('الحساب غير موجود', 404)

    return NextResponse.json({ user })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession()
    const body = await req.json().catch(() => ({}))

    // ---------- تغيير كلمة المرور ----------
    if (body && typeof body === 'object' && 'currentPassword' in body) {
      const parsed = changePasswordSchema.safeParse(body)
      if (!parsed.success) {
        return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
      }

      const user = await db.user.findUnique({ where: { id: session.user.id } })
      if (!user) return jsonError('الحساب غير موجود', 404)

      const valid = await compare(parsed.data.currentPassword, user.password)
      if (!valid) return jsonError('كلمة المرور الحالية غير صحيحة', 422)

      if (parsed.data.currentPassword === parsed.data.newPassword) {
        return jsonError('كلمة المرور الجديدة يجب أن تختلف عن الحالية', 422)
      }

      const hashed = await hash(parsed.data.newPassword, 12)
      await db.user.update({ where: { id: session.user.id }, data: { password: hashed } })

      return NextResponse.json({ message: 'تم تغيير كلمة المرور بنجاح' })
    }

    // ---------- تحديث الاسم ----------
    const parsed = updateProfileSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const updated = await db.user.update({
      where: { id: session.user.id },
      data: { name: parsed.data.name.trim() },
      select: { id: true, name: true },
    })

    return NextResponse.json({ message: 'تم تحديث الاسم بنجاح', user: updated })
  } catch (error) {
    return handleApiError(error)
  }
}
