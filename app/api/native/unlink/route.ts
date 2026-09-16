import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

/**
 * فك ربط جهاز أندرويد من حساب المستخدم — الجولة 55
 *
 * يُستدعى من داخل تطبيق APK عند تسجيل الخروج (عبر جسر TakleefatBridge)
 * حتى تتوقف خدمة التنبيهات عن الاستعلام لحساب من سجّل خروجه.
 * لا تُحذف السجلة — تُعطّل فقط (isActive=false) لأغراض التشخيص،
 * وسيقوم إعادة الربط لاحقاً بتفعيلها من جديد بسرّ محدّث.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  let body: { deviceId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_body' }, { status: 400 })
  }

  const deviceId = String(body.deviceId ?? '').trim()
  if (!deviceId) {
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 })
  }

  try {
    await db.deviceRegistration.updateMany({
      where: { deviceId, userId: session.user.id },
      data: { isActive: false },
    })
    // نجاح صامت حتى لو لم توجد السجلة — النتيجة المطلوبة هي نفسها
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[native/unlink] فشل فك الربط:', err)
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
