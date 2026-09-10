import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { db } from '@/lib/db'
import { registerSchema } from '@/lib/validations/auth'
import { handleApiError, jsonError } from '@/lib/api-helpers'
import { notify } from '@/lib/notifications'

/**
 * POST /api/auth/register — إنشاء حساب جديد (كادر تمريضي / مستلم إداري)
 * يبقى الحساب قيد المراجعة حتى اعتماده من مدير النظام.
 *
 * الجولة الثالثة عشرة:
 * - الاسم في حقل واحد (الاسم مع اللقب) + هاتف 9 أرقام + كلمة مرور مرة واحدة
 * - الكادر: المؤهل من 3 خيارات + الجنس إجباري + التخصص وسنوات الخبرة إجبارية من أقسام الإدارة
 * - المستلم: الجهة من قائمة الإدارة، أو جهة جديدة تُنشأ بحالة PENDING
 *   مع بقية بياناتها وترفع للاعتماد أو الرفض من حساب الإدارة.
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
        ...(role === 'NURSE'
          ? {
              // التخصص إجباري للكادر — يُختار من الأقسام المُدارة في حساب الإدارة
              specialty: specialty?.trim() || null,
              qualification,
              yearsOfExperience: yearsOfExperience ?? 0,
              // الجنس إجباري للكادر (المتحقق في المخطط)
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
    await Promise.all([
      ...admins.map((admin) =>
        notify(admin.id, {
          title: 'طلب تسجيل جديد',
          body:
            role === 'NURSE'
              ? `${name} — ${specialty ? `تخصص ${specialty} — ` : ''}بانتظار اعتماد الحساب`
              : `${name} — طلب حساب مستلم إداري${hospitalName ? ` — الجهة الصحية: ${hospitalName.trim()}` : ''} — بانتظار الاعتماد`,
          type: 'GENERIC',
          link: role === 'NURSE' ? '/admin/nurses' : '/admin/receivers',
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
          role === 'NURSE'
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
