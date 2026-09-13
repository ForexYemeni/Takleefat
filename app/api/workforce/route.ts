import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError } from '@/lib/api-helpers'
import { isTrustedViewer, phoneView, revealedStaffIds } from '@/lib/phone-privacy'

/**
 * GET /api/workforce — دليل الكوادر/الأطباء في كامل المنصة — الجولة 33
 * ------------------------------------------------------------------
 * الجولة 46 — البلاغ الحرفي: «لا تظهر في قسم كوادر جهتي تبويب الكوادر في
 * المنصة الا اذا يوجد كوادر جهتي»: الدليل متاح لكل مستلم إداري ومشرف
 * أطباء مباشرة — بلا شرط إذن «رؤية البيانات الكاملة»:
 *  - المستلم الإداري → دليل كامل الكوادر التمريضيين (NURSE)
 *  - مشرف الأطباء → دليل كامل الأطباء (DOCTOR)
 * والخصوصية محفوظة: أرقام التواصل تُدار من الخادم وفق قاعدة السداد
 * (lib/phone-privacy)، والمستندات لا تُرسل هنا أصلاً — السيرة الكاملة
 * مع محتوى المستندات تُدار من /api/workforce/[id] (الجولة 46).
 *
 * التصفيح: search (الاسم فقط — البحث بالهاتف أُغلق لحماية الخصوصية في الجولة 34)
 * + specialty (التخصص) + status
 * كل صف: الهوية المهنية + التقييم + عدد المستندات + الجهة الحالية.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireRole('RECEIVER', 'DOCTOR_SUPERVISOR')

    const isSupervisor = session.user.role === 'DOCTOR_SUPERVISOR'
    const audienceRole = isSupervisor ? 'DOCTOR' : 'NURSE'

    const search = req.nextUrl.searchParams.get('search')?.trim()
    const specialty = req.nextUrl.searchParams.get('specialty')?.trim()
    const status = req.nextUrl.searchParams.get('status')

    const [users, meOrg] = await Promise.all([
      db.user.findMany({
        where: {
          role: audienceRole,
          ...(status && ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'].includes(status)
            ? { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' }
            : {}),
          ...(specialty ? { specialty } : {}),
          // الجولة 34: البحث بالاسم حصراً — البحث بالهاتف كان يسرّب وجود الرقم في المنصة
          ...(search
            ? {
                name: { contains: search, mode: 'insensitive' },
              }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          phone: true,
          gender: true,
          role: true,
          status: true,
          specialty: true,
          qualification: true,
          yearsOfExperience: true,
          createdAt: true,
          // الجهة الحالية (أحدث ارتباط غير معلّق) — لعرضها في البطاقة
          affiliations: {
            where: { status: { not: 'PENDING' } },
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: { hospital: { select: { name: true, city: true } } },
          },
          _count: { select: { documents: true, assignments: true } },
        },
      }),
      // جهة صاحب الحساب — لتمييز «من جهتي» في البطاقات
      db.user.findUnique({
        where: { id: session.user.id },
        select: { hospitalName: true },
      }),
    ])

    const ratings = await db.nurseRating.groupBy({
      by: ['nurseId'],
      where: { nurseId: { in: users.map((u) => u.id) } },
      _avg: { overall: true },
      _count: { overall: true },
    })
    const ratingMap = new Map(ratings.map((r) => [r.nurseId, r]))

    // الجولة 34: من فُتح رقمه للمشاهد؟ — تكليفات سارية مسددة النسبة بين الطرفين
    // الجولة 36: «الموثوق جداً» يرى كل الأرقام دون استثناء
    const trusted = await isTrustedViewer(session.user.id)
    const revealed = await revealedStaffIds(session.user.id, users.map((u) => u.id), trusted)

    return NextResponse.json({
      audience: audienceRole,
      fullProfileAccess: true,
      total: users.length,
      workforce: users.map((u) => {
        const r = ratingMap.get(u.id)
        return {
          id: u.id,
          name: u.name,
          // الجولة 34: الرقم الكامل يُرسل فقط لمن تحقق شرط السداد — وإلا القناع حصراً
          ...phoneView(session.user.role, u.phone, revealed.has(u.id), trusted),
          gender: u.gender,
          role: u.role,
          status: u.status,
          specialty: u.specialty,
          qualification: u.qualification,
          yearsOfExperience: u.yearsOfExperience,
          createdAt: u.createdAt,
          orgName: u.affiliations[0]?.hospital.name ?? null,
          orgCity: u.affiliations[0]?.hospital.city ?? null,
          ratingAverage: r?._avg.overall ? Number(r._avg.overall.toFixed(2)) : null,
          ratingCount: r?._count.overall ?? 0,
          documentsCount: u._count.documents,
          assignmentsCount: u._count.assignments,
          isMyOrg: !!meOrg?.hospitalName && u.affiliations[0]?.hospital.name === meOrg.hospitalName,
        }
      }),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
