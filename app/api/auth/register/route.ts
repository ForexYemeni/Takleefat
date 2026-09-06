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

    const {
      role = 'NURSE',
      name,
      phone,
      password,
      specialty,
      qualification,
      yearsOfExperience,
      gender,
      hospitalName,
    } = parsed.data

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
        role,
        status: 'PENDING',
        ...(role === 'NURSE'
          ? { specialty, qualification, yearsOfExperience, gender: gender ?? null }
          : {}),
        // الجهة الصحية (المستشفى) — للمستلم الإداري
        ...(role === 'RECEIVER' && hospitalName ? { hospitalName: hospitalName.trim() } : {}),
      },
      select: { id: true, name: true, phone: true, role: true },
    })

    // إشعار جميع مديري النظام بوجود طلب تسجيل جديد
    const admins = await db.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
    await Promise.all(
      admins.map((admin) =>
        notify(admin.id, {
          title: 'طلب تسجيل جديد',
          body:
            role === 'NURSE'
              ? `${name} — تخصص ${specialty} — بانتظار اعتماد الحساب`
              : `${name} — طلب حساب مستلم إداري${hospitalName ? ` — الجهة الصحية: ${hospitalName.trim()}` : ''} — بانتظار الاعتماد`,
          type: 'GENERIC',
          link: role === 'NURSE' ? '/admin/nurses' : '/admin/receivers',
        })
      )
    )

    return NextResponse.json(
      {
        message:
          role === 'NURSE'
            ? 'تم إنشاء حسابك بنجاح! يمكنك تسجيل الدخول فوراً — لكن التقديم على التكليفات لا يتاح إلا بعد رفع مستنداتك واعتماد حسابك من الإدارة.'
            : 'تم إنشاء حسابك بنجاح! يمكنك تسجيل الدخول فوراً — وسيتم تمكينك من إنشاء التكليفات بعد اعتماد حسابك من الإدارة.',
        user,
      },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
