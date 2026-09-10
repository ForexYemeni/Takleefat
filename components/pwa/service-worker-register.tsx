'use client'

import { useEffect } from 'react'

/**
 * تسجيل Service Worker — يفعّل العمل دون اتصال (PWA)
 * يُسجَّل في وضع الإنتاج فقط بعد اكتمال تحميل الصفحة
 * حتى لا ينافس تحميل الموارد الحرجة في التطوير أو الإقلاع الأول.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // فشل التسجيل لا يجب أن يعطّل التطبيق — يعمل الموقع بشكل طبيعي دون PWA
      })
    }

    if (document.readyState === 'complete') {
      register()
      return
    }

    window.addEventListener('load', register, { once: true })
    return () => window.removeEventListener('load', register)
  }, [])

  return null
}
