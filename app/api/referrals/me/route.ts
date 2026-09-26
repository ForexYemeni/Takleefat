import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSession, handleApiError } from '@/lib/api-helpers'
import {
  ensureReferralCode,
  getReferralSettings,
  getReferralBenefits,
  isReferralEligibleRole,
  referralPercentForRole,
} from '@/lib/referrals'

/**
 * GET /api/referrals/me — لوحة «إحالاتي» الكاملة (الجولة 75 — إضافي بحت)
 * ------------------------------------------------------------
 * يُرجع: حالة الأهلية + الرابط الشخصي + الإحصاءات + قائمة الإحالات بحالاتها
 * + ملخص المزايا (Ledger بلا سحب نقدي) + آخر المزايا وعمليات الخصم.
 * الأهلية: حساب معتمد بدور أساسي من الأدوار الخمسة المؤهلة — لا صلاحيات جديدة.
 */

/** إخفاء جزئي لرقم الهاتف — خصوصية موحدة مع بقية المنصة */
function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  if (phone.length < 6) return '•••••'
  return `${phone.slice(0, 3)}•••${phone.slice(-3)}`
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession()
    const primaryRole = session.user.role as string

    // الأهلية: دور أساسي من الأدوار الخمسة + حساب معتمد (الإدارة مستثناة — لها لوحتها)
    if (!isReferralEligibleRole(primaryRole)) {
      return NextResponse.json({ eligible: false, reason: 'دورك الحالي غير مشمول ببرنامج الإحالة' })
    }
    if (session.user.status !== 'APPROVED') {
      return NextResponse.json({
        eligible: false,
        reason: 'يصبح برنامج الإحالة متاحاً لك بعد اعتماد حسابك من الإدارة',
      })
    }

    const settings = await getReferralSettings()
    if (!settings.enabled) {
      return NextResponse.json({ eligible: false, reason: 'برنامج الإحالة معطل حالياً من إدارة المنصة' })
    }

    const codeRow = await ensureReferralCode(session.user.id)
    const myPercent = referralPercentForRole(settings, primaryRole)

    // بناء الرابط من الترويسات (Vercel/Proxy) — لا حساب في الواجهة
    const proto =
      req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(':', '') ?? 'https'
    const host =
      req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host
    const inviteLink = `${proto}://${host}/r/${codeRow.code}`

    // ---------- الإحالات + المستخدمون المُحالون ----------
    const referrals = await db.referral.findMany({
      where: { referrerId: session.user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        referred: {
          select: {
            id: true, name: true, phone: true, role: true,
            status: true, specialty: true,
          },
        },
        rewards: { select: { amount: true, currency: true, status: true, createdAt: true } },
      },
    })

    const referredIds = referrals.map((r) => r.referredId).filter((v): v is string => Boolean(v))

    // نشاط المُحالين من النظام القائم نفسه — لا نسخ بيانات ولا تكرار
    const [assignmentsByNurse, selectionsByCandidate, applicationsByUser] = await Promise.all([
      db.assignment.groupBy({
        by: ['nurseId'],
        where: { nurseId: { in: referredIds }, status: { not: 'CANCELLED' } },
        _count: { _all: true },
      }),
      db.opportunitySelection.groupBy({
        by: ['candidateId'],
        where: { candidateId: { in: referredIds } },
        _count: { _all: true },
      }),
      db.opportunityApplication.groupBy({
        by: ['userId'],
        where: { userId: { in: referredIds } },
        _count: { _all: true },
      }),
    ])
    const assignmentsCount = new Map(assignmentsByNurse.map((r) => [r.nurseId, r._count._all]))
    const selectionsCount = new Map(selectionsByCandidate.map((r) => [r.candidateId, r._count._all]))
    const applicationsCount = new Map(applicationsByUser.map((r) => [r.userId, r._count._all]))

    const items = referrals.map((r) => {
      const assigned = r.referredId ? (assignmentsCount.get(r.referredId) ?? 0) : 0
      const opportunities = r.referredId ? (selectionsCount.get(r.referredId) ?? 0) : 0
      const applications = r.referredId ? (applicationsCount.get(r.referredId) ?? 0) : 0
      const rewardedTotal = r.rewards.reduce((s, w) => s + w.amount, 0)
      return {
        id: r.id,
        source: r.source,
        status: r.status,
        invitedName: r.invitedName,
        invitedPhone: r.source === 'DIRECT' ? r.invitedPhone : null,
        createdAt: r.createdAt,
        registeredAt: r.registeredAt,
        verifiedAt: r.verifiedAt,
        referred: r.referred
          ? {
              id: r.referred.id,
              name: r.referred.name,
              phone: maskPhone(r.referred.phone),
              role: r.referred.role,
              status: r.referred.status,
              specialty: r.referred.specialty,
            }
          : null,
        activity: { assignments: assigned, opportunities, applications },
        rewardsTotal: rewardedTotal,
        rewardsCurrency: r.rewards[0]?.currency ?? 'YER',
        hasActiveWork: assigned > 0 || opportunities > 0 || applications > 0,
      }
    })

    // ---------- الإحصاءات المطلوبة في «إحالاتي» ----------
    const verifiedCount = items.filter(
      (i) => i.status === 'VERIFIED' || i.status === 'REWARDED'
    ).length
    const activeCount = items.filter(
      (i) => (i.status === 'VERIFIED' || i.status === 'REWARDED') && i.hasActiveWork
    ).length
    const assignmentsFromReferrals = items.reduce((s, i) => s + i.activity.assignments, 0)
    const opportunitiesFromReferrals = items.reduce((s, i) => s + i.activity.opportunities, 0)

    const benefits = await getReferralBenefits(session.user.id)

    // ---------- آخر المزايا وعمليات الخصم ----------
    const [recentRewards, recentTransactions] = await Promise.all([
      db.referralReward.findMany({
        where: { referrerId: session.user.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true, originType: true, originLabel: true, baseValue: true,
          platformFeeAmount: true, currency: true, percent: true, amount: true,
          status: true, usedAmount: true, createdAt: true,
        },
      }),
      db.referralTransaction.findMany({
        where: { referrerId: session.user.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, amount: true, note: true, createdAt: true },
      }),
    ])

    return NextResponse.json({
      eligible: true,
      settings: {
        policyNote:
          settings.policyNote ??
          'تُستخدم مزايا الإحالة كخصم على رسوم المنصة وفق سياسة تكليفات، ولا تمثل رصيداً نقدياً قابلاً للسحب.',
        includeAssignments: settings.includeAssignments,
        includeOpportunities: settings.includeOpportunities,
      },
      myPercent,
      code: codeRow.code,
      inviteLink,
      visits: codeRow.visits,
      stats: {
        totalInvited: items.length,
        verified: verifiedCount,
        active: activeCount,
        assignments: assignmentsFromReferrals,
        opportunities: opportunitiesFromReferrals,
      },
      benefits,
      items,
      recentRewards,
      recentTransactions,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
