import { NextRequest, NextResponse } from 'next/server'
import { compare } from 'bcryptjs'
import { db } from '@/lib/db'
import { requireSession, handleApiError, jsonError } from '@/lib/api-helpers'
import { changePhoneSchema } from '@/lib/validations/user'

/**
 * PATCH /api/me/phone — تغيير رقم الهاتف (معرّف الدخول)
 * يتطلب التحقق من كلمة المرور الحالية، ويمنع التعارض مع حساب آخر.
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession()

    const parsed = changePhoneSchema.safeParse(await req.json())
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const user = await db.user.findUnique({ where: { id: session.user.id } })
    if (!user) return jsonError('الحساب غير موجود', 404)

    const valid = await compare(parsed.data.currentPassword, user.password)
    if (!valid) {
      return jsonError('كلمة المرور الحالية غير صحيحة', 422)
    }

    const newPhone = parsed.data.newPhone
    if (newPhone === user.phone) {
      return jsonError('الرقم الجديد مطابق للرقم الحالي', 422)
    }

    const exists = await db.user.findUnique({ where: { phone: newPhone } })
    if (exists) {
      return jsonError('هذا الرقم مستخدم من حساب آخر', 409)
    }

    await db.user.update({
      where: { id: session.user.id },
      data: { phone: newPhone },
    })

    return NextResponse.json({
      message: `تم تغيير رقم الهاتف بنجاح — استخدم الرقم الجديد (${newPhone}) في الدخول القادم`,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
