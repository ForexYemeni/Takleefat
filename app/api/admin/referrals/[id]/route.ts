import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError, ApiError } from '@/lib/api-helpers'
import { referralStatusChangeSchema } from '@/lib/validations/referral'
import { logReferralAudit, REFERRAL_STATUS_LABELS } from '@/lib/referrals'

/**
 * PATCH /api/admin/referrals/[id] — إدارة حالة الإحالة (الجولة 75)
 * ------------------------------------------------------------
 * BLOCK: إقصاء الإحالة من النظام (حالة تلاعب/قرار إداري) — يمنع أي استحقاق لاحق
 *        على هذا المُحال (الاحتساب يشترط حالة VERIFIED/REWARDED).
 * UNBLOCK: إعادة الإحالة للسير الطبيعي — الموثق إن كان المُحال معتمداً
 *          وإلا «أنشأ حساباً» (يُقرأ من حالة الحساب الفعلية).
 * لا يمس الحساب نفسه ولا أي بيانات قائمة — إدارة حالة برنامج الإحالة فقط.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('ADMIN')
    const { id } = await params

    const body = await req.json().catch(() => null)
    const parsed = referralStatusChangeSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }
    const { action, note } = parsed.data

    const referral = await db.referral.findUnique({
      where: { id },
      include: {
        referred: { select: { id: true, status: true } },
        referrer: { select: { id: true, name: true } },
      },
    })
    if (!referral) throw new ApiError('الإحالة غير موجودة', 404)
    if (!referral.referredId) {
      throw new ApiError('لا يمكن تغيير حالة دعوة لم تُسجل بعد — بانتظار تسجيل المدعو', 409)
    }

    let newStatus: 'BLOCKED' | 'VERIFIED' | 'REGISTERED'
    if (action === 'BLOCK') {
      newStatus = 'BLOCKED'
    } else {
      // إعادة للسير الطبيعي حسب حالة الحساب الفعلية
      const referredStatus = referral.referred?.status
      newStatus = referredStatus === 'APPROVED' ? 'VERIFIED' : 'REGISTERED'
    }

    const updated = await db.referral.update({
      where: { id },
      data: { status: newStatus, note: note || referral.note },
    })

    await logReferralAudit({
      actorId: session.user.id,
      actorRole: 'ADMIN',
      action: 'REFERRAL_STATUS_CHANGED',
      entityType: 'Referral',
      entityId: id,
      meta: {
        action,
        from: referral.status,
        to: updated.status,
        note: note || null,
        referrerId: referral.referrerId,
      },
    })

    return NextResponse.json({
      message: `حالة الإحالة الآن: ${REFERRAL_STATUS_LABELS[updated.status] ?? updated.status}`,
      status: updated.status,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
