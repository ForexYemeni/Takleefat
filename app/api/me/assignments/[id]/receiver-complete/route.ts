import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { notify, notifyAdmins } from '@/lib/notifications'
import { getSettings, effectiveSharePercent } from '@/lib/settings'
import { calcReceiverEarning } from '@/lib/fees'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { resolveReceiverOrg } from '@/lib/network'

const ratingAxis = z
  .number({ error: 'التقييم غير صحيح' })
  .int('التقييم يجب أن يكون رقماً صحيحاً')
  .min(1, 'التقييم من نجمة واحدة كحد أدنى')
  .max(5, 'التقييم خمس نجوم كحد أقصى')

const receiverCompleteSchema = z.object({
  // هل تم الدفع للكادر؟ — إلزامي (نعم / لا)
  nursePaid: z.boolean({ error: 'يجب تحديد هل تم الدفع للكادر أم لا' }),
  // الجولة 46 — البلاغ الحرفي: «المستلم الاداري او مشرف الاطباء يتمكن من
  // انهاء التكليف قبل اكتماله مع ذكر السبب» — سبب الإنهاء المبكر إلزامي
  // عند الإنهاء قبل بلوغ وقت انتهاء التكليف (يُدقق في المتن أدناه)
  reason: z
    .string()
    .trim()
    .min(3, 'اذكر سبب إنهاء التكليف قبل اكتمال وقته — 3 أحرف على الأقل')
    .max(500, 'سبب الإنهاء طويل جداً — 500 حرف كحد أقصى')
    .optional()
    .or(z.literal('')),
  // التقييم الاحترافي للكادر
  rating: z.object({
    overall: ratingAxis,
    punctuality: ratingAxis.optional(),
    quality: ratingAxis.optional(),
    communication: ratingAxis.optional(),
    discipline: ratingAxis.optional(),
    comment: z.string().max(600, 'التعليق طويل جداً').optional().or(z.literal('')),
  }),
})

