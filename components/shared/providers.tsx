'use client'

import { useState } from 'react'
import { SessionProvider } from 'next-auth/react'
import { ThemeProvider } from 'next-themes'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/sonner'
import { FloatingContact } from '@/components/shared/floating-contact'
import { ServiceWorkerRegister } from '@/components/pwa/service-worker-register'

/**
 * مزودات التطبيق — الجلسة، الثيم، إدارة الحالة، التنبيهات
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // الجولة 38 — الإغلاق الفوري 100% لأذونات بيانات الاتصال:
            // لا تخزين مؤقت إطلاقاً (staleTime: 0) + إعادة جلب فورية عند كل
            // عودة للصفحة/التبويب + نبض تحديث كل 30 ثانية — بحيث ينعكس منح
            // إذن «موثوق جداً» أو سحبه وتأكيد/إلغاء السداد على الشاشات المفتوحة
            // تلقائياً وبلا أي تحديث يدوي.
            staleTime: 0,
            retry: 1,
            refetchOnWindowFocus: 'always',
            refetchInterval: 30 * 1000,
          },
        },
      })
  )

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          {children}
          <Toaster position="top-center" richColors dir="rtl" />
          <FloatingContact />
          <ServiceWorkerRegister />
        </ThemeProvider>
      </QueryClientProvider>
    </SessionProvider>
  )
}
