import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import {
  AFFILIATION_STATUS_LABELS,
  busyStaffIds,
  computeOrgCadreStats,
  healReceiverPendingAffiliations,
  resolveReceiverOrgs,
} from '@/lib/network'
import { isTrustedViewer, phoneView, revealedStaffIds } from '@/lib/phone-privacy'

/**
 * GET /api/org/community — مجتمع كوادر الجهة الصحية (الجولة 38)
 * =============================================================
 * كل جهة صحية لها مجتمع كوادر خاص بها: الممرضون المعتمدون، الأطباء
 * المعتمدون، والمتاحون الآن — ويستطيع المسؤول رؤية الكوادر التابعين
 * لجهته حسب الصلاحيات:
 *  - الإدارة: أي جهة عبر ?hospitalId= (وتُرسل أرقام الكوادر كاملة — الإدارة ترى كل شيء)
 *  - المستلم الإداري/مشرف الأطباء: جهته المصرّح بها حصراً — وأرقام الكوادر
 *    تخضع لقواعد الخصوصية (تكليف سارٍ مسدد / إذن «موثوق جداً» — الجولتان 34-38)
 *
 * المعتمد = ارتباط (يعمل حالياً/معتمد) + حساب معتمد من الإدارة.
 * المتاح الآن = معتمد بلا تكليف سارٍ (ACTIVE/RECEIVED).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireRole('ADMIN', 'RECEIVER', 'DOCTOR_SUPERVISOR')
    const hospitalIdParam = req.nextUrl.searchParams.get('hospitalId')?.trim() ?? ''

    // تحديد الجهة: الإدارة تحدد أي جهة — والمسؤول يرى جهته هو فقط
    let org: { id: string; name: string; type: string; city: string | null; status: string } | null
    if (session.user.role === 'ADMIN') {
      if (!hospitalIdParam) return jsonError('حدد الجهة الصحية المطلوبة (hospitalId)', 422)
      org = await db.hospital.findUnique({
        where: { id: hospitalIdParam },
        select: { id: true, name: true, type: true, city: true, status: true },
      })
      if (!org) return jsonError('الجهة الصحية غير موجودة', 404)
    } else {
      // الجولة 44: المسؤول يرى مجتمع أي جهة من جهاته المعتمدة — الافتراضي الأساسية
      const orgs = await resolveReceiverOrgs(session.user.id)
      if (orgs.length === 0) {
        // المسؤول بلا جهة مصرّح بها — استجابة فارغة أنيقة بدل خطأ
        return NextResponse.json({
          org: null,
          stats: { accreditedNurses: 0, accreditedDoctors: 0, availableNow: 0 },
          cadres: [],
        })
      }
      const orgIds = orgs.map((o) => o.id)
      const selectedId =
        hospitalIdParam && orgIds.includes(hospitalIdParam) ? hospitalIdParam : orgIds[0]
      org = orgs.find((o) => o.id === selectedId) ?? orgs[0]
    }

    // شفاء كسول: ارتباطات أُضيفت من المستلم ثم اعتُمدت الجهة وتوقفت على PENDING
    await healReceiverPendingAffiliations(org.id)

    const stats = await computeOrgCadreStats(org.id)

    const members = await db.nurseAffiliation.findMany({
      where: {
        hospitalId: org.id,
        status: { in: ['WORKING', 'ENDORSED'] },
        nurse: { status: 'APPROVED', role: { in: ['NURSE', 'DOCTOR'] } },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        nurseId: true,
        status: true,
        workYears: true,
        nurse: {
          select: {
            id: true,
            name: true,
            phone: true,
            gender: true,
            role: true,
            specialty: true,
            qualification: true,
            yearsOfExperience: true,
          },
        },
      },
    })

    const [ratingRows, busy, trusted, approvedDocs] = await Promise.all([
      db.nurseRating.groupBy({
        by: ['nurseId'],
        where: { nurseId: { in: members.map((m) => m.nurseId) } },
        _avg: { overall: true },
        _count: { overall: true },
      }),
      busyStaffIds(members.map((m) => m.nurseId)),
      session.user.role === 'ADMIN' ? Promise.resolve(false) : isTrustedViewer(session.user.id),
      // الجولة 39: المستندات المعتمدة من الإدارة — شارة الاعتماد المهني في المجتمع
      db.document.groupBy({
        by: ['userId'],
        where: { userId: { in: members.map((m) => m.nurseId) }, status: 'APPROVED' },
        _count: { _all: true },
      }),
    ])
    const ratingMap = new Map(ratingRows.map((r) => [r.nurseId, r]))
    const approvedDocsMap = new Map(approvedDocs.map((d) => [d.userId, d._count._all]))

    // أرقام الكوادر حسب الصلاحيات — الإدارة كاملة، والمسؤول بقواعد الخصوصية
    const revealed =
      session.user.role === 'ADMIN'
        ? new Set(members.map((m) => m.nurseId))
        : await revealedStaffIds(
            session.user.id,
            members.map((m) => m.nurseId),
            trusted
          )

    const cadres = members.map((m) => {
      const r = ratingMap.get(m.nurseId)
      return {
        id: m.nurse.id,
        name: m.nurse.name,
        role: m.nurse.role,
        gender: m.nurse.gender,
        specialty: m.nurse.specialty,
        qualification: m.nurse.qualification,
        yearsOfExperience: m.nurse.yearsOfExperience,
        accountStatus: 'APPROVED',
        affiliationStatus: m.status,
        affiliationStatusLabel: AFFILIATION_STATUS_LABELS[m.status] ?? m.status,
        workYears: m.workYears,
        available: !busy.has(m.nurseId),
        // الجولة 39: الاعتماد المهني من الإدارة — مستندات معتمدة من حساب الإدارة
        approvedDocuments: approvedDocsMap.get(m.nurseId) ?? 0,
        ratingAverage: r?._avg.overall ? Number(r._avg.overall.toFixed(2)) : null,
        ratingCount: r?._count.overall ?? 0,
        ...phoneView(session.user.role, m.nurse.phone, revealed.has(m.nurseId), trusted),
      }
    })

    return NextResponse.json({ org, stats, cadres })
  } catch (error) {
    return handleApiError(error)
  }
}
