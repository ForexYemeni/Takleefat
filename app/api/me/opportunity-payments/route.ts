import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError, ApiError } from '@/lib/api-helpers'
import { forsahPaymentTimingSchema } from '@/lib/validations/forsah'
import { assertForsahEnabled } from '@/lib/forsah/server'
import { OPPORTUNITY_PAYMENT_TIMING_LABELS } from '@/lib/forsah/constants'
import { logForsahAudit } from '@/lib/forsah/audit'
import { getSettings } from '@/lib/settings'
import { saveImageToDb, validateImageFile } from '@/lib/storage'
import { notify } from '@/lib/notifications'

/**
 * مسار سداد رسوم «فرصة» من جهة المرشح — الجولة 70 + الجولة 71 (البوابة الإلزامية)
 * ============================================================
 * GET   /api/me/opportunity-payments — حالة بوابة السداد للمرشح (الجولة 71):
 *       أول عملية مالية عليه بتوقيت مختار ولم تُسدَّد بعد — تُعرض كبطاقة حاجبة
 *       غير قابلة للإغلاق إلا بعد رفع إثبات الدفع + تأكيد الإدارة،
 *       مع بيانات حساب الإدارة المالية (طريقة الدفع/رقم الحساب/اسم الحساب).
 * POST  /api/me/opportunity-payments — رفع صورة إثبات دفع الرسوم (الجولة 71):
 *       FormData: file (صورة مضغوطة من جهة العميل) + applicationId
 *       — تُخزن في قاعدة البيانات وتظهر للإدارة في «تأكيدات الدفع» للتأكيد/الرفض.
 * PATCH /api/me/opportunity-payments — اختيار توقيت سداد رسوم الخدمة (الجولة 70):
 *  - WITHIN_FIRST_TEN_DAYS: خلال أول 10 أيام من الدوام (مرن — يُحدد مع بدء الدوام)
 *  - DIRECT: دفع مباشر (يستحق فوراً)
 *  - AFTER_THREE_DAYS: بعد ثلاثة أيام من لحظة الاختيار
 * الحماية:
 *  - حصراً لصاحب الطلب نفسه — لا يمكن لغيره لمس عملية غيره.
 *  - لا اختيار توقيت/رفع إثبات إلا لطلب مُختار فعلاً وعليه عملية مالية قائمة.
 *  - لا تعديل التوقيت بعد السداد (PAID/COMPLETED) أو الإلغاء/الاسترداد.
 *  - كل عملية تُسجل في سجل تدقيق «فرصة» + إشعارات للإدارة وجهة التوظيف.
 */

/** الحالات التي يُسمح فيها باختيار/تغيير توقيت السداد أو رفع الإثبات */
const TIMING_EDITABLE_STATUSES = ['PENDING', 'AWAITING_PAYMENT'] as const

/** موعد الاستحقاق التقديري من التوقيت المختار */
function computePaymentDueAt(timing: 'WITHIN_FIRST_TEN_DAYS' | 'DIRECT' | 'AFTER_THREE_DAYS'): Date | null {
  const now = new Date()
  if (timing === 'DIRECT') return now
  if (timing === 'AFTER_THREE_DAYS') return new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
  // أول 10 أيام من الدوام — مرن لحظة بدء الدوام الفعلي
  return null
}

/**
 * GET /api/me/opportunity-payments — حالة بوابة السداد (الجولة 71)
 * أول عملية مالية للمرشح بتوقيت مختار ولم تُسدَّد (PENDING/AWAITING_PAYMENT):
 *  - paymentProofUrl موجودة → «بانتظار تأكيد الإدارة» — البطاقة تبقى حاجبة
 *  - paymentProofUrl غائبة  → «بانتظار رفع الإثبات» — الرفع إلزامي
 * مع بيانات حساب الإدارة المالية من إعدادات المنصة (يديرها حساب الإدارة).
 * العمليات المسددة (PAID/COMPLETED) والمرفوض إثباتها (حُسم) لا تُحجب البوابة.
 */
