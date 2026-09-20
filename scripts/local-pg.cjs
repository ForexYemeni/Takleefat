#!/usr/bin/env node
/**
 * خادم PostgreSQL مدمج للاختبار المحلي — تكليفات | Takleefat
 * ============================================================
 * يشغّل قاعدة بيانات PostgreSQL حقيقية محلياً (عبر embedded-postgres)
 * لاختبار ميزة «فرصة» بشكل كامل: Migration فعلية + بيانات + تسجيل دخول.
 * لا يُستخدم في الإنتاج إطلاقاً — مجرد بيئة تحقق معزولة.
 * الاستخدام: node scripts/local-pg.cjs [--reset]
 */
const path = require('path')
const fs = require('fs')

const { default: EmbeddedPostgres } = require('embedded-postgres')
const DATA_DIR = path.join(__dirname, '..', 'db', 'pgdata-forsah-test')
const RESET = process.argv.includes('--reset')

async function main() {
  if (RESET && fs.existsSync(DATA_DIR)) {
    fs.rmSync(DATA_DIR, { recursive: true, force: true })
    console.log('[local-pg] تم حذف بيانات الاختبار القديمة')
  }
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: 'takleefat_test',
    password: 'takleefat_test',
    port: 5433,
    persistent: true,
  })
  if (!fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'))) {
    console.log('[local-pg] تهيئة قاعدة البيانات...')
    await pg.initialise()
  }
  console.log('[local-pg] تشغيل الخادم على المنفذ 5433...')
  await pg.start()
  try {
    await pg.createDatabase('takleefat_forsah')
    console.log('[local-pg] أُنشئت قاعدة takleefat_forsah')
  } catch {
    console.log('[local-pg] قاعدة takleefat_forsah موجودة مسبقاً')
  }
  console.log('[local-pg] جاهز — DATABASE_URL=postgresql://takleefat_test:takleefat_test@localhost:5433/takleefat_forsah')
  // إبقاء العملية حية
  process.on('SIGINT', async () => {
    try {
      await pg.stop()
      console.log('[local-pg] توقف الخادم')
    } finally {
      process.exit(0)
    }
  })
  setInterval(() => {}, 1 << 30)
}

main().catch((e) => {
  console.error('[local-pg] فشل:', e.message)
  process.exit(1)
})
