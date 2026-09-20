'use client'

import { useEffect, useState } from 'react'

/**
 * مؤخّر قيمة عام — الجولة 67 (إصلاح وميض المحتوى)
 * البحث الحرفي كان يولّد مفتاح استعلام جديداً مع كل حرف فينزلق
 * المحتوى إلى الهيكل العظمي ثم يعود — الآن ننتظر استقرار الكتابة ٣٠٠مللي ثانية.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
