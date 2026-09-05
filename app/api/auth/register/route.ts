import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { db } from '@/lib/db'
import { registerSchema } from '@/lib/validations/auth'
import { handleApiError, jsonError } from '@/lib/api-helpers'
import { notify } from '@/lib/notifications'

/**
 * POST /api/auth/register
 * إنشاء حساب جديد للكادر التمريضي — يبقى الحساب قيد المراجعة
 * حتى اعتماده من مدير النظام.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = registerSchema.safeParse(body)

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? 'البيانات المدخلة غير صحيحة'
      return jsonError(firstError, 422)
    }

    const { name, phone, password, specialty, qualification, yearsOfExperience } = parsed.data

    const existing = await db.user.findUnique({ where: { phone } })
    if (existing) {
      return jsonError('رقم الهاتف مسجل مسبقاً في المنصة', 409)
    }

    const hashedPassword = await hash(password, 12)

    const user = await db.user.create({
      data: {
        name,
        phone,
        password: hashedPassword,
        role: 'NURSE',
        status: 'PENDING',
        specialty,
        qualification,
        yearsOfExperience,
      },
      select: { id: true, name: true, phone: true },
    })

    // إشعار جميع مديري النظام بوجود طلب تسجيل جديد
    const admins = await db.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
    await Promise.all(
      admins.map((admin) =>
        notify(admin.id, {
          title: 'طلب تسجيل جديد',
          body: `${name} — تخصص ${specialty} — بانتظار اعتماد الحساب`,
          type: 'GENERIC',
          link: '/admin/nurses',
        })
      )
    )

    return NextResponse.json(
      {
        message: 'تم إنشاء الحساب بنجاح. سيتم مراجعة الحساب واعتماده من إدارة المنصة.',
        user,
      },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
