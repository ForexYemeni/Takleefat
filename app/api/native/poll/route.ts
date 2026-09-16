import { NextRequest, NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'crypto'
import { db } from '@/lib/db'

/**
 * جلب الإشعارات الجديدة لجهاز أندرويد أصلي — الجولة 55
 *
 * يستدعيه تطبيق APK دورياً (كل دقيقة) من خدمة التنبيهات الأمامية التي
 * تعمل حتى لو كان التطبيق مغلق تماماً. يعيد الإشعارات الأحدث من
 * مؤشر آخر تسليم (lastDeliveredAt) ثم يقدّم المؤشر للأمام.
 *
 * الأمان:
 * - لا جلسات هنا: التحقق بزوج (deviceId, secret) — السر لا يُرسل إلا
 *   من التطبيق عبر HTTPS، والمقارنة زمنية-ثابتة timingSafeEqual.
 * - سر خاطئ أو جهاز معطّل → 401 (يعرف التطبيق أن يهدأ حتى إعادة الربط).
 * - لا يقبل إلا POST بجسم JSON صغير — لا params في الروابط ولا سجلات وصول حساسة.
 */

interface PollBody {
  deviceId?: string
  secret?: string
  limit?: number
}

/** مقارنة زمنية-ثابتة لسلاسل نصية (عبر هضم SHA-256 لتوحيد الطول) */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

export async function POST(req: NextRequest) {
  let body: PollBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_body' }, { status: 400 })
  }

  const deviceId = String(body.deviceId ?? '').trim()
  const secret = String(body.secret ?? '').trim()
  if (!deviceId || !secret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  try {
    const reg = await db.deviceRegistration.findUnique({ where: { deviceId } })
    if (!reg || !reg.isActive || !safeEqual(reg.secret, secret)) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const limit = Math.min(Math.max(Number(body.limit) || 10, 1), 20)

    const items = await db.notification.findMany({
      where: { userId: reg.userId, createdAt: { gt: reg.lastDeliveredAt } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    })

    if (items.length > 0) {
      await db.deviceRegistration.update({
        where: { deviceId },
        data: { lastDeliveredAt: items[items.length - 1].createdAt },
      })
    }

    return NextResponse.json({
      ok: true,
      notifications: items.map((n) => ({
        id: n.id,
        title: n.title,
        message: n.body ?? '',
        url: n.link || 'https://takleefat.vercel.app/',
        createdAt: n.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    console.error('[native/poll] فشل الاستعلام:', err)
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
