'use client'

/**
 * عميل API موحد — تكليفات | Takleefat
 * يرمي خطأ برسالة عربية واضحة عند فشل الطلب.
 */
export async function apiFetcher<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)

  let data: unknown = null
  try {
    data = await response.json()
  } catch {
    // استجابة بدون JSON
  }

  if (!response.ok) {
    const message =
      (data as { error?: string } | null)?.error ?? 'حدث خطأ أثناء الاتصال بالخدمة'
    throw new Error(message)
  }

  return data as T
}

export function apiPost<T>(url: string, body: unknown): Promise<T> {
  return apiFetcher<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function apiPatch<T>(url: string, body: unknown): Promise<T> {
  return apiFetcher<T>(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function apiDelete<T>(url: string): Promise<T> {
  return apiFetcher<T>(url, { method: 'DELETE' })
}
