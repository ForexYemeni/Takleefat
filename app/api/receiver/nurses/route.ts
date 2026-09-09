import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError } from '@/lib/api-helpers'
import { findMatchingNurses, MATCH_PRIORITY_LABELS, resolveReceiverOrg } from '@/lib/network'

/**
 * البحث المتقدم عن الكوادر + المطابقة الذكية | Smart Nurse Matching
 * GET /api/receiver/nurses
 *   ?search= &gender=MALE|FEMALE|ANY &hospitalId= &affiliationStatus= &department=
 *   &minExperience= &specialty= &availableOnly=true &favoritesOnly=true
 *
 * النتائج مرتبة بأولوية المطابقة:
 * 5 المفضلون ← 4 العاملون حالياً بالجهة ← 3 المعتمدون ← 2 المتقابَل معهم ← 1 الخارجيون المؤهلون ← 0 مطابق أساسي
 * فلترة الجنس إلزامية إذا حُدد الجنس المطلوب.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireRole('RECEIVER', 'ADMIN')

    const sp = req.nextUrl.searchParams
    const genderParam = sp.get('gender')
    const gender = genderParam === 'MALE' || genderParam === 'FEMALE' || genderParam === 'ANY' ? genderParam : null

    const matched = await findMatchingNurses({
      receiverId: session.user.id,
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

    // ملخص توزيع الأولويات (لواجهة اختيار الكوادر)
    const summary = {
      total: enriched.length,
      available: enriched.filter((n) => n.isAvailable).length,
      byPriority: enriched.reduce<Record<number, number>>((acc, n) => {
        acc[n.priority] = (acc[n.priority] ?? 0) + 1
        return acc
      }, {}),
    }

    return NextResponse.json({ nurses: enriched, summary, priorityLabels: MATCH_PRIORITY_LABELS })
  } catch (error) {
    return handleApiError(error)
  }
}
