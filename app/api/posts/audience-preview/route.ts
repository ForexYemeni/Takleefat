import { NextRequest, NextResponse } from 'next/server'
import { requireRole, handleApiError } from '@/lib/api-helpers'
import { getAudiencePreview } from '@/lib/network'
import type { Gender } from '@prisma/client'

/**
 * GET /api/posts/audience-preview — معاينة حية لجمهور تكليف قبل نشره (الجولة العاشرة)
 * - RECEIVER / ADMIN فقط
 * - نفس منطق canNurseSeePost: فلتر الجنس + خصوصية طريقة التوزيع + مطابقة القسم
 * - تعيد العدد المتوقع + التوزيع الهرمي (مفضلون/يعملون/معتمدون/متقابلون/خارجيون)
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireRole('RECEIVER', 'ADMIN')

    const hospitalId = req.nextUrl.searchParams.get('hospitalId')
    const department = req.nextUrl.searchParams.get('department')
    const gender = req.nextUrl.searchParams.get('gender')
    const distribution = req.nextUrl.searchParams.get('distribution')

    const preview = await getAudiencePreview({
      receiverId: session.user.id,
      hospitalId,
      department,
      gender: (gender as Gender | null) ?? null,
      distribution,
    })

    return NextResponse.json(preview)
  } catch (error) {
    return handleApiError(error)
  }
}
