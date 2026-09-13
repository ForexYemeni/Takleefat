import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { sendViaGas } from '@/lib/email/gas-client'

/**
 * إعادة إرسال رسالة فاشلة — للإدارة حصراً — الجولة 51
 * POST /api/admin/email/logs/[id]/retry
 *
 * يعيد إرسال نفس الحمولة المسجلة (payloadJson) بلا تعديل، ويحدّث السجل نفسه.
 * لا إعادة إرسال تلقائي غير محدود — الإدارة تقرر متى تُحاول.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole('ADMIN')
    const { id } = await params

    const log = await db.emailLog.findUnique({ where: { id } })
    if (!log) return jsonError('سجل الإرسال غير موجود', 404)
    if (log.status === 'sent') return jsonError('هذه الرسالة أُرسلت بنجاح بالفعل', 400)
    if (!log.payloadJson) return jsonError('لا توجد حمولة محفوظة لهذه الرسالة — أعد إنشاء الإشعار من مصدره', 400)

    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(log.payloadJson) as Record<string, unknown>
    } catch {
      return jsonError('الحمولة المحفوظة غير صالحة', 500)
    }

    const result = await sendViaGas(payload)

    if (result.ok) {
      await db.emailLog.update({
        where: { id },
        data: { status: 'sent', sentAt: new Date(), errorMessage: null },
      })
      return NextResponse.json({ message: 'تمت إعادة الإرسال بنجاح', status: 'sent' })
    }

    await db.emailLog.update({
      where: { id },
      data: { status: 'failed', errorMessage: result.error ?? 'فشل غير معروف' },
    })
    return NextResponse.json({ message: result.error ?? 'فشلت إعادة الإرسال — راجع حالة خدمة البريد', status: 'failed' }, { status: 502 })
  } catch (error) {
    return handleApiError(error)
  }
}
