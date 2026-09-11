import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError, ApiError } from '@/lib/api-helpers'
import { notify } from '@/lib/notifications'
import { getSettings } from '@/lib/settings'

/**
 * PATCH /api/me/invitations/[id] — رد الكادر على الاستدعاء { action: 'ACCEPT' | 'DECLINE' }
 * القبول يُنشئ تقديماً (نفس شروط التقديم: حساب معتمد + مستندات + تكليف مفتوح + رسوم مسددة)
 * ويُشعر المستلم الإداري. الرفض يُشعر المستلم أيضاً كي يستدعي غيره.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('NURSE', 'DOCTOR')
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const action = body?.action === 'ACCEPT' ? 'ACCEPT' : body?.action === 'DECLINE' ? 'DECLINE' : null
    if (!action) return jsonError('الإجراء غير صحيح (ACCEPT أو DECLINE)', 422)

    const invitation = await db.nurseInvitation.findUnique({
      where: { id },
      include: {
        post: { select: { id: true, title: true, status: true, value: true, facility: true } },
      },
    })
    if (!invitation) return jsonError('الاستدعاء غير موجود', 404)
    if (invitation.nurseId !== session.user.id) {
      throw new ApiError('يمكنك الرد على استدعاءاتك فقط', 403)
    }
    if (invitation.status !== 'PENDING') {
      return jsonError(`تم الرد على هذا الاستدعاء مسبقاً (${invitation.status})`, 409)
    }

    if (action === 'DECLINE') {
      await db.nurseInvitation.update({
        where: { id },
        data: { status: 'DECLINED', respondedAt: new Date() },
      })
      await notify(invitation.receiverId, {
        title: 'رفض استدعاء',
        body: `${session.user.name} رفض الاستدعاء للتكليف (${invitation.post.title}) — يمكنك استدعاء كادر آخر`,
        type: 'INVITATION_DECLINED',
        link: '/receiver/assignments',
      })
      return NextResponse.json({ message: 'تم رفض الاستدعاء — شكراً لتوضيحك' })
    }

    // ---------- القبول: يُنشئ تقديماً بشروط التقديم نفسها ----------
    if (session.user.status !== 'APPROVED') {
      throw new ApiError('حسابك قيد المراجعة — يمكنك قبول الاستدعاءات بعد اعتماد حسابك', 403)
    }
    const documentsCount = await db.document.count({ where: { userId: session.user.id } })
    if (documentsCount === 0) {
      throw new ApiError('ارفع مستنداتك أولاً (الهوية وصورة المزاولة) ثم اقبل الاستدعاء', 403)
    }
    if (invitation.post.status !== 'OPEN') {
      return jsonError('هذا التكليف لم يعد متاحاً — أبلغ الجهة المستدعِية', 409)
    }
    const existingApp = await db.application.findUnique({
      where: { postId_nurseId: { postId: invitation.postId, nurseId: session.user.id } },
    })
    if (existingApp) {
      // قدّم مسبقاً — نُغلق الاستدعاء فقط
      await db.nurseInvitation.update({
        where: { id },
        data: { status: 'ACCEPTED', respondedAt: new Date() },
      })
      return NextResponse.json({ message: 'لقد قدّمت على هذا التكليف مسبقاً — سُجل قبولك للاستدعاء' })
    }

    // منع التقديم قبل تسوية رسوم تكليف سابق (القاعدة العامة)
    const unpaid = await db.assignment.findFirst({
      where: { nurseId: session.user.id, paymentStatus: 'UNPAID', status: { not: 'CANCELLED' } },
      select: { id: true, title: true },
      orderBy: { createdAt: 'desc' },
    })
    if (unpaid) {
      throw new ApiError(
        `سوِّ رسوم تكليفك السابق (${unpaid.title}) مع الإدارة أولاً ثم اقبل الاستدعاء`,
        403
      )
    }

    const settings = await getSettings()
    const [, application] = await Promise.all([
      db.nurseInvitation.update({
        where: { id },
        data: { status: 'ACCEPTED', respondedAt: new Date() },
      }),
      db.application.create({
        data: { postId: invitation.postId, nurseId: session.user.id, status: 'PENDING' },
        select: { id: true, status: true, createdAt: true },
      }),
    ])

    await notify(invitation.receiverId, {
      title: 'تم قبول استدعائك',
      body: `${session.user.name} قبل الاستدعاء وتقدم للتكليف (${invitation.post.title}) — راجع التقديم واعتمده`,
      type: 'INVITATION_ACCEPTED',
      link: '/receiver/assignments',
    })

    return NextResponse.json({
      message: `تم قبول الاستدعاء وإرسال تقديمك على (${invitation.post.title}) — بانتظار الاعتماد`,
      application,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
