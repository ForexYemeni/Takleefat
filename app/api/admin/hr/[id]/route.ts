import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { hrUpdateSchema, hrDeleteSchema } from '@/lib/validations/forsah'
import { requireForsahPermission } from '@/lib/forsah/server'
import { FORSAH_PERMISSIONS } from '@/lib/forsah/constants'
import { logForsahAudit } from '@/lib/forsah/audit'
import { notify } from '@/lib/notifications'
import { rateLimit } from '@/lib/rate-limit'
import bcrypt from 'bcryptjs'

/**
 * PATCH /api/admin/hr/[id] — إدارة حساب موارد بشرية (الإدارة حصراً — المواصفة 2)
 * الأفعال: UPDATE (بيانات) | SET_STATUS (تفعيل/تعطيل) | RESET_PASSWORD |
 * SET_PERMISSIONS — كل فعل يُسجَّل تدقيقاً ويتسري فوراً (الجلسة الحية تقرأ القاعدة).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('ADMIN')
    await requireForsahPermission(session, 'opportunity.manage')
    const { id } = await params

    const parsed = hrUpdateSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }
    const data = parsed.data

    const hr = await db.user.findUnique({
      where: { id },
      select: { id: true, name: true, role: true, status: true, forsahPermissions: true },
    })
    if (!hr || hr.role !== 'HR') return jsonError('حساب الموارد البشرية غير موجود', 404)

    let message = 'حُفظ التعديل'

    if (data.action === 'UPDATE') {
      await db.user.update({
        where: { id },
        data: {
          ...(data.name ? { name: data.name } : {}),
          ...(data.jobTitle !== undefined ? { jobTitle: data.jobTitle || null } : {}),
          ...(data.hospitalName !== undefined ? { hospitalName: data.hospitalName || null } : {}),
          ...(data.email !== undefined ? { email: data.email || null } : {}),
        },
      })
      await logForsahAudit({
        actorId: session.user.id,
        actorRole: 'ADMIN',
        action: 'HR_UPDATED',
        entityType: 'HR',
        entityId: id,
      })
      message = 'حُفظت بيانات الحساب'
    }

    if (data.action === 'SET_STATUS' && data.status) {
      await db.user.update({ where: { id }, data: { status: data.status } })
      const disabled = data.status === 'SUSPENDED'
      await logForsahAudit({
        actorId: session.user.id,
        actorRole: 'ADMIN',
        action: disabled ? 'HR_DISABLED' : 'HR_ENABLED',
        entityType: 'HR',
        entityId: id,
      })
      // تعطيل الحساب يمنع الدخول فوراً (سياسة الدخول القائمة ترفض SUSPENDED)
      await notify(id, {
        title: disabled ? 'عُطّل حسابك مؤقتاً' : 'أُعيد تفعيل حسابك',
        body: disabled
          ? 'عطّلت الإدارة حسابك مؤقتاً — تواصل مع الإدارة لأي استفسار'
          : 'يمكنك الآن الدخول وإدارة الفرص كالمعتاد',
        type: disabled ? 'ACCOUNT_REJECTED' : 'ACCOUNT_APPROVED',
        link: '/hr',
      })
      message = disabled ? 'عُطّل الحساب — الدخول محظور فوراً' : 'أُعيد تفعيل الحساب'
    }

    if (data.action === 'RESET_PASSWORD' && data.password) {
      const hashed = await bcrypt.hash(data.password, 12)
      await db.user.update({ where: { id }, data: { password: hashed } })
      await logForsahAudit({
        actorId: session.user.id,
        actorRole: 'ADMIN',
        action: 'HR_PASSWORD_RESET',
        entityType: 'HR',
        entityId: id,
      })
      message = 'أُعيد تعيين كلمة المرور — أخبر الحساب بكلمتها الجديدة'
    }

    if (data.action === 'SET_PERMISSIONS' && data.forsahPermissions) {
      const valid = data.forsahPermissions.filter((p) =>
        (FORSAH_PERMISSIONS as readonly string[]).includes(p)
      )
      await db.user.update({ where: { id }, data: { forsahPermissions: valid } })
      await logForsahAudit({
        actorId: session.user.id,
        actorRole: 'ADMIN',
        action: 'HR_PERMISSIONS_CHANGED',
        entityType: 'HR',
        entityId: id,
        meta: { permissions: valid },
      })
      message = 'حُدّثت صلاحيات الحساب — تسري فوراً على جلساته'
    }

    const fresh = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        status: true,
        forsahPermissions: true,
        forsahCommissionPercent: true,
        jobTitle: true,
        hospitalName: true,
      },
    })

    return NextResponse.json({ message, hr: fresh })
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * DELETE /api/admin/hr/[id] — حذف نهائي لحساب موارد بشرية (الجولة 68)
 * ============================================================
 * تأكيد إلزامي بكلمة مرور الإدارة المنفّذة (عملية لا رجعة فيها).
 * حفاظاً على السجلات بلا أي فقدان بيانات (قاعدة ADDITIVE):
 * - الفرص/دعوات المقابلة/الاختيارات التي أنشأها HR تُسند إلى حساب الإدارة المنفّذ
 *   (إعادة إسناد ملكية — تبقى قابلة للإدارة من الإدارة).
 * - تقديماته الشخصية وسجلات مشاهداته تُحذف معه (cascade القائم في السكيما).
 * - سجل التدقيق يبقى محفوظاً (actorId SetNull — التاريخ لا يُحذف أبداً).
 * - العملية كلها داخل معاملة واحدة: إما تكتمل كلها أو لا شيء.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('ADMIN')
    await requireForsahPermission(session, 'opportunity.manage')
    const { id } = await params

    if (!rateLimit(`forsah:hr-delete:${session.user.id}`, 5, 60 * 60 * 1000)) {
      return jsonError('محاولات كثيرة — انتقل دقيقة وأعد المحاولة', 429)
    }

    const parsed = hrDeleteSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'كلمة مرور الإدارة مطلوبة', 422)
    }

    const hr = await db.user.findUnique({
      where: { id },
      select: { id: true, name: true, role: true, hospitalName: true },
    })
    if (!hr || hr.role !== 'HR') return jsonError('حساب الموارد البشرية غير موجود', 404)

    // التأكيد بكلمة مرور الإدارة المنفّذة — حصراً
    const admin = await db.user.findUnique({
      where: { id: session.user.id },
      select: { password: true, name: true },
    })
    if (!admin?.password) {
      return jsonError('حسابك بلا كلمة مرور محلية — عيّن كلمة مرور أولاً لتأكيد عمليات الحذف', 403)
    }
    const ok = await bcrypt.compare(parsed.data.password, admin.password)
    if (!ok) return jsonError('كلمة مرور الإدارة غير صحيحة — أُلغي الحذف', 403)

    // معاملة الحذف الحفاظية: إعادة إسناد الملكية ثم حذف الحساب
    const reassigned = await db.$transaction(async (tx) => {
      const opportunities = await tx.opportunity.updateMany({
        where: { createdById: id },
        data: { createdById: session.user.id },
      })
      const interviews = await tx.opportunityInterview.updateMany({
        where: { createdById: id },
        data: { createdById: session.user.id },
      })
      const selections = await tx.opportunitySelection.updateMany({
        where: { selectedById: id },
        data: { selectedById: session.user.id },
      })
      await tx.user.delete({ where: { id } })
      return { opportunities: opportunities.count, interviews: interviews.count, selections: selections.count }
    })

    await logForsahAudit({
      actorId: session.user.id,
      actorRole: 'ADMIN',
      action: 'HR_DELETED',
      entityType: 'HR',
      entityId: id,
      meta: { name: hr.name, hospitalName: hr.hospitalName, ...reassigned },
    })

    const total = reassigned.opportunities + reassigned.interviews + reassigned.selections
    return NextResponse.json({
      message: total > 0
        ? `حُذف حساب «${hr.name}» نهائياً — أُسندت ${total} سجلاته الإدارية (فرص/مقابلات/اختيارات) إلى حسابك حفاظاً على السجلات`
        : `حُذف حساب «${hr.name}» نهائياً — لا سجلات إدارية بحاجة لإعادة إسناد`,
      reassigned,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
