import { NextResponse } from 'next/server'
import { requireRole, handleApiError } from '@/lib/api-helpers'
import { isForsahEnabled } from '@/lib/forsah/server'

/**
 * GET /api/forsah/status — حالة نظام «فرصة» (الجولة 67 — الإغلاق الكلي)
 * لأي مستخدم مسجل — تُستخدم من القوائم الجانبية وشريط التنقل
 * لإخفاء عناصر «فرصة» فور إغلاق النظام من الإدارة.
 * رخيصة القراءة: إعداد واحد من جدول settings.
 */
export async function GET() {
  try {
    await requireRole('ADMIN', 'NURSE', 'DOCTOR', 'HR', 'RECEIVER', 'DOCTOR_SUPERVISOR')
    const enabled = await isForsahEnabled()
    return NextResponse.json({ enabled })
  } catch (error) {
    return handleApiError(error)
  }
}
