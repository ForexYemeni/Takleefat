/**
 * فحص شامل للإشعارات الحقيقية الأخيرة مقابل الاشتراكات — قراءة فقط
 * node scripts/inspect-recent-notifications.mjs
 */
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'node:fs'

function dbUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  try {
    const env = readFileSync('.env.local', 'utf8')
    const m = env.match(/^DATABASE_URL="?([^"\n]+)"?/m)
    if (m) return m[1]
  } catch {}
  throw new Error('DATABASE_URL غير متوفر')
}

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl() } } })

const since = new Date(Date.now() - 72 * 60 * 60 * 1000)
const recent = await prisma.notification.findMany({
  where: { createdAt: { gte: since } },
  orderBy: { createdAt: 'desc' },
  take: 40,
  select: { id: true, userId: true, title: true, createdAt: true, isRead: true },
})
const users = await prisma.user.findMany({ select: { id: true, role: true, name: true } })
const subs = await prisma.pushSubscription.findMany({ select: { userId: true, endpoint: true, createdAt: true } })

console.log('=== الاشتراكات الحالية ===')
for (const s of subs) {
  const u = users.find((x) => x.id === s.userId)
  console.log(`- ${s.createdAt.toISOString()} | ${u ? u.role + ' «' + u.name + '»' : 'ORPHAN'} | ${s.endpoint.slice(0, 55)}`)
}

console.log(`\n=== إشعارات آخر 72 ساعة (${recent.length}) ===`)
for (const n of recent) {
  const u = users.find((x) => x.id === n.userId)
  const subCount = subs.filter((s) => s.userId === n.userId).length
  console.log(
    `${n.createdAt.toISOString()} | ${u ? u.role + ' «' + u.name + '»' : '؟'} | اشتراكات:${subCount} | ${n.title.slice(0, 60)}`
  )
}

const byRole = {}
for (const n of recent) {
  const u = users.find((x) => x.id === n.userId)
  const key = u ? u.role : '؟'
  byRole[key] = (byRole[key] || 0) + 1
}
console.log('\nأدوار المستهدفين:', JSON.stringify(byRole))

await prisma.$disconnect()
