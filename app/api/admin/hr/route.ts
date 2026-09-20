import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { hrCreateSchema } from '@/lib/validations/forsah'
import { requireForsahPermission } from '@/lib/forsah/server'
import { DEFAULT_HR_PERMISSIONS } from '@/lib/forsah/constants'
import { logForsahAudit } from '@/lib/forsah/audit'
import { rateLimit } from '@/lib/rate-limit'
import { notify } from '@/lib/notifications'
import bcrypt from 'bcryptjs'

/**
 * مسار حسابات الموارد البشرية — الجولة 66 | ميزة «فرصة» (المواصفة 2)
 * ============================================================
 * POST /api/admin/hr — إنشاء HR من الإدارة حصراً (لا تسجيل ذاتي إطلاقاً):
 * الاسم واللقب / الهاتف / البريد إن وجد / المنشأة / المسمى الوظيفي /
 * كلمة المرور الأولية / حالة الحساب / الصلاحيات.
 * HR يدخل من تسجيل الدخول الحالي — لا نظام دخول منفصل (المواصفة 2).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole('ADMIN')
    await requireForsahPermission(session, 'opportunity.manage')

    if (!rateLimit(`forsah:hr-create:${session.user.id}`, 15, 60 * 60 * 1000)) {
      return jsonError('محاولات كثيرة — انتقل دقيقة وأعد المحاولة', 429)
    }

    const parsed = hrCreateSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }
    const data = parsed.data

    // فحص فريدية الهاتف — نفس قاعدة الحسابات القائمة
    const existing = await db.user.findUnique({ where: { phone: data.phone }, select: { id: true } })
    if (existing) return jsonError('رقم الهاتف مستخدم في حساب آخر — لا يمكن تكراره', 409)

    const hashed = await bcrypt.hash(data.password, 12)
    const permissions = Array.isArray(data.forsahPermissions) && data.forsahPermissions.length > 0
      ? data.forsahPermissions.filter((p) =>
          (['opportunity.view', 'opportunity.create', 'opportunity.edit', 'opportunity.publish', 'opportunity.pause', 'opportunity.close', 'opportunity.viewApplicants', 'opportunity.inviteInterview', 'opportunity.selectCandidate', 'opportunity.viewFinancials', 'opportunity.viewCommission', 'opportunity.manage'] as string[]).includes(p)
        )
      : DEFAULT_HR_PERMISSIONS

    const hr = await db.user.create({
      data: {
        name: data.name,
        phone: data.phone,
        email: data.email || null,
        hospitalName: data.hospitalName || null,
        jobTitle: data.jobTitle || null,
        password: hashed,
        role: 'HR',
        status: data.status,
        forsahPermissions: permissions,
        forsahCommissionPercent: data.forsahCommissionPercent,
      },
      select: { id: true, name: true, phone: true, status: true, forsahPermissions: true },
    })

    await logForsahAudit({
      actorId: session.user.id,
      actorRole: 'ADMIN',
      action: 'HR_CREATED',
      entityType: 'HR',
      entityId: hr.id,
      meta: { name: hr.name, permissions: permissions.length },
    })

    // ترحيب الحساب الجديد — يدخل من نفس تسجيل الدخول
    await notify(hr.id, {
      title: 'مرحباً بك في فريق «فرصة»',
      body: `أُنشئ حسابك كموارد بشرية${data.hospitalName ? ` في ${data.hospitalName}` : ''} — سجّل دخولك بنفس رقمك وكلمة المرور لبدء إدارة فرص العمل`,
      type: 'GENERIC',
      link: '/hr',
    })

    return NextResponse.json(
      { message: `أُنشئ حساب الموارد البشرية «${hr.name}» — يدخل من تسجيل الدخول الحالي`, hr },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
