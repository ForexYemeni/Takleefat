import type { MetadataRoute } from 'next'

/**
 * بيان تطبيق الويب (PWA) — تكليفات | Takleefat
 * يُقدَّم تلقائياً على المسار /manifest.webmanifest
 * يتيح تثبيت المنصة كتطبيق مستقل على الجوال دون متجر تطبيقات.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'تكليفات | Takleefat',
    short_name: 'تكليفات',
    description:
      'منصة احترافية لإدارة التكليفات الطبية والتمريضية: إنشاء التكليفات، اعتماد الكوادر، ومتابعة الاستلام إلكترونياً.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#FFFFFF',
    theme_color: '#0F9BA8',
    lang: 'ar',
    dir: 'rtl',
    categories: ['medical', 'business', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
