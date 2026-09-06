import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError } from '@/lib/api-helpers'
import { getSettings, calcAdminFee, calcApplicationFee } from '@/lib/settings'

/**
 * GET /api/me/applications — تقديمات الكادر التمريضي الحالي
 * تشمل بيانات التكليف المُعلن + تفاصيل الدفع بعد الاعتماد.
 */
export async function GET() {
  try {
    const session = await requireRole('NURSE')

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

    return NextResponse.json({ applications: enriched, settings })
  } catch (error) {
    return handleApiError(error)
  }
}
