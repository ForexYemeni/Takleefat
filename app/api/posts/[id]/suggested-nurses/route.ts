import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError, ApiError } from '@/lib/api-helpers'
import { findMatchingNurses, MATCH_PRIORITY_LABELS } from '@/lib/network'
import { phoneView, revealedStaffIds } from '@/lib/phone-privacy'

/**
 * GET /api/posts/[id]/suggested-nurses — المطابقة الذكية للكوادر لهذا التكليف
 * (المالك أو الإدارة): النتائج مطابقة للجنس إلزامياً ومرتبة بالأولوية:
 * 5 المفضلون ← 4 العاملون بالجهة ← 3 المعتمدون ← 2 المتقابَل معهم ← 1 الخارجيون
 * مع حالة التوفر والتقييم — تُستخدم في واجهة الاستدعاء والاختيار عند الإنشاء.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('RECEIVER', 'ADMIN', 'DOCTOR_SUPERVISOR')
    const { id } = await params

    const post = await db.post.findUnique({
      where: { id },
      select: {
        id: true, receiverId: true, hospitalId: true, gender: true, department: true, title: true,
      },
    })
    if (!post) return jsonError('التكليف غير موجود', 404)
    if (
      (session.user.role === 'RECEIVER' || session.user.role === 'DOCTOR_SUPERVISOR') &&
      post.receiverId !== session.user.id
    ) {
      throw new ApiError('يمكنك مطابقة الكوادر لتكليفاتك فقط', 403)
    }

    const matched = await findMatchingNurses({
      receiverId: post.receiverId,
      hospitalId: post.hospitalId,
      postGender: post.gender,
      department: post.department,
    })

    // من استُدعي أو قدّم بالفعل — يظهر معلماً لتجنب التكرار
    const [invites, applications] = await Promise.all([
      db.nurseInvitation.findMany({ where: { postId: id }, select: { nurseId: true, status: true } }),
      db.application.findMany({ where: { postId: id }, select: { nurseId: true, status: true } }),
    ])
    const inviteMap = new Map(invites.map((i) => [i.nurseId, i.status]))
    const appliedMap = new Map(applications.map((a) => [a.nurseId, a.status]))

    // الجولة 34: قناع أرقام الكوادر المقترحين — يُفتح بتكليف مسدد النسبة بين الطرفين
    const revealed =
      session.user.role === 'ADMIN'
        ? new Set<string>()
        : await revealedStaffIds(
            session.user.id,
            matched.map((n) => n.id)
          )

    return NextResponse.json({
      nurses: matched.map((n) => ({
        ...n,
        ...phoneView(session.user.role, n.phone, revealed.has(n.id)),
        priorityLabel: MATCH_PRIORITY_LABELS[n.priority] ?? MATCH_PRIORITY_LABELS[0],
        invitationStatus: inviteMap.get(n.id) ?? null,
        applicationStatus: appliedMap.get(n.id) ?? null,
      })),
      priorityLabels: MATCH_PRIORITY_LABELS,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