export async function GET() {
  try {
    const session = await requireRole('NURSE', 'DOCTOR')
    const role = session.user.activeRole ?? session.user.role
    await assertForsahEnabled(role)

    // اختيارات المرشح → عملياتها المالية النشطة (غير المسددة) بتوقيت مختار
    const selections = await db.opportunitySelection.findMany({
      where: { application: { userId: session.user.id } },
      select: {
        id: true,
        application: {
          select: {
            id: true,
            opportunity: { select: { id: true, title: true } },
          },
        },
      },
    })
    const selectionIds = selections.map((s) => s.id)
    const selectionMap = new Map(selections.map((s) => [s.id, s]))

    const transactions = selectionIds.length
      ? await db.opportunityTransaction.findMany({
          where: {
            selectionId: { in: selectionIds },
            status: { in: [...TIMING_EDITABLE_STATUSES] },
            paymentTiming: { not: null },
          },
          orderBy: { paymentTimingChosenAt: 'asc' },
        })
      : []

    const active = transactions[0] ?? null
    if (!active) {
      return NextResponse.json({ hasGate: false, gate: null, adminPayment: null })
    }

    const selection = selectionMap.get(active.selectionId)
    const settings = await getSettings()

    return NextResponse.json({
      hasGate: true,
      gate: {
        applicationId: selection?.application.id ?? null,
        transactionId: active.id,
        opportunityId: selection?.application.opportunity.id ?? null,
        opportunityTitle: selection?.application.opportunity.title ?? '',
        feeAmount: active.feeAmount,
        currency: active.currency,
        status: active.status,
        paymentTiming: active.paymentTiming,
        paymentTimingLabel: active.paymentTiming ? OPPORTUNITY_PAYMENT_TIMING_LABELS[active.paymentTiming] : null,
        paymentTimingChosenAt: active.paymentTimingChosenAt,
        paymentDueAt: active.paymentDueAt,
        paymentProofUrl: active.paymentProofUrl,
        paymentProofFileName: active.paymentProofFileName,
        paymentProofUploadedAt: active.paymentProofUploadedAt,
        paymentProofRejectionNote: active.paymentProofRejectionNote,
      },
      adminPayment: {
        method: settings.paymentMethod,
        accountNumber: settings.paymentAccountNumber,
        accountName: settings.paymentAccountName,
        notes: settings.paymentNotes,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * POST /api/me/opportunity-payments — رفع صورة إثبات دفع الرسوم (الجولة 71)
 * FormData: file (صورة فقط — تُضغط من جهة العميل) + applicationId
 * الشروط: صاحب الطلب حصراً + مُختار + توقيت سداد مختار + لا إثبات قائم بالفعل.
 * بعد الرفع تظهر الصورة للإدارة في تبويب «تأكيدات الدفع» للتأكيد أو الرفض.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole('NURSE', 'DOCTOR')
    const role = session.user.activeRole ?? session.user.role
    await assertForsahEnabled(role)

    const formData = await req.formData()
    const file = formData.get('file')
    const applicationId = String(formData.get('applicationId') ?? '')
    if (!applicationId) return jsonError('معرف الطلب مطلوب', 422)
    if (!(file instanceof File)) return jsonError('صورة إثبات الدفع مطلوبة', 422)

    const validationError = validateImageFile(file)
    if (validationError) return jsonError(validationError, 422)

    const application = await db.opportunityApplication.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        userId: true,
        selection: { select: { id: true } },
        opportunity: { select: { id: true, title: true, createdById: true } },
      },
    })
    if (!application) throw new ApiError('الطلب غير موجود', 404)
    if (application.userId !== session.user.id) {
      throw new ApiError('لا يمكنك رفع إثبات لعملية لا تخصك', 403)
    }
    if (!application.selection) {
      throw new ApiError('لم يتم اختيارك لهذه الفرصة بعد', 409)
    }

    const transaction = await db.opportunityTransaction.findUnique({
      where: { selectionId: application.selection.id },
    })
    if (!transaction) throw new ApiError('لا توجد رسوم مسجلة على هذا الطلب', 404)
    if (!TIMING_EDITABLE_STATUSES.includes(transaction.status as (typeof TIMING_EDITABLE_STATUSES)[number])) {
      throw new ApiError('تمت معالجة السداد أو أُغلقت العملية — لا حاجة لرفع إثبات', 409)
    }
    if (!transaction.paymentTiming) {
      throw new ApiError('اختر توقيت السداد أولاً ثم ارفع إثبات الدفع', 409)
    }
    if (transaction.paymentProofUrl) {
      throw new ApiError('إثبات الدفع مرفوع مسبقاً وبانتظار تأكيد الإدارة', 409)
    }

    const stored = await saveImageToDb(file)

    const updated = await db.opportunityTransaction.update({
      where: { id: transaction.id },
      data: {
        paymentProofUrl: stored.url,
        paymentProofFileName: stored.fileName,
        paymentProofUploadedAt: new Date(),
        paymentProofRejectedAt: null,
        paymentProofRejectionNote: null,
      },
      select: { id: true, paymentProofUrl: true, paymentProofFileName: true, paymentProofUploadedAt: true },
    })

    await logForsahAudit({
      actorId: session.user.id,
      actorRole: role,
      action: 'PAYMENT_PROOF_SUBMITTED',
      entityType: 'Transaction',
      entityId: transaction.id,
      meta: {
        applicationId,
        opportunityId: application.opportunity.id,
        feeAmount: transaction.feeAmount,
        fileName: stored.fileName,
      },
    })

    // إشعار الإدارة (تأكيدات الدفع) + جهة التوظيف (HR المالك)
    const admins = await db.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
    await Promise.all([
      ...admins.map((admin) =>
        notify(admin.id, {
          title: 'إثبات دفع رسوم «فرصة» بانتظار التأكيد',
          body: `${session.user.name} رفع إثبات دفع رسوم فرصة «${application.opportunity.title}» (${transaction.feeAmount.toLocaleString('ar-YE')} ${transaction.currency}) — راجعه وأكد الدفع`,
          type: 'OPPORTUNITY_PAYMENT_PROOF_SUBMITTED',
          link: '/admin/forsah',
        })
      ),
      ...(application.opportunity.createdById !== session.user.id
        ? [
            notify(application.opportunity.createdById, {
              title: 'رفع المرشح إثبات سداد الرسوم',
              body: `${session.user.name} — فرصة «${application.opportunity.title}» — رفع إثبات الدفع وبانتظار تأكيد إدارة المنصة`,
              type: 'OPPORTUNITY_PAYMENT_PROOF_SUBMITTED',
              link: `/hr/opportunities/${application.opportunity.id}`,
            }),
          ]
        : []),
    ])

    return NextResponse.json(
      {
        message: 'تم رفع إثبات الدفع بنجاح — بانتظار تأكيد إدارة المنصة، وبعد التأكيد تُرفع البطاقة تلقائياً',
        proof: updated,
      },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireRole('NURSE', 'DOCTOR')
    const role = session.user.activeRole ?? session.user.role
    await assertForsahEnabled(role)

    const parsed = forsahPaymentTimingSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }
    const { applicationId, timing } = parsed.data

    // الطلب: له حصراً + مُختار فعلاً
    const application = await db.opportunityApplication.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        userId: true,
        status: true,
        selection: { select: { id: true } },
        opportunity: { select: { id: true, title: true, createdById: true } },
      },
    })
    if (!application) throw new ApiError('الطلب غير موجود', 404)
    if (application.userId !== session.user.id) {
      throw new ApiError('لا يمكنك تعديل عملية لا تخصك', 403)
    }
    if (!application.selection) {
      throw new ApiError('لم يتم اختيارك لهذه الفرصة بعد — يظهر توقيت السداد بعد الاختيار', 409)
    }

    const transaction = await db.opportunityTransaction.findUnique({
      where: { selectionId: application.selection.id },
    })
    if (!transaction) {
      throw new ApiError('لا توجد رسوم مستحقة على هذا الطلب — الفرصة بلا رسوم مسجلة', 404)
    }
    if (!TIMING_EDITABLE_STATUSES.includes(transaction.status as (typeof TIMING_EDITABLE_STATUSES)[number])) {
      throw new ApiError('لا يمكن تعديل توقيت السداد بعد تسديد الرسوم أو إغلاق العملية', 409)
    }

    // Idempotent: نفس التوقيت المختار مسبقاً — رسالة ودية بلا تكرار كتابة
    if (transaction.paymentTiming === timing) {
      return NextResponse.json({
        message: `توقيت السداد المختار مسبقاً: ${OPPORTUNITY_PAYMENT_TIMING_LABELS[timing]}`,
        payment: {
          feeAmount: transaction.feeAmount,
          currency: transaction.currency,
          status: transaction.status,
          paymentTiming: transaction.paymentTiming,
          paymentTimingLabel: OPPORTUNITY_PAYMENT_TIMING_LABELS[timing],
          paymentDueAt: transaction.paymentDueAt,
        },
      })
    }

    const dueAt = computePaymentDueAt(timing)
    const updated = await db.opportunityTransaction.update({
      where: { id: transaction.id },
      data: {
        paymentTiming: timing,
        paymentTimingChosenAt: new Date(),
        paymentDueAt: dueAt,
      },
    })

    await logForsahAudit({
      actorId: session.user.id,
      actorRole: role,
      action: 'PAYMENT_TIMING_SELECTED',
      entityType: 'Transaction',
      entityId: transaction.id,
      meta: {
        applicationId,
        opportunityId: application.opportunity.id,
        from: transaction.paymentTiming ?? null,
        to: timing,
        feeAmount: transaction.feeAmount,
      },
    })

    // إشعار جهة التوظيف (HR المالك) — يجهز لتحصيل الرسوم وفق التوقيت المختار
    if (application.opportunity.createdById !== session.user.id) {
      await notify(application.opportunity.createdById, {
        title: 'اختار المرشح توقيت سداد الرسوم',
        body: `${session.user.name} — فرصة «${application.opportunity.title}» — اختار: ${OPPORTUNITY_PAYMENT_TIMING_LABELS[timing]} — الرسوم: ${updated.feeAmount.toLocaleString('ar-YE')} ${updated.currency}`,
        type: 'OPPORTUNITY_PAYMENT_TIMING_SELECTED',
        link: `/hr/opportunities/${application.opportunity.id}`,
      })
    }

    return NextResponse.json({
      message: `تم اعتماد توقيت السداد: ${OPPORTUNITY_PAYMENT_TIMING_LABELS[timing]}`,
      payment: {
        feeAmount: updated.feeAmount,
        currency: updated.currency,
        status: updated.status,
        paymentTiming: updated.paymentTiming,
        paymentTimingLabel: OPPORTUNITY_PAYMENT_TIMING_LABELS[timing],
        paymentDueAt: updated.paymentDueAt,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
