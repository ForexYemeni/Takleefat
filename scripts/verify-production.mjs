/**
 * تحقق نهائي من الإنتاج: دخول المدير + مفتاح Push + صفحة البطاقة المهنية
 * يقرأ بيانات الدخول من .env.vercel-setup مباشرة (بلا وساطة shell)
 */
import fs from 'node:fs'

const S = {}
for (const line of fs.readFileSync(new URL('../.env.vercel-setup', import.meta.url), 'utf8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i > 0) S[t.slice(0, i)] = t.slice(i + 1)
}
const BASE = S.PROD_URL
const cookies = new Map()

function storeCookies(res) {
  const set = res.headers.getSetCookie?.() || []
  for (const c of set) {
    const [pair] = c.split(';')
    const i = pair.indexOf('=')
    cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim())
  }
}
function cookieHeader() {
  return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}

// 1) csrf
const r1 = await fetch(`${BASE}/api/auth/csrf`, { redirect: 'manual' })
storeCookies(r1)
const { csrfToken } = await r1.json()
console.log('1) CSRF جلب:', r1.status, `(${csrfToken.slice(0, 10)}...)`)

// 2) دخول المدير — كلمة المرور حرفياً من الملف
const body = new URLSearchParams({
  csrfToken,
  phone: S.ENV_ADMIN_PHONE,
  password: S.ENV_ADMIN_PASSWORD,
  json: 'true',
})
const r2 = await fetch(`${BASE}/api/auth/callback/credentials`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookieHeader() },
  body: body.toString(),
  redirect: 'manual',
})
storeCookies(r2)
console.log('2) دخول المدير:', r2.status, r2.status === 200 ? '✅ نجح — الجلسة صادرة' : '❌ فشل')
if (r2.status !== 200) {
  console.log('   تفاصيل:', (await r2.text()).slice(0, 300))
  process.exit(1)
}

// 3) مفتاح Push العام من الإنتاج (يتطلب جلسة)
const r3 = await fetch(`${BASE}/api/push/public-key`, { headers: { Cookie: cookieHeader() } })
const pk = await r3.json().catch(() => ({}))
const expected = S.ENV_NEXT_PUBLIC_VAPID_PUBLIC_KEY
console.log('3) مفتاح Push العام:', r3.status, pk.publicKey === expected ? '✅ مطابق للمفتاح المضبوط' : `⚠️ ${JSON.stringify(pk).slice(0, 120)}`)

// 4) قاعدة البيانات عبر الإنتاج — قائمة الإشعارات (تثبت اتصال Neon)
const r4 = await fetch(`${BASE}/api/notifications`, { headers: { Cookie: cookieHeader() } })
console.log('4) اتصال قاعدة البيانات عبر الموقع:', r4.status, r4.ok ? '✅ Neon متصل ويعمل' : '(فحص ثانوي)')

console.log('\n— الكوكي النهائي:', cookies.has('next-auth.session-token') || [...cookies.keys()].some((k) => k.includes('session-token')) ? 'جلسة next-auth نشطة ✅' : 'لا جلسة!')
