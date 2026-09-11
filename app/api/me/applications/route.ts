import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError } from '@/lib/api-helpers'
import { getSettings, calcAdminFee, calcApplicationFee } from '@/lib/settings'
import {
  receiverPhoneForStaff,
  revealedReceiverIds,
} from '@/lib/phone-privacy'

/**
 * GET /api/me/applications — تقديمات الكادر التمريضي/الطبيب الحالي
 * تشمل بيانات التكليف المُعلن + تفاصيل الدفع بعد الاعتماد.
 * الجولة 35 (القفل التبادلي): رقم المستلم مقفل عن الكادر حتى يوجد تكليف
 * مشترك مسدّد النسبة أكده الإدارة — عندها يُفتح بنفس قاعدة التكليفات.
 */
export async function GET() {
  try {
    const session = await requireRole('NURSE', 'DOCTOR')

    const [applications, settings] = await Promise.all([
      db.application.findMany({
        where: { nurseId: session.user.id },
        orderBy: { createdAt: 'desc' },
        include: {
          post: {
            select: {
              id: true,
              title: true,
              description: true,
              facility: true,
              department: true,
              location: true,
              startDate: true,
              value: true,
              status: true,
              receiver: { select: { id: true, name: true, phone: true } },
            },
          },
        },
      }),
      getSettings(),
    ])

    // حساب المبلغ الواجب لكل تقديم — يُحصّل نوع واحد فقط حسب نمط الرسوم
    const enriched = applications.map((app) => {
      const adminFee = calcAdminFee(app.post.value, settings)
      const applicationFee = calcApplicationFee(settings)
      return {
        ...app,
        fees: {
          value: app.post.value,
          adminFee,
          applicationFee,
          dueToAdmin: adminFee + applicationFee,
          netForNurse: app.post.value - adminFee - applicationFee,
        },
      }
    })

    // الجولة 35: فتح تبادلي — المستلمون الذين لهم تكليف مسدّد مع الكادر الحالي
    const revealedReceivers = await revealedReceiverIds(
      session.user.id,
      applications.map((app) => app.post.receiver.id)
    )

    return NextResponse.json({
      applications: enriched.map((app) => ({
        ...app,
        post: {
          ...app.post,
          receiver: {
            ...app.post.receiver,
            ...receiverPhoneForStaff(
              app.post.receiver.phone,
              revealedReceivers.has(app.post.receiver.id)
            ),
          },
        },
      })),
      settings,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
