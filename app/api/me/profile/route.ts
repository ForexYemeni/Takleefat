import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { compare, hash } from 'bcryptjs'
import { db } from '@/lib/db'
import { requireSession, handleApiError, jsonError } from '@/lib/api-helpers'

/**
 * GET /api/me/profile — بيانات الحساب الحالي
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
        createdAt: true,
      },
    })

    if (!user) return jsonError('الحساب غير موجود', 404)

    return NextResponse.json({ user })
  } catch (error) {
    return handleApiError(error)
  }
}

const changePasswordSchema = z.object({
  currentPassword: z.string({ error: 'كلمة المرور الحالية مطلوبة' }).min(1, 'كلمة المرور الحالية مطلوبة'),
  newPassword: z
    .string({ error: 'كلمة المرور الجديدة مطلوبة' })
    .min(8, 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل')
    .regex(/[A-Za-z]/, 'كلمة المرور يجب أن تحتوي على حروف')
    .regex(/[0-9]/, 'كلمة المرور يجب أن تحتوي على أرقام'),
})

/**
 * PATCH /api/me/profile — تغيير كلمة المرور
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession()
    const parsed = changePasswordSchema.safeParse(await req.json())

    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'بيانات غير صحيحة', 422)
    }

    const user = await db.user.findUnique({ where: { id: session.user.id } })
    if (!user) return jsonError('الحساب غير موجود', 404)

    const valid = await compare(parsed.data.currentPassword, user.password)
    if (!valid) {
      return jsonError('كلمة المرور الحالية غير صحيحة', 401)
    }

    const hashed = await hash(parsed.data.newPassword, 12)
    await db.user.update({ where: { id: user.id }, data: { password: hashed } })

    return NextResponse.json({ message: 'تم تغيير كلمة المرور بنجاح' })
  } catch (error) {
    return handleApiError(error)
  }
}
