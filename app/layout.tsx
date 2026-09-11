import type { Metadata, Viewport } from 'next'
import { Providers } from '@/components/shared/providers'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'تكليفات | Takleefat',
    template: '%s | تكليفات | Takleefat',
  },
  description:
    'تكليفات (Takleefat) — منصة احترافية لإدارة التكليفات الطبية والتمريضية: إنشاء التكليفات، اعتماد الكوادر التمريضية، رفع المستندات، ومتابعة الاستلام إلكترونياً.',
  keywords: ['تكليفات', 'Takleefat', 'تكليفات طبية', 'تكليفات تمريضية', 'إدارة الكوادر الصحية'],
  applicationName: 'تكليفات | Takleefat',
  authors: [{ name: 'Takleefat' }],
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'تكليفات',
  },
  icons: {
    icon: [
      { url: '/logo.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
  openGraph: {
    title: 'تكليفات | Takleefat',
    description: 'منصة احترافية لإدارة التكليفات الطبية والتمريضية',
    siteName: 'تكليفات | Takleefat',
    type: 'website',
    locale: 'ar',
  },
}

export const viewport: Viewport = {
  themeColor: '#0E1B4E',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className="min-h-screen flex flex-col antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
