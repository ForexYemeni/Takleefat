/**
 * فحص اشتراكات الإشعارات الفورية في قاعدة الإنتاج — قراءة فقط
 * node scripts/check-prod-subs.mjs  (يقرأ DATABASE_URL من البيئة أو .env.local)
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
const subs = await prisma.pushSubscription.findMany({ select: { id: true, userId: true, createdAt: true, endpoint: true } })
const users = await prisma.user.findMany({ select: { id: true, role: true, name: true, status: true } })
const byRole = {}
for (const s of subs) {
  const u = users.find(x => x.id === s.userId)
  const key = u ? `${u.role}` : 'ORPHAN'
  byRole[key] = (byRole[key] || 0) + 1
}
console.log('Total subscriptions:', subs.length)
console.log('By role:', JSON.stringify(byRole))
for (const s of subs.slice(-6)) {
  const u = users.find(x => x.id === s.userId)
  console.log(`- ${s.createdAt.toISOString()} | ${u ? u.role + ' «' + u.name + '»' : 'orphan'} | ${s.endpoint.slice(0, 60)}`)
}
await prisma.$disconnect()
