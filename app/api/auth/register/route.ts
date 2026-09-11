import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { db } from '@/lib/db'
import { registerSchema } from '@/lib/validations/auth'
import { handleApiError, jsonError } from '@/lib/api-helpers'
import { notify } from '@/lib/notifications'

/**
 * POST /api/auth/register — إنشاء حساب جديد (كادر تمريضي / مستلم إداري / طبيب)
 * يبقى الحساب قيد المراجعة حتى اعتماده من مدير النظام.
 *
 * منظومة الأطباء:
 * - الطبيب يسجل ذاتياً بمؤهلات التخصص الطبي الخاصة (بكالوريوس طب وجراحة / ماجستير / دكتوراه / زمالة)
 * - مشرف الأطباء لا يُسجّل ذاتياً — تُنشئه الإدارة يدوياً (مثل المستلم الإداري)
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
      newOrg,
    } = parsed.data

    const existing = await db.user.findUnique({ where: { phone } })
    if (existing) {
      return jsonError('رقم الهاتف مسجل مسبقاً في المنصة', 409)
    }

    const hashedPassword = await hash(password, 12)

    // ---------- المستلم الإداري: جهة جديدة؟ تُنشأ بحالة PENDING للاعتماد من الإدارة ----------
    let pendingOrgName: string | null = null
    if (role === 'RECEIVER' && hospitalName) {
      const orgName = hospitalName.trim()
      const existingOrg = await db.hospital.findUnique({ where: { name: orgName } })
      if (!existingOrg) {
        // جهة جديدة (اسم غير موجود في كتالوج الإدارة) — تُسجل بانتظار اعتماد الإدارة
        // مع بقية بياناتها المُدخلة من المستلم الإداري
        await db.hospital.create({
          data: {
            name: orgName,
            type: newOrg?.type ?? 'HOSPITAL',
            city: newOrg?.city?.trim() || null,
            address: newOrg?.address?.trim() || null,
            phone: newOrg?.phone?.trim() || null,
            email: newOrg?.email?.trim() || null,
            status: 'PENDING',
            isActive: false,
          },
        })
        pendingOrgName = orgName
      }
    }

    const user = await db.user.create({
      data: {
        name: name.trim(),
        phone,
        password: hashedPassword,
        role,
        status: 'PENDING',
        ...(role === 'NURSE' || role === 'DOCTOR'
          ? {
              // التخصص إجباري للكادر والطبيب
              specialty: specialty?.trim() || null,
              qualification: qualification?.trim() || null,
              yearsOfExperience: yearsOfExperience ?? 0,
              // الجنس إجباري للكادر والطبيب (المتحقق في المخطط)
              gender: gender ?? null,
            }
          : {}),
        // الجهة الصحية (المستشفى) — للمستلم الإداري
        ...(role === 'RECEIVER' && hospitalName ? { hospitalName: hospitalName.trim() } : {}),
      },
      select: { id: true, name: true, phone: true, role: true },
    })

    // إشعار جميع مديري النظام بوجود طلب تسجيل جديد (+ جهة جديدة بانتظار الاعتماد)
    const admins = await db.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
    const roleLabel =
      role === 'DOCTOR' ? 'طبيب' : role === 'NURSE' ? 'كادر تمريضي' : 'مستلم إداري'
    const reviewLink =
      role === 'DOCTOR' ? '/admin/doctors' : role === 'NURSE' ? '/admin/nurses' : '/admin/receivers'
    await Promise.all([
      ...admins.map((admin) =>
        notify(admin.id, {
          title: 'طلب تسجيل جديد',
          body:
            role === 'NURSE' || role === 'DOCTOR'
              ? `${name} — ${roleLabel}${specialty ? ` — تخصص ${specialty}` : ''} — بانتظار اعتماد الحساب`
              : `${name} — طلب حساب مستلم إداري${hospitalName ? ` — الجهة الصحية: ${hospitalName.trim()}` : ''} — بانتظار الاعتماد`,
          type: 'GENERIC',
          link: reviewLink,
        })
      ),
      // إشعار الجهة الصحية الجديدة المقترحة
      ...(pendingOrgName
        ? admins.map((admin) =>
            notify(admin.id, {
              title: 'جهة صحية جديدة بانتظار الاعتماد',
              body: `أُضيفت جهة (${pendingOrgName}) من حساب جديد — راجع بياناتها في الجهات الصحية واعتمدها أو ارفضها`,
              type: 'GENERIC',
              link: '/admin/organizations',
            })
          )
        : []),
    ])

    return NextResponse.json(
      {
        message:
          role === 'NURSE' || role === 'DOCTOR'
            ? 'تم إنشاء حسابك بنجاح! يمكنك تسجيل الدخول فوراً — لكن التقديم على التكليفات لا يتاح إلا بعد رفع مستنداتك واعتماد حسابك من الإدارة.'
            : pendingOrgName
              ? 'تم إنشاء حسابك بنجاح! جهتك الصحية الجديدة أُرسلت للإدارة لاعتمادها — يمكنك تسجيل الدخول فوراً وسيتم تمكينك من إنشاء التكليفات بعد اعتماد حسابك وجهتك.'
              : 'تم إنشاء حسابك بنجاح! يمكنك تسجيل الدخول فوراً — وسيتم تمكينك من إنشاء التكليفات بعد اعتماد حسابك من الإدارة.',
        user,
      },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
