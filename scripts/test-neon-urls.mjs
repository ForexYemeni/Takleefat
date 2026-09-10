/**
 * اختبار توافق رابط Neon مع Prisma — يقارن مع/بدون channel_binding
 * يُشغَّل من جذر المشروع: node scripts/test-neon-urls.mjs
 */
import { PrismaClient } from '@prisma/client'

const BASE = 'postgresql://neondb_owner:npg_oH1nRTV0OCNx@ep-fancy-wildflower-aym5xrqd-pooler.c-5.us-east-2.aws.neon.tech/neondb'

async function tryConnect(label, url) {
  const prisma = new PrismaClient({ datasources: { db: { url } } })
  try {
    const t0 = Date.now()
    const row = await prisma.$queryRaw`SELECT 1 AS ok`
    console.log(`✅ ${label} — نجح (${Date.now() - t0}ms)`, JSON.stringify(row))
    return true
  } catch (err) {
    console.log(`❌ ${label} — فشل:`, String(err.message || err).slice(0, 220))
    return false
  } finally {
    await prisma.$disconnect().catch(() => {})
  }
}

const withCB = await tryConnect('مع channel_binding=require', `${BASE}?sslmode=require&channel_binding=require`)
const withoutCB = await tryConnect('بدون channel_binding (sslmode فقط)', `${BASE}?sslmode=require`)

console.log('\nالقرار:')
if (!withCB && withoutCB) {
  console.log('→ استخدم الرابط بدون channel_binding في DATABASE_URL')
} else if (withCB) {
  console.log('→ كلا الشكلين يعمل — سيُعتمد شكل المستخدم كاملاً')
} else {
  console.log('→ كلاهما فشل! راجع بيانات Neon (كلمة المرور/المضيف)')
}
process.exit(0)
