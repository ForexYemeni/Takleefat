/* ============================================================
 * تكليفات | Takleefat — Service Worker
 * سياسة آمنة لعلامة تجارية تتعامل مع بيانات طبية حساسة:
 *  1) لا يُخزَّن أي طلب /api/* أو /_next/webpack-hmr إطلاقاً (شبكة فقط)
 *  2) التنقل بين الصفحات: الشبكة أولاً — وعند انقطاع الاتصال صفحة offline.html
 *     (لا نخزّن صفحات محمية حتى لا تُعرض لجلسة قديمة أو لمستخدم آخر)
 *  3) الأصول الثابتة ذات البصمات (/_next/static) والأيقونات: الكاش أولاً
 *  4) تحديث تلقائي: إصدار جديد = حذف الكاش القديم + skipWaiting
 *  5) الإشعارات الفورية (Web Push): عرض إشعار عربي + فتح الرابط عند النقر — الجولة الرابعة عشرة
 * ============================================================ */

const VERSION = 'takleefat-v2'
const OFFLINE_URL = '/offline.html'
const PRECACHE_URLS = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/logo.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION)
      await cache.addAll(PRECACHE_URLS)
      await self.skipWaiting()
    })()
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
      await self.clients.claim()
    })()
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

// ---------- الإشعارات الفورية (Web Push) — الجولة الرابعة عشرة ----------

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'تكليفات | Takleefat', body: event.data ? event.data.text() : '' }
  }
  const title = typeof data.title === 'string' && data.title ? data.title : 'تكليفات | Takleefat'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === 'string' ? data.body : '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      dir: 'rtl',
      lang: 'ar',
      tag: typeof data.link === 'string' ? data.link : undefined,
      data: { link: typeof data.link === 'string' ? data.link : '/' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const link = (event.notification.data && event.notification.data.link) || '/'
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin)) {
          if ('navigate' in client) {
            try {
              await client.navigate(link)
            } catch {
              // بعض المتصفحات تمنع navigate — يكفي التركيز
            }
          }
          return client.focus()
        }
      }
      return self.clients.openWindow(link)
    })()
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  // GET فقط — لا نتدخل في POST/PUT/PATCH/DELETE إطلاقاً
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // نفس الأصل فقط — الطلبات الخارجية تبقى كما هي
  if (url.origin !== self.location.origin) return

  // منطقة محرمة: واجهات API والمصادقة وHMR — شبكة فقط دون أي تخزين
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/webpack-hmr') ||
    url.pathname.startsWith('/_next/data')
  ) {
    return
  }

  // التنقل بين الصفحات: الشبكة أولاً، وعند الفشل صفحة عدم الاتصال
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request)
        } catch {
          const cache = await caches.open(VERSION)
          const offline = await cache.match(OFFLINE_URL)
          return offline || Response.error()
        }
      })()
    )
    return
  }

  // الأصول الثابتة: بصمات Next + الأيقونات + الشعار — الكاش أولاً ثم الشبكة
  const isStatic =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/logo.svg'

  if (isStatic) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(VERSION)
        const cached = await cache.match(request)
        if (cached) return cached
        try {
          const response = await fetch(request)
          if (response && response.ok) cache.put(request, response.clone())
          return response
        } catch {
          return Response.error()
        }
      })()
    )
  }
})
