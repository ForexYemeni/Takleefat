/**
 * إعداد متغيرات بيئة Vercel + نشر إنتاجي — تكليفات | Takleefat
 * يقرأ الأسرار من .env.vercel-setup (مستثنى من git)
 * 1) حذف المتغيرات الموجودة المزمع استبدالها  2) إضافة المتغيرات التسعة
 * 3) إطلاق نشر Production من آخر commit على main  4) مراقبة الحالة حتى READY
 */
import fs from 'node:fs'

// ---------- قراءة ملف الأسرار ----------
const envFile = fs.readFileSync(new URL('../.env.vercel-setup', import.meta.url), 'utf8')
const S = {}
for (const line of envFile.split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i > 0) S[t.slice(0, i)] = t.slice(i + 1)
}
const TOKEN = S.VERCEL_TOKEN
const TEAM = S.VERCEL_TEAM_ID
const PRJ = S.VERCEL_PROJECT_ID
const BASE = 'https://api.vercel.com'
const q = `teamId=${TEAM}`

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { raw: text.slice(0, 300) } }
  if (!res.ok) {
    throw Object.assign(new Error(`API ${method} ${path} → ${res.status}`), { status: res.status, code: json?.error?.code, json })
  }
  return json
}

// ---------- المتغيرات المطلوب ضبطها ----------
const VARS = [
  ['DATABASE_URL', S.ENV_DATABASE_URL],
  ['NEXTAUTH_URL', S.ENV_NEXTAUTH_URL],
  ['NEXTAUTH_SECRET', S.ENV_NEXTAUTH_SECRET],
  ['AUTH_SECRET', S.ENV_AUTH_SECRET],
  ['ADMIN_PHONE', S.ENV_ADMIN_PHONE],
  ['ADMIN_PASSWORD', S.ENV_ADMIN_PASSWORD],
  ['NEXT_PUBLIC_VAPID_PUBLIC_KEY', S.ENV_NEXT_PUBLIC_VAPID_PUBLIC_KEY],
  ['VAPID_PRIVATE_KEY', S.ENV_VAPID_PRIVATE_KEY],
  ['VAPID_SUBJECT', S.ENV_VAPID_SUBJECT],
]

// ---------- 1) جلب الموجود وحذف ما سيُستبدل ----------
const existing = await api('GET', `/v9/projects/${PRJ}/env?${q}&upsert=true`)
const envList = existing.envs || []
let deleted = 0
for (const [key] of VARS) {
  const hits = envList.filter((e) => e.key === key)
  for (const e of hits) {
    try {
      await api('DELETE', `/v9/projects/${PRJ}/env/${e.id}?${q}`)
      deleted++
      console.log(`🗑️  حُذف القديم: ${key} (${e.target.join(',')})`)
    } catch (err) {
      console.log(`⚠️  تعذر حذف ${key}:`, err.code || err.message)
    }
  }
}

// ---------- 2) إضافة المتغيرات ----------
for (const [key, value] of VARS) {
  try {
    await api('POST', `/v10/projects/${PRJ}/env?${q}`, {
      key,
      value,
      type: 'encrypted',
      target: ['production', 'preview', 'development'],
    })
    const shown = key.includes('SECRET') || key.includes('PASSWORD') || key === 'DATABASE_URL' || key === 'VAPID_PRIVATE_KEY'
      ? '••••••' + String(value).slice(-4)
      : String(value).slice(0, 60)
    console.log(`✅ أُضيف: ${key} = ${shown}`)
  } catch (err) {
    console.log(`❌ فشل إضافة ${key}:`, err.code || err.message, JSON.stringify(err.json || {}).slice(0, 200))
    process.exit(1)
  }
}
console.log(`\nاكتمل ضبط ${VARS.length} متغيراً (حُذف ${deleted} قديماً)\n`)

// ---------- 3) إطلاق النشر الإنتاجي ----------
let deploy
try {
  deploy = await api('POST', `/v13/deployments?${q}`, {
    name: S.VERCEL_PROJECT_NAME,
    target: 'production',
  })
} catch (err) {
  console.log('⚠️ المحاولة الأولى للنشر فشلت — أجرب gitSource مباشرة:', err.code || err.message)
  deploy = await api('POST', `/v13/deployments?${q}`, {
    name: S.VERCEL_PROJECT_NAME,
    target: 'production',
    gitSource: { type: 'github', repoId: 1358493417, ref: 'main' },
  })
}
console.log(`🚀 بدأ النشر: ${deploy.id} | URL: ${deploy.url}`)

// ---------- 4) مراقبة حتى الانتهاء ----------
const t0 = Date.now()
const MAX = 12 * 60 * 1000
let state = deploy.readyState || 'QUEUED'
while (!['READY', 'ERROR', 'CANCELED'].includes(state) && Date.now() - t0 < MAX) {
  await new Promise((r) => setTimeout(r, 20000))
  try {
    const d = await api('GET', `/v13/deployments/${deploy.id}?${q}`)
    state = d.readyState
    console.log(`⏳ ${Math.round((Date.now() - t0) / 1000)}s — ${state}`)
    if (state === 'READY') {
      console.log(`\n🎉 النشر جاهز!`)
      console.log(`   Alias: ${(d.alias || []).join(', ') || '—'}`)
      break
    }
    if (state === 'ERROR') { console.log('❌ النشر فشل — راجع سجلات Vercel'); process.exit(1) }
  } catch (err) { console.log('⚠️ استعلام حالة:', err.message) }
}
if (!['READY'].includes(state) && Date.now() - t0 >= MAX) {
  console.log('⏱️ انتهت مهلة المراقبة (النشر قد يستمر) — تحقق من لوحة Vercel')
}
