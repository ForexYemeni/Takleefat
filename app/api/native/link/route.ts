import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

/**
 * ربط جهاز أندرويد أصلي بحساب المستخدم — الجولة 55
 *
 * يستدعيه موقع تكليفات من داخل تطبيق APK الأصلي (عبر جسر TakleefatBridge)
 * بعد دخول المستخدم: يمرّر معرف الجهاز وسرّه ليربطهما بحسابه هنا.
 * بعدها تبدأ خدمة التنبيهات الأمامية في التطبيق باستقبال الإشعارات
 * الأصلية حتى لو كان التطبيق مغلق تماماً — بلا أي وسيط متصفح.
 *
 * الأمان:
 * - يتطلب جلسة صالحة (لا يمكن ربط جهاز بغير حسابك).
 * - deviceId بصيغة صارمة + سر بطول أدنى 16 محرفاً.
 * - الربط idempotent: إعادة الربط تُحدّث نفس السجل (جهاز واحد = سجل واحد).
 */

const DEVICE_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  let body: {
    deviceId?: string
    secret?: string
    model?: string
    appVersion?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_body' }, { status: 400 })
  }

  const deviceId = String(body.deviceId ?? '').trim()
  const secret = String(body.secret ?? '').trim()
  const model = String(body.model ?? '').trim().slice(0, 80) || null
  const appVersion = String(body.appVersion ?? '').trim().slice(0, 20) || null

  if (!DEVICE_ID_RE.test(deviceId) || secret.length < 16 || secret.length > 128) {
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 })
  }

  try {
    await db.deviceRegistration.upsert({
      where: { deviceId },
      update: {
        secret,
        userId: session.user.id,
        model,
        appVersion,
        isActive: true,
      },
      create: {
        deviceId,
        secret,
        userId: session.user.id,
        model,
        appVersion,
      },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[native/link] فشل ربط الجهاز:', err)
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
