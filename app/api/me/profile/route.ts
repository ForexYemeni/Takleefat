import { NextRequest, NextResponse } from 'next/server'
import { compare, hash } from 'bcryptjs'
import { db } from '@/lib/db'
import { requireSession, handleApiError, jsonError } from '@/lib/api-helpers'
import { updateProfileSchema, changePasswordSchema } from '@/lib/validations/user'
import { sendSecurityAlert } from '@/lib/email/send'
import { after } from 'next/server'

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
        // الجولة 61: صورة البروفايل — معرف الـBLOB لعرض الصورة وإدارتها في الملف الشخصي
        profilePhotoBlobId: true,
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

      // الجولة 51: تنبيه أمان مقفول — يُرسل دائماً لمن أكّد بريده، ولا يؤخر ولا يعطل الاستجابة
      try {
        after(sendSecurityAlert(session.user.id, {
          title: '🛡️ تم تغيير كلمة المرور',
          subject: 'تم تغيير كلمة المرور الخاصة بحسابك',
          lines: [
            'تم تغيير كلمة المرور الخاصة بحسابك في منصة تكليفات للتو.',
            'إذا كنت أنت من قام بهذا التغيير يمكنك تجاهل هذه الرسالة. إذا لم تكن أنت، يُرجى تغيير كلمة المرور فوراً والتواصل مع الإدارة.',
          ],
        }))
      } catch {
        // خارج سياق طلب نشط — البريد لا يعمل سيرفرياً هنا؛ تجاهل آمن
      }

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
