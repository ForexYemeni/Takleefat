/**
 * اختبار توافق رابط Neon مع Prisma — يقارن مع/بدون channel_binding
 * يُشغَّل من جذر المشروع:
 *   DATABASE_URL='postgresql://...' node scripts/test-neon-urls.mjs
 * بلا أسرار مضمنة — الرابط يُقرأ من متغير البيئة DATABASE_URL حصراً.
 */
import { PrismaClient } from '@prisma/client'

const RAW = process.env.DATABASE_URL
if (!RAW) {
  console.error('الاستخدام: DATABASE_URL="postgresql://..." node scripts/test-neon-urls.mjs')
  process.exit(1)
}

// نفصل الاستعلامات الأساسية عن المعاملات لإعادة بناء الشكلين
const [BASE, QUERY = ''] = RAW.split('?')
const params = new URLSearchParams(QUERY)
params.delete('channel_binding')
const noCB = `${BASE}${params.size ? `?${params}` : ''}`
const withCB = `${noCB}${params.size ? '&' : '?'}channel_binding=require`

async function tryConnect(label, url) {
  const prisma = new PrismaClient({ datasources: { db: { url } } })
  try {
    const t0 = Date.now()
    await prisma.$queryRaw`SELECT 1 AS ok`
    console.log(`✅ ${label} — نجح (${Date.now() - t0}ms)`)
    return true
  } catch (err) {
    console.log(`❌ ${label} — فشل:`, String(err.message || err).slice(0, 220))
    return false
  } finally {
    await prisma.$disconnect().catch(() => {})
  }
}

const okWithCB = await tryConnect('مع channel_binding=require', withCB)
const okWithoutCB = await tryConnect('بدون channel_binding (sslmode فقط)', noCB)

console.log('\nالقرار:')
if (!okWithCB && okWithoutCB) {
  console.log('→ استخدم الرابط بدون channel_binding في DATABASE_URL')
} else if (okWithCB) {
  console.log('→ كلا الشكلين يعمل — سيُعتمد شكل المستخدم كاملاً')
} else {
  console.log('→ كلاهما فشل! راجع بيانات Neon (كلمة المرور/المضيف)')
}
process.exit(0)
