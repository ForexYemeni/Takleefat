import { NextResponse } from 'next/server'
import { requireSession, handleApiError } from '@/lib/api-helpers'
import { getPushPublicKey } from '@/lib/push'

/**
 * GET /api/push/public-key — المفتاح العام VAPID للاشتراك بالإشعارات الفورية
 * يتطلب جلسة (لا يُكشف ضبط النشر للمجهولين). publicKey = null إن لم تُضبط المفاتيح.
 */
export async function GET() {
  try {
    await requireSession()
    return NextResponse.json({ publicKey: getPushPublicKey() })
  } catch (error) {
    return handleApiError(error)
  }
}
