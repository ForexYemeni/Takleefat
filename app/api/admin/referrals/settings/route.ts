import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { referralSettingsSchema } from '@/lib/validations/referral'
import { getReferralSettings, logReferralAudit } from '@/lib/referrals'

/**
 * GET/PUT /api/admin/referrals/settings — إعدادات برنامج الإحالة (الجولة 75)
 * ------------------------------------------------------------
 * الإدارة حصراً: تفعيل/تعطيل النظام، نسبة الإحالة لكل دور، شروط الاستحقاق،
 * الحد الأقصى، عدد الإحالات، الحد الأدنى للعملية، مدة الصلاحية، شمول
 * التكليفات/الفرص، مراجعة المزايا، ونص سياسة المزايا.
 * لا يمس أي إعدادات قائمة (Setting key/value الرسوم وطرق الدفع كما هي).
 */
export async function GET() {
  try {
    await requireRole('ADMIN')
    const settings = await getReferralSettings()
    return NextResponse.json({ settings })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireRole('ADMIN')
    const body = await req.json().catch(() => null)
    const parsed = referralSettingsSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'الإعدادات المدخلة غير صحيحة', 422)
    }
    const data = parsed.data

    const before = await getReferralSettings()

    const settings = await db.referralSettings.upsert({
      where: { id: 'singleton' },
      update: {
        enabled: data.enabled,
        percentNURSE: data.percentNURSE,
        percentDOCTOR: data.percentDOCTOR,
        percentDOCTOR_SUPERVISOR: data.percentDOCTOR_SUPERVISOR,
        percentRECEIVER: data.percentRECEIVER,
        percentHR: data.percentHR,
        maxRewardPerReferral: data.maxRewardPerReferral,
        maxInvitesPerReferrer: data.maxInvitesPerReferrer,
        minOperationValue: data.minOperationValue,
        validityDays: data.validityDays,
        includeAssignments: data.includeAssignments,
        includeOpportunities: data.includeOpportunities,
        rewardsRequireReview: data.rewardsRequireReview,
        policyNote: data.policyNote?.trim() ? data.policyNote.trim() : null,
      },
      create: {
        id: 'singleton',
        enabled: data.enabled,
        percentNURSE: data.percentNURSE,
        percentDOCTOR: data.percentDOCTOR,
        percentDOCTOR_SUPERVISOR: data.percentDOCTOR_SUPERVISOR,
        percentRECEIVER: data.percentRECEIVER,
        percentHR: data.percentHR,
        maxRewardPerReferral: data.maxRewardPerReferral,
        maxInvitesPerReferrer: data.maxInvitesPerReferrer,
        minOperationValue: data.minOperationValue,
        validityDays: data.validityDays,
        includeAssignments: data.includeAssignments,
        includeOpportunities: data.includeOpportunities,
        rewardsRequireReview: data.rewardsRequireReview,
        policyNote: data.policyNote?.trim() ? data.policyNote.trim() : null,
      },
    })

    await logReferralAudit({
      actorId: session.user.id,
      actorRole: 'ADMIN',
      action: 'REFERRAL_SETTINGS_UPDATED',
      entityType: 'Settings',
      entityId: 'singleton',
      meta: {
        before: {
          enabled: before.enabled,
          percentNURSE: before.percentNURSE,
          percentDOCTOR: before.percentDOCTOR,
          percentDOCTOR_SUPERVISOR: before.percentDOCTOR_SUPERVISOR,
          percentRECEIVER: before.percentRECEIVER,
          percentHR: before.percentHR,
          validityDays: before.validityDays,
        },
        after: {
          enabled: settings.enabled,
          percentNURSE: settings.percentNURSE,
          percentDOCTOR: settings.percentDOCTOR,
          percentDOCTOR_SUPERVISOR: settings.percentDOCTOR_SUPERVISOR,
          percentRECEIVER: settings.percentRECEIVER,
          percentHR: settings.percentHR,
          validityDays: settings.validityDays,
        },
      },
    })

    return NextResponse.json({
      message: 'تم حفظ إعدادات برنامج الإحالة — تسري على كل الاحتسابات الجديدة فوراً',
      settings,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
