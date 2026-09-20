import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { handleApiError } from '@/lib/api-helpers'
import { isForsahEnabled } from '@/lib/forsah/server'
import { buildCandidateFeePreview } from '@/lib/forsah/finance'
import { getSettings } from '@/lib/settings'

/**
 * GET /api/opportunities/public — قائمة عامة آمنة لمحركات البحث (المواصفة 29)
 * ============================================================
 * فرص العمل المنشورة فقط — بيانات عامة حصراً (اسم الفرصة/الجهة/التخصص/القسم/
 * الراتب/الدوام/الإجازات) — صفر بيانات شخصية لأي مستخدم، صفر تفاصيل داخلية.
 * بلا مصادقة — وحد أقصى 60 فرصة حديثة مع ترقيم خفيف.
 */
export async function GET(req: NextRequest) {
  try {
    const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') ?? 1) || 1)
    const take = Math.min(30, Math.max(6, Number(req.nextUrl.searchParams.get('take') ?? 12) || 12))
    // الجولة 67: الإغلاق الكلي — الصفحة العامة تُرجع قائمة فارغة بلا خطأ
    if (!(await isForsahEnabled())) {
      return NextResponse.json({ opportunities: [], total: 0, page, take })
    }

    const [rows, total, feeSettings] = await Promise.all([
      db.opportunity.findMany({
        where: { status: { in: ['PUBLISHED', 'ACTIVE'] } },
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          number: true,
          title: true,
          audience: true,
          specialty: { select: { name: true } },
          department: { select: { name: true } },
          salaryAmount: true,
          salaryType: true,
          salaryCurrency: true,
          workStartTime: true,
          workEndTime: true,
          vacations: true,
          positionsNeeded: true,
          publishedAt: true,
          hospital: { select: { name: true, city: true, location: true } },
        },
        skip: (page - 1) * take,
        take,
      }),
      db.opportunity.count({ where: { status: { in: ['PUBLISHED', 'ACTIVE'] } } }),
      getSettings(),
    ])

    return NextResponse.json(
      {
        // الجولة 70: شفافية الرسوم — معاينة عامة للرسوم مع كل فرصة منشورة
        opportunities: rows.map((o) => ({
          ...o,
          feePreview: buildCandidateFeePreview(o.salaryAmount, o.salaryCurrency, feeSettings),
        })),
        total,
        page,
        take,
      },
      { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600' } }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
