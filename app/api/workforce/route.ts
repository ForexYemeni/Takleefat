import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { isTrustedViewer, phoneView, revealedStaffIds } from '@/lib/phone-privacy'

/**
 * GET /api/workforce — دليل الكوادر/الأطباء في كامل المنصة — الجولة 33
 * ------------------------------------------------------------------
 * امتداد أذونات «رؤية البيانات الكاملة» (User.fullProfileAccess):
 * بدلاً من اقتصار زر السيرة الذاتية على كوادر/أطباء جهته حصراً، يستطيع
 * صاحب الإذن استعراض دليل الكوادر/الأطباء في المنصة كلها:
 *  - المستلم الإداري الحاصل على الإذن → دليل كامل الكوادر التمريضيين (NURSE)
 *  - مشرف الأطباء الحاصل على الإذن → دليل كامل الأطباء (DOCTOR)
 *  - بدون الإذن → 403 برسالة واضحة
 *
 * التصفيح: search (الاسم فقط — البحث بالهاتف أُغلق لحماية الخصوصية في الجولة 34)
 * + specialty (التخصص) + status
 * كل صف: الهوية المهنية + التقييم + عدد المستندات + الجهة الحالية.
 * الجولة 34: أرقام التواصل مخفية عن المستلم/المشرف — تُفتح فقط لمن لديه
 * تكليف مسدد النسبة مع صاحب الرقم (lib/phone-privacy).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireRole('RECEIVER', 'DOCTOR_SUPERVISOR')

    const me = await db.user.findUnique({
      where: { id: session.user.id },
      select: { fullProfileAccess: true },
    })
    if (!me?.fullProfileAccess) {
      return jsonError(
        session.user.role === 'DOCTOR_SUPERVISOR'
          ? 'دليل الأطباء الكامل متاح لمن مُنحه حساب الإدارة إذن رؤية البيانات الكاملة — راجع الإدارة لمنحك هذا الإذن'
          : 'دليل الكوادر الكامل متاح لمن مُنحه حساب الإدارة إذن رؤية البيانات الكاملة — راجع الإدارة لمنحك هذا الإذن',
        403
      )
    }

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
