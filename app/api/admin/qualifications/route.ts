import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { updateQualificationSchema, qualificationCatalogSchema } from '@/lib/validations/user'
import { isValidQualification, qualificationErrorMessage, ensureQualificationDefaults } from '@/lib/qualifications'
import { notify } from '@/lib/notifications'

/**
 * قسم «المؤهلات العلمية» — الجولة 31/32
 * GET   /api/admin/qualifications — جميع الكوادر والأطباء مع مؤهلهم الحالي + كتالوج المؤهلات
 *         (كتالوج المُدار من الإدارة: إضافة/تعديل/تعطيل/حذف عبر POST و /[id])
 * PATCH /api/admin/qualifications — تعديل المؤهل العلمي لأي كادر/طبيب
 *         body: { userId, qualification }
 *         المؤهل يُتحقق منه من كتالوج المؤهلات العلمية (الجولة 32) — نفس قوائم التسجيل.
 * POST  /api/admin/qualifications — إضافة مؤهل علمي جديد للكتالوج
 *         body: { name, audience: 'NURSE' | 'DOCTOR' }
 */

export async function GET() {
  try {
    await requireRole('ADMIN')

    // تهيئة الكتالوج بالخيارات التاريخية عند أول استخدام (مرة واحدة لكل جمهور)
    await ensureQualificationDefaults()

    const [users, catalog] = await Promise.all([
      db.user.findMany({
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
      }),
      db.qualification.findMany({ orderBy: [{ audience: 'asc' }, { createdAt: 'asc' }] }),
    ])

    // عدد المستخدمين الحاملين لكل مؤهل — لإظهار «قيد الاستخدام» قبل الحذف
    const usage = await db.user.groupBy({
      by: ['qualification'],
      where: { role: { in: ['NURSE', 'DOCTOR'] }, qualification: { not: null } },
      _count: true,
    })
    const usageMap = new Map(usage.map((u) => [u.qualification, u._count]))

    return NextResponse.json({
      users,
      catalog: catalog.map((q) => ({
        id: q.id,
        name: q.name,
        audience: q.audience,
        isActive: q.isActive,
        createdAt: q.createdAt,
        usersCount: usageMap.get(q.name) ?? 0,
      })),
    })
  } catch (error) {
    return handleApiError(error)
  }
}

/** إضافة مؤهل علمي جديد إلى الكتالوج — يظهر فوراً في كل نماذج التسجيل والإسناد */
export async function POST(req: NextRequest) {
  try {
    await requireRole('ADMIN')

    const parsed = qualificationCatalogSchema.safeParse(await req.json())
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const name = parsed.data.name.trim()
    const audience = parsed.data.audience

    const exists = await db.qualification.findUnique({ where: { name } })
    if (exists) {
      return jsonError(
        exists.audience === audience
          ? 'هذا المؤهل مضاف مسبقاً في الكتالوج'
          : `هذا المؤهل مضاف مسبقاً لجمهور ${exists.audience === 'DOCTOR' ? 'الأطباء' : 'الكادر التمريضي'}`,
        409
      )
    }

    const qualification = await db.qualification.create({ data: { name, audience } })

    return NextResponse.json(
      {
        message: `تمت إضافة المؤهل «${name}» إلى كتالوج ${audience === 'DOCTOR' ? 'الأطباء' : 'الكادر التمريضي'} — أصبح متاحاً في كل النماذج`,
        qualification,
      },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}

/** تعديل المؤهل العلمي لحساب كادر/طبيب — نفس العقد السابق (الجولة 31) مع تحقق الكتالوج */
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

    const audience = user.role === 'DOCTOR' ? 'DOCTOR' : 'NURSE'
    if (!(await isValidQualification(qualification, audience))) {
      return jsonError(qualificationErrorMessage(audience), 422)
    }

    const updated = await db.user.update({
      where: { id: userId },
      data: { qualification: qualification.trim() },
      select: { id: true, name: true, role: true, qualification: true },
    })

    // إشعار صاحب الحساب بتحديث مؤهله
    await notify(userId, {
      title: 'تم تحديث مؤهلك العلمي',
      body: `قامت إدارة المنصة بتحديث مؤهلك العلمي إلى: ${updated.qualification}`,
      type: 'GENERIC',
    })

    return NextResponse.json({
      message: `تم تحديث المؤهل العلمي لـ (${updated.name}) إلى: ${updated.qualification}`,
      user: updated,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
