import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { forsahFeeSettingsSchema, forsahSystemToggleSchema } from '@/lib/validations/forsah'
import { requireForsahPermission } from '@/lib/forsah/server'
import { setSetting, getSettings } from '@/lib/settings'
import { logForsahAudit } from '@/lib/forsah/audit'
import { FORSAH_PERMISSIONS, DEFAULT_HR_PERMISSIONS } from '@/lib/forsah/constants'

/**
 * GET /api/admin/forsah — نظرة الإدارة على منظومة «فرصة» (الجولة 66)
 * كل الفرص + حسابات الموارد البشرية + إعدادات الرسوم + آخر سجل تدقيق.
 * PATCH — تحديث إعدادات الرسوم والعمولات (الإدارة حصراً — المواصفة 16).
 */
export async function GET() {
  try {
    const session = await requireRole('ADMIN')
    await requireForsahPermission(session, 'opportunity.manage')

    const [opportunities, hrAccounts, settings, auditLogs] = await Promise.all([
      db.opportunity.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          hospital: { select: { name: true } },
          createdBy: { select: { id: true, name: true, jobTitle: true } },
          _count: { select: { applications: true, selections: true, interviews: true } },
        },
        take: 200,
      }),
      db.user.findMany({
        where: { role: 'HR' },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          jobTitle: true,
          hospitalName: true,
          status: true,
          forsahPermissions: true,
          forsahCommissionPercent: true,
          createdAt: true,
          _count: { select: { forsahOpportunitiesCreated: true } },
        },
      }),
      getSettings(),
      db.opportunityAuditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 60,
        include: { actor: { select: { name: true } } },
      }),
    ])

    return NextResponse.json({
      opportunities,
      hrAccounts: hrAccounts.map((h) => ({
        ...h,
        // كلمات المرور لا تُعاد أبداً — لسنا حتى تقرأها
        permissionsCount: h.forsahPermissions.length,
      })),
      feeSettings: {
        forsahFeeType: settings.forsahFeeType,
        forsahFeeValue: settings.forsahFeeValue,
        forsahHrCommissionPercent: settings.forsahHrCommissionPercent,
        forsahFeeMin: settings.forsahFeeMin,
        forsahFeeMax: settings.forsahFeeMax,
      },
      // الجولة 67: حالة النظام الكلية للإدارة
      systemEnabled: settings.forsahSystemEnabled,
      defaults: { permissions: DEFAULT_HR_PERMISSIONS, all: FORSAH_PERMISSIONS },
      auditLogs,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireRole('ADMIN')
    await requireForsahPermission(session, 'opportunity.manage')

    const body = await req.json().catch(() => ({}))

    // ---------- الجولة 67: الإغلاق الكلي لنظام «فرصة» — إدارة حصراً ----------
    if (typeof body?.systemEnabled === 'boolean') {
      const parsed = forsahSystemToggleSchema.safeParse(body)
      if (!parsed.success) {
        return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
      }
      const enabled = parsed.data.systemEnabled
      const current = await getSettings()
      if (current.forsahSystemEnabled === enabled) {
        return NextResponse.json({
          message: enabled ? 'نظام «فرصة» يعمل بالفعل' : 'نظام «فرصة» مغلق بالفعل',
          systemEnabled: enabled,
        })
      }
      await setSetting('forsahSystemEnabled', enabled ? '1' : '0')
      await logForsahAudit({
        actorId: session.user.id,
        actorRole: 'ADMIN',
        action: enabled ? 'FORSAH_SYSTEM_OPENED' : 'FORSAH_SYSTEM_CLOSED',
        entityType: 'Settings',
        entityId: 'forsah-system',
      })
      return NextResponse.json({
        message: enabled
          ? 'أُعيد تشغيل نظام «فرصة» — يعود ظاهراً لكل المستخدمين فوراً'
          : 'أُغلق نظام «فرصة» كلياً — اختفى من كل الواجهات وتوقفت كل مساراته (البيانات محفوظة كاملة)',
        systemEnabled: enabled,
      })
    }

    // ---------- إعدادات الرسوم (المواصفة 16) ----------
    const parsed = forsahFeeSettingsSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }
    const data = parsed.data
    if (data.forsahFeeMax > 0 && data.forsahFeeMax < data.forsahFeeMin) {
      return jsonError('الحد الأعلى للرسوم يجب أن يكون أكبر من الحد الأدنى', 422)
    }

    await Promise.all([
      setSetting('forsahFeeType', data.forsahFeeType),
      setSetting('forsahFeeValue', String(data.forsahFeeValue)),
      setSetting('forsahHrCommissionPercent', String(data.forsahHrCommissionPercent)),
      setSetting('forsahFeeMin', String(data.forsahFeeMin)),
      setSetting('forsahFeeMax', String(data.forsahFeeMax)),
    ])

    await logForsahAudit({
      actorId: session.user.id,
      actorRole: 'ADMIN',
      action: 'FEE_SETTINGS_CHANGED',
      entityType: 'Settings',
      entityId: 'forsah',
      meta: data,
    })

    return NextResponse.json({ message: 'حُفظت إعدادات رسوم «فرصة» — تسري على الاختيارات الجديدة' })
  } catch (error) {
    return handleApiError(error)
  }
}
