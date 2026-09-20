import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { hrUpdateSchema } from '@/lib/validations/forsah'
import { requireForsahPermission } from '@/lib/forsah/server'
import { FORSAH_PERMISSIONS } from '@/lib/forsah/constants'
import { logForsahAudit } from '@/lib/forsah/audit'
import { notify } from '@/lib/notifications'
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
