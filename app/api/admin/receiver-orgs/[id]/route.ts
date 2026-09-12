import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { notify } from '@/lib/notifications'
import { z } from 'zod'

/**
 * PATCH /api/admin/receiver-orgs/[id] — قرار الإدارة في طلب ربط جهة بمسؤول — الجولة 44
 *  - ACTIVE: يُعتمد الربط — تصبح الجهة فعّالة في حساب المسؤول فوراً (كوادر جهتي،
 *    مجتمع الكوادر، إضافة كوادر، نشر تكليفات لها) ويصل المسؤول إشعار بالموافقة.
 *  - REJECTED: يُرفض الطلب مع إشعار المسؤول بالسبب.
 * الاعتماد لا يفعّل جهة معطلة/معلقة بذاتها — حالة الجهة (PENDING) تُراجع من
 * صفحة الجهات الصحية نفسها كما هو الحال في بقية المسارات.
 */

const decisionSchema = z.object({
  status: z.enum(['ACTIVE', 'REJECTED'], { error: 'القرار غير صحيح' }),
  note: z.string().max(300, 'الملاحظة طويلة جداً').optional().or(z.literal('')),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('ADMIN')
    const { id } = await params

    const parsed = decisionSchema.safeParse(await req.json())
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }
    const { status, note } = parsed.data

    const link = await db.receiverOrgLink.findUnique({
      where: { id },
      include: {
        receiver: { select: { id: true, name: true } },
        hospital: { select: { id: true, name: true } },
      },
    })
    if (!link) return jsonError('طلب الربط غير موجود', 404)
    if (link.status !== 'PENDING') {
      return jsonError('تمت مراجعة هذا الطلب مسبقاً', 409)
    }

    await db.receiverOrgLink.update({
      where: { id },
      data: {
        status,
        note: note?.trim() || link.note,
        reviewedById: session.user.id,
        reviewedAt: new Date(),
      },
    })

    await notify(link.receiverId, {
      title: status === 'ACTIVE' ? 'تم اعتماد جهتك الصحية الجديدة' : 'لم يُعتمد طلب ربط الجهة',
      body:
        status === 'ACTIVE'
          ? `اعتمدت الإدارة ربط جهة (${link.hospital.name}) بحسابك — أصبحت جهة فعّالة في كوادر جهتي وتستطيع إدارة كوادرها ونشر تكليفاتها الآن`
          : `لم تعتمد الإدارة طلب ربط جهة (${link.hospital.name}) بحسابك${note?.trim() ? ` — السبب: ${note.trim()}` : ''}`,
      type: 'GENERIC',
      link: '/receiver/profile',
    })

    return NextResponse.json({
      message:
        status === 'ACTIVE'
          ? `تم اعتماد ربط جهة (${link.hospital.name}) بمسؤول ${link.receiver.name} — الجهة فعّالة في حسابه الآن`
          : `تم رفض طلب ربط جهة (${link.hospital.name}) بمسؤول ${link.receiver.name}`,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
