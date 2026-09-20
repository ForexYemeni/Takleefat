import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError } from '@/lib/api-helpers'
import { OPPORTUNITY_INTERVIEW_MODE_LABELS, OPPORTUNITY_TRANSACTION_STATUS_LABELS, OPPORTUNITY_PAYMENT_TIMING_LABELS } from '@/lib/forsah/constants'
import { assertForsahEnabled } from '@/lib/forsah/server'

/**
 * GET /api/me/opportunities — «فرصي» للكادر/الطبيب (الجولة 66 — المواصفة 23)
 * ============================================================
 * كل ما قدم عليه المستخدم بترتيبه الزمني مع حالة كل طلب (شاهدها/قدم/قيد
 * المراجعة/مرشح للمقابلة/مقابلة مؤكدة/تم اختياري/غير مقبول/منسحب/مغلقة)
 * + دعوات المقابلة التابعة له لعرضها وطلب الرد عليها.
 */
export async function GET(_req: NextRequest) {
  try {
    const session = await requireRole('NURSE', 'DOCTOR')
    const role = session.user.activeRole ?? session.user.role
    // الجولة 67: الإغلاق الكلي — الإدارة مستثناة (يعيد التشغيل من لوحته)
    await assertForsahEnabled(role)

    const applications = await db.opportunityApplication.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        opportunity: {
          include: {
            hospital: { select: { name: true, location: true } },
            specialty: { select: { name: true } },
            department: { select: { name: true } },
            _count: { select: { applications: true } },
          },
        },
        interviews: {
          orderBy: { scheduledDate: 'asc' },
        },
        selection: { select: { id: true, createdAt: true } },
      },
      take: 100,
    })

    // الجولة 70: بيانات الدفع للمرشح المختار — العملية المالية مرتبطة بالاختيار
    const selectionIds = applications.map((a) => a.selection?.id).filter((v): v is string => !!v)
    const transactions = selectionIds.length
      ? await db.opportunityTransaction.findMany({
          where: { selectionId: { in: selectionIds } },
          select: {
            selectionId: true,
            feeAmount: true,
            currency: true,
            feeType: true,
            feePercent: true,
            status: true,
            paymentTiming: true,
            paymentTimingChosenAt: true,
            paymentDueAt: true,
          },
        })
      : []
    const txBySelection = new Map(transactions.map((t) => [t.selectionId, t]))

    return NextResponse.json({
      applications: applications.map((a) => ({
        id: a.id,
        status: a.status,
        coverNote: a.coverNote,
        createdAt: a.createdAt,
        opportunityClosed: a.opportunity.status === 'CLOSED' || a.opportunity.status === 'ARCHIVED',
        opportunity: {
          id: a.opportunity.id,
          number: a.opportunity.number,
          title: a.opportunity.title,
          status: a.opportunity.status,
          hospitalName: a.opportunity.hospital.name,
          location: a.opportunity.hospital.location,
          audience: a.opportunity.audience,
          specialtyName: a.opportunity.specialty?.name ?? null,
          departmentName: a.opportunity.department?.name ?? null,
          salaryAmount: a.opportunity.salaryAmount,
          salaryType: a.opportunity.salaryType,
          salaryCurrency: a.opportunity.salaryCurrency,
          positionsNeeded: a.opportunity.positionsNeeded,
        },
        selected: !!a.selection,
        // الجولة 70: بيانات الدفع بعد الاختيار — الرسوم والحالة وتوقيت السداد المختار
        payment: (() => {
          if (!a.selection) return null
          const tx = txBySelection.get(a.selection.id)
          if (!tx) return null
          return {
            feeAmount: tx.feeAmount,
            currency: tx.currency,
            feeType: tx.feeType,
            feePercent: tx.feePercent,
            status: tx.status,
            statusLabel: OPPORTUNITY_TRANSACTION_STATUS_LABELS[tx.status],
            paymentTiming: tx.paymentTiming,
            paymentTimingLabel: tx.paymentTiming ? OPPORTUNITY_PAYMENT_TIMING_LABELS[tx.paymentTiming] : null,
            paymentTimingChosenAt: tx.paymentTimingChosenAt,
            paymentDueAt: tx.paymentDueAt,
          }
        })(),
        interviews: a.interviews.map((i) => ({
          id: i.id,
          scheduledDate: i.scheduledDate,
          scheduledTime: i.scheduledTime,
          mode: i.mode,
          modeLabel: OPPORTUNITY_INTERVIEW_MODE_LABELS[i.mode],
          location: i.location,
          address: i.address,
          mapUrl: i.mapUrl,
          notes: i.notes,
          response: i.response,
        })),
      })),
      viewerRole: role,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