/**
 * POST /api/me/assignments/[id]/receiver-complete
 * المستلم الإداري أو مشرف الأطباء: «تم انتهاء التكليف» + التقييم الاحترافي
 * =====================================================================
 * الجولة 39 — الإنهاء والتقييم حتى لو أُغلق التكليف من حساب الكادر:
 *  - يعمل من أي حالة سارية: ACTIVE (بانتظار الاستلام — يُسجل الاستلام تلقائياً)
 *    أو RECEIVED — سواء أكّد الكادر إنهاء التكليف من حسابه أو قبل ذلك.
 *  - لو أُغلق التكليف من الإدارة (COMPLETED) دون إنهاء المستلم، يستطيع
 *    المستلم/المشرف تسجيل الإنهاء والإجابة عن الدفع والتقييم.
 *  - التكليف الملغى لا يُنهى أبداً، والتكليف المُنهى من المستلم نفسه لا يتكرر.
 *  - نطاق مشرف الأطباء: تكليفاته هو، وتكليفات أطباء جهته الصحية (ارتباط
 *    ساري: يعمل حالياً/معتمد) — والمستلم الإداري تكليفاته هو حصراً.
 *
 * الخطوات:
 * 1) هل تم الدفع للكادر؟ (يُسجَّل)
 * 2) تقييم احترافي (نجوم + محاور + تعليق) — يظهر في ملف الكادر وسيرته الذاتية
 * 3) ربح المستلم الإداري صاحب التكليف (نسبة من التكليف تُحتسب من حساب الإدارة)
 * 4) الحالة النهائية: مكتمل + إشعار الكادر والإدارة
 *
 * الجولة 46 — الإنهاء المبكر بسببي إلزامي:
 *  - المستلم الإداري ومشرف الأطباء يمكنهم إنهاء التكليف قبل اكتمال وقته —
 *    مع ذكر السبب إلزامياً (reason) ويُحفظ في earlyEndReason ويُوثَّق في
 *    سجل التكليف ويُرسل للكادر في الإشعار — بشفافية كاملة.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('RECEIVER', 'DOCTOR_SUPERVISOR')
    const { id } = await params

    const parsed = receiverCompleteSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const assignment = await db.assignment.findUnique({
      where: { id },
      include: {
        receiver: { select: { id: true, commissionPercent: true } },
        nurse: {
          select: {
            id: true,
            name: true,
            role: true,
            affiliations: { select: { hospitalId: true, status: true } },
          },
        },
      },
    })
    if (!assignment) return jsonError('التكليف غير موجود', 404)

    // الجولة 39 — نطاق الوصول: صاحب التكليف، أو مشرف الأطباء لطبيب من جهته الصحية
    const isOwner = assignment.receiverId === session.user.id
    let hasAccess = isOwner
    if (!hasAccess && session.user.role === 'DOCTOR_SUPERVISOR') {
      const org = await resolveReceiverOrg(session.user.id)
      hasAccess =
        !!org &&
        assignment.nurse.role === 'DOCTOR' &&
        assignment.nurse.affiliations.some(
          (af) => af.hospitalId === org.id && (af.status === 'WORKING' || af.status === 'ENDORSED')
        )
    }
    if (!hasAccess) {
      return jsonError('ليست لديك صلاحية على هذا التكليف', 403)
    }

    if (assignment.status === 'CANCELLED') {
      return jsonError('لا يمكن إنهاء تكليف ملغى', 409)
    }
    if (assignment.status === 'COMPLETED' && assignment.receiverDoneAt) {
      return jsonError('تم إنهاء هذا التكليف مسبقاً', 409)
    }

    const { nursePaid, rating, reason } = parsed.data

    // الجولة 46 — الإنهاء المبكر يتطلب سبباً إلزامياً: التكليف الساري
    // الذي لم يبلغ وقت انتهائه بعد لا يُنهى من المساند إلا بذكر السبب
    const timeComplete =
      !assignment.endDate || Number.isNaN(new Date(assignment.endDate).getTime())
        ? true
        : Date.now() >= new Date(assignment.endDate).getTime()
    const isEarlyEnd = !timeComplete && assignment.status !== 'COMPLETED'
    if (isEarlyEnd && !reason?.trim()) {
      return jsonError(
        'أنهاء التكليف قبل اكتمال وقته يتطلب ذكر السبب إلزامياً — اشرح سبب الإنهاء المبكر',
        422
      )
    }

    // نسبة صاحب التكليف — تُحتسب من قيمة التكليف وتُخصم من حساب الإدارة
    // الجولة 32: نسبة مخصصة على الحساب إن عيّنتها الإدارة، وإلا التلقائي (نصف نسبة الإدارة)
    // الجولة 39: الربح يبقى لصاحب التكليف حتى لو أنّهه مشرف الأطباء
    const settings = await getSettings()
    const sharePercent = effectiveSharePercent(assignment.receiver, settings)
    const earningAmount = calcReceiverEarning(assignment.value, sharePercent)

    const [updated] = await db.$transaction([
      db.assignment.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          // الإنهاء من «بانتظار الاستلام» يسجّل الاستلام تلقائياً — والإنهاء
          // بعد إغلاق الإدارة يحفظ تاريخ إنهاء المستلم الحقيقي
          receivedAt: assignment.receivedAt ?? new Date(),
          receiverDoneAt: assignment.receiverDoneAt ?? new Date(),
          nursePaid,
          // الجولة 46: سبب الإنهاء المبكر — يُحفظ عند الإنهاء قبل اكتمال الوقت
          ...(isEarlyEnd && reason?.trim() ? { earlyEndReason: reason.trim() } : {}),
        },
      }),
      // تقييم احترافي واحد لكل تكليف (upsert للسماح بإعادة الإرسال عند الفشل الجزئي)
      db.nurseRating.upsert({
        where: { assignmentId: id },
        update: {
          overall: rating.overall,
          punctuality: rating.punctuality ?? null,
          quality: rating.quality ?? null,
          communication: rating.communication ?? null,
          discipline: rating.discipline ?? null,
          comment: rating.comment?.trim() || null,
          receiverId: session.user.id,
        },
        create: {
          assignmentId: id,
          nurseId: assignment.nurseId,
          receiverId: session.user.id,
          overall: rating.overall,
          punctuality: rating.punctuality ?? null,
          quality: rating.quality ?? null,
          communication: rating.communication ?? null,
          discipline: rating.discipline ?? null,
          comment: rating.comment?.trim() || null,
        },
      }),
      // ربح المستلم الإداري صاحب التكليف من هذا التكليف
      ...(earningAmount > 0
        ? [
            db.receiverEarning.upsert({
              where: { assignmentId: id },
              update: { amount: earningAmount, percent: sharePercent },
              create: {
                assignmentId: id,
                receiverId: assignment.receiverId,
                amount: earningAmount,
                percent: sharePercent,
              },
            }),
          ]
        : []),
    ])

    await db.assignmentLog.create({
      data: {
        assignmentId: id,
        userId: session.user.id,
        action: isOwner ? 'إنهاء التكليف من المستلم الإداري' : 'إنهاء التكليف من مشرف الأطباء',
        note: `تم إنهاء التكليف${isEarlyEnd ? ' قبل اكتمال وقته' : ''} — تم الدفع للكادر: ${nursePaid ? 'نعم' : 'لا'} — تقييم الكادر: ${rating.overall}/5${isEarlyEnd && reason?.trim() ? ` — سبب الإنهاء المبكر: ${reason.trim()}` : ''}${earningAmount > 0 ? ` — ربح المستلم: ${formatCurrency(earningAmount)}` : ''}`,
      },
    })

    const stars = '★'.repeat(rating.overall) + '☆'.repeat(5 - rating.overall)
    await Promise.all([
      notify(assignment.nurseId, {
        title: isEarlyEnd ? 'تم إنهاء التكليف قبل اكتمال وقته وتقييمك' : 'تم إنهاء التكليف وتقييمك',
        body: `أنهى ${isOwner ? 'المستلم الإداري' : 'مشرف الأطباء'} التكليف (${assignment.title})${isEarlyEnd ? ' قبل اكتمال وقته المحدد' : ''} — تم الدفع لك: ${nursePaid ? 'نعم' : 'لا'} — تقييمك ${stars} (${rating.overall}/5)${isEarlyEnd && reason?.trim() ? ` — سبب الإنهاء المبكر: ${reason.trim()}` : ''}${rating.comment?.trim() ? ` — «${rating.comment.trim()}»` : ''}`,
        type: 'ASSIGNMENT_COMPLETED',
        link: assignment.nurse.role === 'DOCTOR' ? '/doctor/assignments' : '/nurse/assignments',
      }),
      // إشعار صاحب التكليف عند إنهائه من مشرف الأطباء (لا إشعار ذاتي للمُنهي نفسه)
      ...(isOwner
        ? []
        : [
            notify(assignment.receiverId, {
              title: 'إنهاء تكليف',
              body: `أُنهي التكليف (${assignment.title}) بنجاح — تقييم الكادر ${rating.overall}/5 بواسطة مشرف الأطباء (${session.user.name})`,
              type: 'ASSIGNMENT_COMPLETED',
              link: '/receiver/assignments',
            }),
          ]),
      notify(assignment.createdById, {
        title: 'إنهاء تكليف',
        body: `أُنهي التكليف (${assignment.title}) بنجاح${isEarlyEnd ? ' قبل اكتمال وقته' : ''}${isEarlyEnd && reason?.trim() ? ` — السبب: ${reason.trim()}` : ''}${earningAmount > 0 ? ` — ربح المستلم ${formatCurrency(earningAmount)}` : ''}`,
        type: 'ASSIGNMENT_COMPLETED',
        link: '/admin/assignments',
      }),
    ])
    // الجولة الخامسة عشرة: بقية المديرين يرون الإنهاء (غير مُنشئ التكليف المُشعَر أعلاه)
    await notifyAdmins(
      {
        title: 'إنهاء تكليف',
        body: `أُنهي التكليف (${assignment.title}) بنجاح${isEarlyEnd ? ' قبل اكتمال وقته — السبب: ' + (reason?.trim() ?? 'غير مذكور') : ''} — تقييم الكادر ${rating.overall}/5`,
        type: 'ASSIGNMENT_COMPLETED',
        link: '/admin/assignments',
      },
      assignment.createdById
    )

    return NextResponse.json({
      message: `تم إنهاء التكليف بنجاح${earningAmount > 0 && isOwner ? ` — أُضيف ربح ${formatCurrency(earningAmount)} إلى قسم أرباحك بتاريخ ${formatDateTime(updated.receiverDoneAt!)}` : ''}`,
      assignment: { id: updated.id, status: updated.status, nursePaid },
      earning: earningAmount > 0 && isOwner ? { amount: earningAmount, percent: sharePercent } : null,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
