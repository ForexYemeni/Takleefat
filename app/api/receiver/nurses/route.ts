import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError } from '@/lib/api-helpers'
import { findMatchingNurses, MATCH_PRIORITY_LABELS, resolveReceiverOrg } from '@/lib/network'
import { isTrustedViewer, phoneView, revealedStaffIds } from '@/lib/phone-privacy'

/**
 * البحث المتقدم عن الكوادر والأطباء + المطابقة الذكية | Smart Matching
 * GET /api/receiver/nurses
 *   ?search= &gender=MALE|FEMALE|ANY &hospitalId= &affiliationStatus= &department=
 *   &minExperience= &specialty= &availableOnly=true &favoritesOnly=true
 *
 * المستلم الإداري → شبكة الكادر التمريضي | مشرف الأطباء → شبكة الأطباء (منظومة الأطباء)
 * النتائج مرتبة بأولوية المطابقة:
 * 5 المفضلون ← 4 العاملون حالياً بالجهة ← 3 المعتمدون ← 2 المتقابَل معهم ← 1 الخارجيون المؤهلون ← 0 مطابق أساسي
 * فلترة الجنس إلزامية إذا حُدد الجنس المطلوب.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireRole('RECEIVER', 'ADMIN', 'DOCTOR_SUPERVISOR')

    const sp = req.nextUrl.searchParams
    const genderParam = sp.get('gender')
    const gender = genderParam === 'MALE' || genderParam === 'FEMALE' || genderParam === 'ANY' ? genderParam : null

    // دور الجمهور: مشرف الأطباء يبحث في شبكة الأطباء — غيره في شبكة الكادر التمريضي
    // الإدارة تختار الجمهور بمعامل audience=DOCTOR (نافذة إنشاء تكليف الأطباء)
    const audienceParam = sp.get('audience')
    const audienceRoleValue: 'NURSE' | 'DOCTOR' =
      session.user.role === 'DOCTOR_SUPERVISOR'
        ? 'DOCTOR'
        : session.user.role === 'ADMIN' && audienceParam === 'DOCTOR'
          ? 'DOCTOR'
          : 'NURSE'

    const matched = await findMatchingNurses({
      receiverId: session.user.id,
      role: audienceRoleValue,
      hospitalId: sp.get('hospitalId') || (await resolveReceiverOrg(session.user.id))?.id || null,
      postGender: gender,
      department: sp.get('department') ?? undefined,
      search: sp.get('search') ?? undefined,
      minExperience: sp.get('minExperience') ? Number(sp.get('minExperience')) : null,
      specialty: sp.get('specialty') ?? undefined,
      affiliationStatus: sp.get('affiliationStatus'),
      availableOnly: sp.get('availableOnly') === 'true',
      favoritesOnly: sp.get('favoritesOnly') === 'true',
    })

    const enriched = matched.map((n) => ({
      ...n,
      priorityLabel: MATCH_PRIORITY_LABELS[n.priority] ?? MATCH_PRIORITY_LABELS[0],
    }))

    // الجولة 34: قناع أرقام الكوادر — يُفتح بتكليف سارٍ مسدد النسبة بين الطرفين
    // الجولة 36: «الموثوق جداً» يرى كل الأرقام
    const trusted = await isTrustedViewer(session.user.id)
    const revealed =
      session.user.role === 'ADMIN'
        ? new Set<string>()
        : await revealedStaffIds(
            session.user.id,
            matched.map((n) => n.id),
            trusted
          )
    const masked = enriched.map((n) => ({
      ...n,
      ...phoneView(session.user.role, n.phone, revealed.has(n.id), trusted),
    }))

    // ملخص توزيع الأولويات (لواجهة اختيار الكوادر)
    const summary = {
      total: enriched.length,
      available: enriched.filter((n) => n.isAvailable).length,
      byPriority: enriched.reduce<Record<number, number>>((acc, n) => {
        acc[n.priority] = (acc[n.priority] ?? 0) + 1
        return acc
      }, {}),
    }

    return NextResponse.json({ nurses: masked, summary, priorityLabels: MATCH_PRIORITY_LABELS })
  } catch (error) {
    return handleApiError(error)
  }
}
