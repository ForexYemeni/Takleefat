import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { isEmailServiceConfigured } from '@/lib/email/gas-client'
import { maskEmail } from '@/lib/email/config'

/**
 * لوحة إدارة البريد الإلكتروني — الجولة 51
 * GET   /api/admin/email — حالة الخدمة + إحصاءات الإرسال + آخر 20 سجل
 * PATCH /api/admin/email — مفتاح تشغيل/إيقاف الخدمة + بريد المرسل المعروض
 *
 * الروابط والأسرار تُقرأ من البيئة حصراً (GOOGLE_APPS_SCRIPT_URL/SECRET) —
 * الإدارة ترى حالة «مهيأة/غير مهيأة» دون عرض قيمها أبداً.
 */

export async function GET() {
  try {
    await requireRole('ADMIN')

    const [sentCount, failedCount, pendingCount, lastSent, recentLogs] = await Promise.all([
      db.emailLog.count({ where: { status: 'sent' } }),
      db.emailLog.count({ where: { status: 'failed' } }),
      db.emailLog.count({ where: { status: 'pending' } }),
      db.emailLog.findFirst({ where: { status: 'sent' }, orderBy: { sentAt: 'desc' }, select: { sentAt: true } }),
      db.emailLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          recipientUserId: true,
          recipientEmail: true,
          notificationType: true,
          subject: true,
          status: true,
          errorMessage: true,
          sentAt: true,
          createdAt: true,
        },
      }),
    ])

    const serviceEnabled =
      (await db.setting.findUnique({ where: { key: 'emailServiceEnabled' } }))?.value !== '0'
    const senderSetting = await db.setting.findUnique({ where: { key: 'emailSenderAddress' } })

    return NextResponse.json({
      service: {
        configured: isEmailServiceConfigured(),
        enabled: serviceEnabled,
        senderLabel: senderSetting?.value ?? '',
      },
      stats: { sent: sentCount, failed: failedCount, pending: pendingCount, lastSentAt: lastSent?.sentAt ?? null },
      logs: recentLogs.map((l) => ({
        ...l,
        recipientEmailMasked: l.recipientEmail ? maskEmail(l.recipientEmail) : '',
      })),
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireRole('ADMIN')
    const body = (await req.json().catch(() => ({}))) as {
      enabled?: boolean
      senderLabel?: string
    }

    if (typeof body.enabled === 'boolean') {
      await db.setting.upsert({
        where: { key: 'emailServiceEnabled' },
        update: { value: body.enabled ? '1' : '0' },
        create: { key: 'emailServiceEnabled', value: body.enabled ? '1' : '0' },
      })
    }

    if (typeof body.senderLabel === 'string') {
      const label = body.senderLabel.trim().slice(0, 120)
      await db.setting.upsert({
        where: { key: 'emailSenderAddress' },
        update: { value: label },
        create: { key: 'emailSenderAddress', value: label },
      })
    }

    return NextResponse.json({ message: 'تم تحديث إعدادات خدمة البريد' })
  } catch (error) {
    return handleApiError(error)
  }
}
