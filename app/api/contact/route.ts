import { NextResponse } from 'next/server'
import { getActiveContactChannels } from '@/lib/contact'
import { handleApiError } from '@/lib/api-helpers'

/**
 * GET /api/contact — القنوات النشطة للتواصل مع إدارة المنصة (عامة — بلا جلسة)
 * تُستخدم في الأيقونة العائمة أسفل يسار الشاشة: تُعاد فقط القنوات المُفعّلة
 * التي أُدخلت لها بيانات — ولا تُكشف القنوات المتوقفة أو الفارغة.
 */
export async function GET() {
  try {
    const channels = await getActiveContactChannels()
    return NextResponse.json({ channels })
  } catch (error) {
    return handleApiError(error)
  }
}
