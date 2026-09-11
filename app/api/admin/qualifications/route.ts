import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { updateQualificationSchema } from '@/lib/validations/user'
import { QUALIFICATION_VALUES, DOCTOR_QUALIFICATION_VALUES } from '@/lib/validations/auth'
import { notify } from '@/lib/notifications'

/**
 * قسم «المؤهلات العلمية» — الجولة 31
 * GET   /api/admin/qualifications — جميع الكوادر التمريضية والأطباء مع مؤهلهم الحالي
 * PATCH /api/admin/qualifications — تعديل المؤهل العلمي لأي كادر/طبيب
 *         body: { userId, qualification }
 *         المؤهل يُتحقق منه من قائمة الدور: الكادر (3 خيارات) / الطبيب (4 خيارات)
 *         — نفس قوائم التسجيل تماماً لضمان توافق البيانات.
 */

export async function GET() {
  try {
    await requireRole('ADMIN')

    const users = await db.user.findMany({
      where: { role: { in: ['NURSE', 'DOCTOR'] } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        phone: true,
        role: true,
        status: true,
        specialty: true,
        qualification: true,
        yearsOfExperience: true,
        hospitalName: true,
        createdAt: true,
        // جهة الكادر الأولى (إذا أضافه مستلم/مشرف لجهته) — تُعرض في القائمة
        affiliations: {
          take: 1,
          orderBy: { createdAt: 'desc' as const },
          select: { hospital: { select: { name: true } } },
        },
        _count: { select: { documents: true } },
      },
    })

    return NextResponse.json({ users })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireRole('ADMIN')

    const parsed = updateQualificationSchema.safeParse(await req.json())
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const { userId, qualification } = parsed.data

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true, status: true },
    })
    if (!user) return jsonError('الحساب غير موجود', 404)

    // المؤهلات العلمية تُدار للكوادر التمريضية والأطباء حصراً — لا للمشرفين ولا للمستلمين ولا للمديرين
    if (user.role !== 'NURSE' && user.role !== 'DOCTOR') {
      return jsonError('المؤهلات العلمية قابلة للتعديل للكوادر التمريضية والأطباء فقط', 422)
    }

    // التحقق من قائمة الدور — نفس قوائم التسجيل تماماً
    const allowed: readonly string[] =
      user.role === 'DOCTOR' ? DOCTOR_QUALIFICATION_VALUES : QUALIFICATION_VALUES
    if (!allowed.includes(qualification)) {
      return jsonError(
        user.role === 'DOCTOR'
          ? 'مؤهل الطبيب يجب أن يكون من القائمة: بكالوريوس طب وجراحة / ماجستير / دكتوراه / شهادة زمالة'
          : 'مؤهل الكادر يجب أن يكون من القائمة: أورديلي سنة / دبلوم ثلاث سنوات / بكالوريوس أربع سنوات',
        422
      )
    }

    const updated = await db.user.update({
      where: { id: userId },
      data: { qualification },
      select: { id: true, name: true, role: true, qualification: true },
    })

    // إشعار صاحب الحساب بتحديث مؤهله
    await notify(userId, {
      title: 'تم تحديث مؤهلك العلمي',
      body: `قامت إدارة المنصة بتحديث مؤهلك العلمي إلى: ${qualification}`,
      type: 'GENERIC',
    })

    return NextResponse.json({
      message: `تم تحديث المؤهل العلمي لـ (${updated.name}) إلى: ${qualification}`,
      user: updated,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
