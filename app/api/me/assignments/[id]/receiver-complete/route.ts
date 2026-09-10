import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { notify, notifyAdmins } from '@/lib/notifications'
import { getSettings } from '@/lib/settings'
import { calcReceiverEarning } from '@/lib/fees'
import { formatCurrency, formatDateTime } from '@/lib/utils'

const ratingAxis = z
  .number({ error: 'التقييم غير صحيح' })
  .int('التقييم يجب أن يكون رقماً صحيحاً')
  .min(1, 'التقييم من نجمة واحدة كحد أدنى')
  .max(5, 'التقييم خمس نجوم كحد أقصى')

const receiverCompleteSchema = z.object({
  // هل تم الدفع للممرض؟ — إلزامي (نعم / لا)
  nursePaid: z.boolean({ error: 'يجب تحديد هل تم الدفع للممرض أم لا' }),
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
 * المستلم الإداري: «تم انتهاء التكليف»
 * 1) يسأل: هل تم الدفع للممرض؟ (يُسجَّل)
 * 2) تقييم الكادر بشكل احترافي (نجوم + محاور + تعليق) — يظهر في ملف الكادر
 *    ويُضاف إلى السيرة الذاتية عند التقديم لأي تكليف آخر
 * 3) يُحتسب ربح المستلم الإداري (نسبة من التكليف تُحتسب من حساب الإدارة)
 * 4) الحالة النهائية: مكتمل + إشعار الكادر والإدارة
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('RECEIVER')
    const { id } = await params

    const parsed = receiverCompleteSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const assignment = await db.assignment.findUnique({ where: { id } })
    if (!assignment) return jsonError('التكليف غير موجود', 404)
    if (assignment.receiverId !== session.user.id) {
      return jsonError('ليست لديك صلاحية على هذا التكليف', 403)
    }
    if (assignment.status === 'COMPLETED') {
      return jsonError('تم إنهاء هذا التكليف مسبقاً', 409)
    }
    if (assignment.status === 'CANCELLED') {
      return jsonError('لا يمكن إنهاء تكليف ملغى', 409)
    }

    const { nursePaid, rating } = parsed.data

    // نسبة المستلم الإداري — تُحتسب من قيمة التكليف وتُخصم من حساب الإدارة
    // (نفس دالة الاحتساب الموحدة المستخدمة في مسارات توزيع الإدارة — lib/fees.ts)
    const settings = await getSettings()
    const sharePercent = settings.receiverSharePercent
    const earningAmount = calcReceiverEarning(assignment.value, sharePercent)

    const [updated] = await db.$transaction([
      db.assignment.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          receiverDoneAt: new Date(),
          nursePaid,
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
      // ربح المستلم الإداري من هذا التكليف
      ...(earningAmount > 0
        ? [
            db.receiverEarning.upsert({
              where: { assignmentId: id },
              update: { amount: earningAmount, percent: sharePercent },
              create: {
                assignmentId: id,
                receiverId: session.user.id,
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
        action: 'إنهاء التكليف من المستلم الإداري',
        note: `تم إنهاء التكليف — تم الدفع للممرض: ${nursePaid ? 'نعم' : 'لا'} — تقييم الكادر: ${rating.overall}/5${earningAmount > 0 ? ` — ربح المستلم: ${formatCurrency(earningAmount)}` : ''}`,
      },
    })

    const stars = '★'.repeat(rating.overall) + '☆'.repeat(5 - rating.overall)
    await Promise.all([
      notify(assignment.nurseId, {
        title: 'تم إنهاء التكليف وتقييمك',
        body: `أنهى المستلم الإداري التكليف (${assignment.title}) — تم الدفع لك: ${nursePaid ? 'نعم' : 'لا'} — تقييمك ${stars} (${rating.overall}/5)${rating.comment?.trim() ? ` — «${rating.comment.trim()}»` : ''}`,
        type: 'ASSIGNMENT_COMPLETED',
        link: '/nurse/assignments',
      }),
      notify(assignment.createdById, {
        title: 'إنهاء تكليف',
        body: `أنهى المستلم الإداري التكليف (${assignment.title}) بنجاح${earningAmount > 0 ? ` — ربح المستلم ${formatCurrency(earningAmount)}` : ''}`,
        type: 'ASSIGNMENT_COMPLETED',
        link: '/admin/assignments',
      }),
    ])
    // الجولة الخامسة عشرة: بقية المديرين يرون الإنهاء (غير مُنشئ التكليف المُشعَر أعلاه)
    await notifyAdmins(
      {
        title: 'إنهاء تكليف',
        body: `أُنهي التكليف (${assignment.title}) بنجاح — تقييم الكادر ${rating.overall}/5`,
        type: 'ASSIGNMENT_COMPLETED',
        link: '/admin/assignments',
      },
      assignment.createdById
    )

    return NextResponse.json({
      message: `تم إنهاء التكليف بنجاح${earningAmount > 0 ? ` — أُضيف ربح ${formatCurrency(earningAmount)} إلى قسم أرباحك بتاريخ ${formatDateTime(updated.receiverDoneAt!)}` : ''}`,
      assignment: { id: updated.id, status: updated.status, nursePaid },
      earning: earningAmount > 0 ? { amount: earningAmount, percent: sharePercent } : null,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
