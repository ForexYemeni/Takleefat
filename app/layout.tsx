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
  icons: {
    icon: '/logo.svg',
    apple: '/logo.svg',
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
  themeColor: '#0F9BA8',
  width: 'device-width',
  initialScale: 1,
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
