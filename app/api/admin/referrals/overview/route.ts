import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError } from '@/lib/api-helpers'
import { getReferralSettings } from '@/lib/referrals'

/**
 * GET /api/admin/referrals/overview — لوحة «إدارة الإحالات» (الجولة 75)
 * ------------------------------------------------------------
 * الإدارة حصراً: إحصاءات شاملة + التقارير (حسب الدور وحسب الشهر) + قوائم
 * الإحالات والمزايا وعمليات الخصم وسجل التدقيق — قراءة حصراً بلا أي مساس
 * بأقسام لوحة الإدارة القائمة.
 */
export async function GET(req: NextRequest) {
  try {
    await requireRole('ADMIN')

    const settings = await getReferralSettings()

    // ---------- قوائم أساسية ----------
    const [referrals, rewards, transactions, auditLogs] = await Promise.all([
      db.referral.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          referrer: { select: { id: true, name: true, phone: true, role: true } },
          referred: { select: { id: true, name: true, phone: true, role: true, status: true } },
          rewards: { select: { amount: true, currency: true, status: true } },
        },
      }),
      db.referralReward.findMany({
        orderBy: { createdAt: 'desc' },
        take: 60,
        include: { referrer: { select: { id: true, name: true, role: true } } },
      }),
      db.referralTransaction.findMany({
        orderBy: { createdAt: 'desc' },
        take: 60,
        include: {
          referrer: { select: { id: true, name: true, role: true } },
        },
      }),
      db.referralAuditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 80,
        include: { actor: { select: { name: true } } },
      }),
    ])

    const referredIds = referrals.map((r) => r.referredId).filter((v): v is string => Boolean(v))

    // نشاط المُحالين من النظام القائم نفسه
    const [assignmentsByNurse, selectionsByCandidate] = await Promise.all([
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
    ])
    const assignmentsCount = new Map(assignmentsByNurse.map((r) => [r.nurseId, r._count._all]))
    const selectionsCount = new Map(selectionsByCandidate.map((r) => [r.candidateId, r._count._all]))

    // ---------- إحصاءات عامة ----------
    const byStatus = { INVITED: 0, REGISTERED: 0, VERIFIED: 0, REWARDED: 0, BLOCKED: 0 } as Record<string, number>
    for (const r of referrals) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1

    const rewardAgg: Record<string, { count: number; amount: number }> = {}
    for (const status of ['ACCRUED', 'PENDING_REVIEW', 'CANCELLED', 'USED', 'PARTIALLY_USED']) {
      rewardAgg[status] = { count: 0, amount: 0 }
    }
    for (const w of rewards) {
      rewardAgg[w.status].count += 1
      rewardAgg[w.status].amount += w.amount
    }

    const usedTotal = transactions.reduce((s, t) => s + t.amount, 0)
    const accruedTotal = rewards
      .filter((w) => ['ACCRUED', 'PARTIALLY_USED', 'USED'].includes(w.status))
      .reduce((s, w) => s + w.amount, 0)

    const assignmentsFromReferrals = referrals.reduce(
      (s, r) => s + (r.referredId ? (assignmentsCount.get(r.referredId) ?? 0) : 0),
      0
    )
    const opportunitiesFromReferrals = referrals.reduce(
      (s, r) => s + (r.referredId ? (selectionsCount.get(r.referredId) ?? 0) : 0),
      0
    )

    // ---------- التقارير: حسب دور المُحيل + حسب الشهر (آخر 6 أشهر) ----------
    const byRole: Record<string, { referrals: number; rewards: number; amount: number }> = {}
    for (const r of referrals) {
      const role = r.referrer.role
      byRole[role] ??= { referrals: 0, rewards: 0, amount: 0 }
      byRole[role].referrals += 1
    }
    for (const w of rewards) {
      const role = w.referrer.role
      byRole[role] ??= { referrals: 0, rewards: 0, amount: 0 }
      byRole[role].rewards += 1
      byRole[role].amount += w.amount
    }

    const now = new Date()
    const monthly: Array<{ key: string; label: string; rewards: number; amount: number }> = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      monthly.push({
        key,
        label: d.toLocaleDateString('ar', { month: 'long' }),
        rewards: 0,
        amount: 0,
      })
    }
    const monthIndex = new Map(monthly.map((m, i) => [m.key, i]))
    for (const w of rewards) {
      const key = `${w.createdAt.getFullYear()}-${String(w.createdAt.getMonth() + 1).padStart(2, '0')}`
      const idx = monthIndex.get(key)
      if (idx != null) {
        monthly[idx].rewards += 1
        monthly[idx].amount += w.amount
      }
    }

    // قائمة المُحيلين لأعلى استحقاقاً (للتقرير)
    const topReferrers = Object.values(
      referrals.reduce<Record<string, { id: string; name: string; role: string; referred: number; amount: number }>>(
        (acc, r) => {
          const key = r.referrer.id
          acc[key] ??= {
            id: r.referrer.id,
            name: r.referrer.name,
            role: r.referrer.role,
            referred: 0,
            amount: 0,
          }
          acc[key].referred += 1
          acc[key].amount += r.rewards.reduce(
            (s, w) => s + (['ACCRUED', 'PARTIALLY_USED', 'USED'].includes(w.status) ? w.amount : 0),
            0
          )
          return acc
        },
        {}
      )
    )
      .sort((a, b) => b.amount - a.amount || b.referred - a.referred)
      .slice(0, 8)

    // إجمالي الرصيد المتبقي على مستوى المنصة (من مزايا كل المُحيلين المستحقين)
    const platformBenefits = {
      accrued: accruedTotal,
      used: usedTotal,
      remaining: Math.max(0, accruedTotal - usedTotal),
    }

    return NextResponse.json({
      settings,
      stats: {
        totalReferrals: referrals.length,
        byStatus,
        rewards: rewardAgg,
        benefits: platformBenefits,
        assignmentsFromReferrals,
        opportunitiesFromReferrals,
      },
      reports: { byRole, monthly, topReferrers },
      referrals: referrals.map((r) => ({
        id: r.id,
        source: r.source,
        status: r.status,
        invitedName: r.invitedName,
        invitedPhone: r.invitedPhone,
        createdAt: r.createdAt,
        registeredAt: r.registeredAt,
        verifiedAt: r.verifiedAt,
        note: r.note,
        referrer: r.referrer,
        referred: r.referred,
        activity: {
          assignments: r.referredId ? (assignmentsCount.get(r.referredId) ?? 0) : 0,
          opportunities: r.referredId ? (selectionsCount.get(r.referredId) ?? 0) : 0,
        },
        rewardsTotal: r.rewards
          .filter((w) => ['ACCRUED', 'PARTIALLY_USED', 'USED'].includes(w.status))
          .reduce((s, w) => s + w.amount, 0),
      })),
      rewards: rewards.map((w) => ({
        id: w.id,
        originType: w.originType,
        originLabel: w.originLabel,
        baseValue: w.baseValue,
        platformFeeAmount: w.platformFeeAmount,
        currency: w.currency,
        percent: w.percent,
        amount: w.amount,
        status: w.status,
        usedAmount: w.usedAmount,
        decidedAt: w.decidedAt,
        decisionNote: w.decisionNote,
        createdAt: w.createdAt,
        referrer: w.referrer,
      })),
      transactions: transactions.map((t) => ({
        id: t.id,
        amount: t.amount,
        note: t.note,
        createdAt: t.createdAt,
        referrer: t.referrer,
      })),
      auditLogs: auditLogs.map((l) => ({
        id: l.id,
        action: l.action,
        entityType: l.entityType,
        entityId: l.entityId,
        meta: l.meta,
        createdAt: l.createdAt,
        actorRole: l.actorRole,
        actorName: l.actor?.name ?? null,
      })),
    })
  } catch (error) {
    return handleApiError(error)
  }
}

/** POST — غير مدعوم (قراءة حصراً) */
export async function POST(_req: NextRequest) {
  void _req
  return NextResponse.json({ error: 'غير مدعوم' }, { status: 405 })
}
