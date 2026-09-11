import { NextRequest, NextResponse } from 'next/server'
import { requireRole, handleApiError } from '@/lib/api-helpers'
import { getAudiencePreview } from '@/lib/network'
import type { Gender, Audience } from '@prisma/client'

/**
 * GET /api/posts/audience-preview — معاينة حية لجمهور تكليف قبل نشره (الجولة العاشرة)
 * - RECEIVER / DOCTOR_SUPERVISOR / ADMIN فقط
 * - نفس منطق canNurseSeePost: فلتر الجمهور والجنس + خصوصية طريقة التوزيع + مطابقة القسم/التخصص
 * - تعيد العدد المتوقع + التوزيع الهرمي (مفضلون/يعملون/معتمدون/متقابلون/خارجيون)
 * - audience=DOCTOR لجمهور الأطباء (منظومة الأطباء) — يُفرض على المشرف تلقائياً
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireRole('RECEIVER', 'ADMIN', 'DOCTOR_SUPERVISOR')

    const hospitalId = req.nextUrl.searchParams.get('hospitalId')
    const department = req.nextUrl.searchParams.get('department')
    const gender = req.nextUrl.searchParams.get('gender')
    const distribution = req.nextUrl.searchParams.get('distribution')
    const audienceParam = req.nextUrl.searchParams.get('audience')
    // مشرف الأطباء: جمهور أطباء حصراً — المستلم: تمريض حصراً — الإدارة: تختار
    const audience: Audience =
      session.user.role === 'DOCTOR_SUPERVISOR'
        ? 'DOCTOR'
        : session.user.role === 'RECEIVER'
          ? 'NURSE'
          : audienceParam === 'DOCTOR'
            ? 'DOCTOR'
            : 'NURSE'

    const preview = await getAudiencePreview({
      receiverId: session.user.id,
      hospitalId,
      department,
      gender: (gender as Gender | null) ?? null,
      distribution,
      audience,
    })

    return NextResponse.json(preview)
  } catch (error) {
    return handleApiError(error)
  }
}
