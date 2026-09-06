import { NextRequest, NextResponse } from 'next/server'
import { compare, hash } from 'bcryptjs'
import { db } from '@/lib/db'
import { requireSession, handleApiError, jsonError } from '@/lib/api-helpers'
import { changePasswordSchema } from '@/lib/validations/user'

/**
 * PATCH /api/me/password — تغيير كلمة المرور الذاتية
 * يتطلب التحقق من كلمة المرور الحالية قبل التحديث.
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession()

    const parsed = changePasswordSchema.safeParse(await req.json())
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const user = await db.user.findUnique({ where: { id: session.user.id } })
    if (!user) return jsonError('الحساب غير موجود', 404)

    const valid = await compare(parsed.data.currentPassword, user.password)
    if (!valid) {
      return jsonError('كلمة المرور الحالية غير صحيحة', 422)
    }

    if (parsed.data.currentPassword === parsed.data.newPassword) {
      return jsonError('كلمة المرور الجديدة يجب أن تختلف عن الحالية', 422)
    }

    const hashed = await hash(parsed.data.newPassword, 12)
    await db.user.update({
      where: { id: session.user.id },
      data: { password: hashed },
    })

    return NextResponse.json({ message: 'تم تغيير كلمة المرور بنجاح' })
  } catch (error) {
    return handleApiError(error)
  }
}
