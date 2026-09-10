/**
 * اختبار توصيل Push حقيقي من الخادم إلى الأجهزة المشتركة — قراءة الاشتراكات من قاعدة الإنتاج
 * الاستخدام:
 *   DATABASE_URL='postgresql://...' VAPID_PUBLIC_KEY='...' VAPID_PRIVATE_KEY='...' \
 *     node scripts/test-real-push.mjs
 * بلا أسرار مضمنة — كل القيم من البيئة. الاشتراكات المنتهية (404/410) تُحذف تلقائياً.
 */
import webpush from 'web-push'
import { PrismaClient } from '@prisma/client'

const DATABASE_URL = process.env.DATABASE_URL
const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY

if (!DATABASE_URL || !PUBLIC_KEY || !PRIVATE_KEY) {
  console.error('الاستخدام: DATABASE_URL=... VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... node scripts/test-real-push.mjs')
  process.exit(1)
}

const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } })

const payload = JSON.stringify({
  title: 'إشعار تجريبي — تكليفات',
  body: 'تم التحقق من التوصيل الفوري بنجاح — الإشعارات تعمل الآن بصوت وتنبيه منبثق',
  link: '/admin/assignments',
  tag: `test-${Date.now()}`,
})

const subs = await prisma.pushSubscription.findMany({
  select: { id: true, endpoint: true, p256dh: true, auth: true },
})
console.log(`عدد الاشتراكات: ${subs.length}`)

webpush.setVapidDetails('mailto:admin@takleefat.vercel.app', PUBLIC_KEY, PRIVATE_KEY)

let ok = 0, dead = 0, fail = 0
for (const sub of subs) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
      { TTL: 3600 }
    )
    ok++
    console.log(`✅ تم التوصيل — ${sub.endpoint.slice(0, 55)}`)
  } catch (err) {
    const status = err.statusCode
    if (status === 404 || status === 410) {
      await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
      dead++
      console.log(`🗑️ اشتراك منتهي (${status}) — حُذف — ${sub.endpoint.slice(0, 55)}`)
    } else {
      fail++
      console.log(`❌ فشل (${status ?? '؟'}) — ${String(err.message || err).slice(0, 120)}`)
    }
  }
}

console.log(`\nالنتيجة: وصل ${ok} / انتهى ${dead} / فشل ${fail}`)
await prisma.$disconnect()
