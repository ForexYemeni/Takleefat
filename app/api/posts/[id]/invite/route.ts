import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError, ApiError } from '@/lib/api-helpers'
import { inviteSchema } from '@/lib/validations/post'
import { notify } from '@/lib/notifications'
import { genderMatches } from '@/lib/network'

/**
 * POST /api/posts/[id]/invite — استدعاء مباشر لكوادر تمريضية لتكليف مُعلن
 * body: { nurseIds: string[], message?: string }
 * - المالك أو الإدارة فقط
 * - الاستدعاء للمطابقين للجنس فقط (فلترة الجنس إلزامية حتى في الاستدعاء)
 * - لا تكرار: من استُدعي مسبقاً أو قدّم مسبقاً يُتجاهل
 * - يصل للكادر إشعار بتفاصيل التكليف كاملة + قبول/رفض من صفحة الاستدعاءات
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('RECEIVER', 'ADMIN')
    const { id } = await params

    const post = await db.post.findUnique({
      where: { id },
      include: { hospital: { select: { name: true } } },
    })
    if (!post) return jsonError('التكليف غير موجود', 404)
    if (session.user.role === 'RECEIVER' && post.receiverId !== session.user.id) {
      throw new ApiError('يمكنك استدعاء الكوادر لتكليفاتك المُعلنة فقط', 403)
    }
    if (post.status !== 'OPEN') {
      return jsonError('هذا التكليف لم يعد متاحاً للاستدعاء', 409)
    }

    const parsed = inviteSchema.safeParse(await req.json())
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }
    const { nurseIds, message } = parsed.data

    // الكوادر المستهدفون — مع فلترة الجنس الصارمة
    const targets = await db.user.findMany({
      where: { id: { in: nurseIds }, role: 'NURSE', status: 'APPROVED' },
      select: { id: true, name: true, gender: true },
    })
    if (targets.length === 0) return jsonError('لا يوجد كادر مطابق للاستدعاء', 422)

    const mismatched = targets.filter((t) => !genderMatches(post.gender, t.gender))
    if (mismatched.length > 0) {
      return jsonError(
        `فلترة الجنس تمنع استدعاء: ${mismatched.map((m) => m.name).join('، ')} — الجنس المطلوب في هذا التكليف لا يطابقهم`,
        422
      )
    }

    // تجاهل من استُدعي مسبقاً أو قدّم مسبقاً
    const [existingInvites, existingApplications] = await Promise.all([
      db.nurseInvitation.findMany({
        where: { postId: id, nurseId: { in: targets.map((t) => t.id) } },
        select: { nurseId: true },
      }),
      db.application.findMany({
        where: { postId: id, nurseId: { in: targets.map((t) => t.id) } },
        select: { nurseId: true },
      }),
    ])
    const skip = new Set([...existingInvites.map((e) => e.nurseId), ...existingApplications.map((e) => e.nurseId)])
    const finalTargets = targets.filter((t) => !skip.has(t.id))
    if (finalTargets.length === 0) {
      return jsonError('جميع الكوادر المحددين استُدعوا أو قدّموا مسبقاً', 409)
    }

    const genderNote = post.gender === 'ANY' ? '' : post.gender === 'MALE' ? ' (ذكر)' : ' (أنثى)'
    await Promise.all([
      db.nurseInvitation.createMany({
        data: finalTargets.map((t) => ({
          postId: id,
          nurseId: t.id,
          receiverId: post.receiverId,
          message: message?.trim() || null,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        })),
      }),
      ...finalTargets.map((t) =>
        notify(t.id, {
          title: 'استدعاء مباشر لتكليف',
          body: [
            `الجهة: ${post.hospital?.name ?? post.facility}${genderNote}`,
            post.department ? `القسم: ${post.department}` : null,
            `القيمة: ${post.value} ريال`,
            post.hours ? `الساعات: ${post.hours}` : null,
            `تبدأ: ${post.startDate.toLocaleDateString('ar')}`,
            message?.trim() || 'راجع التفاصيل وأجب بالقبول أو الرفض',
          ]
            .filter(Boolean)
            .join(' — '),
          type: 'INVITATION_RECEIVED',
          link: '/nurse/invitations',
        })
      ),
    ])

    return NextResponse.json({
      message: `تم إرسال الاستدعاء إلى ${finalTargets.length} كادر — يصلهم إشعار بتفاصيل التكليف`,
      invited: finalTargets.length,
      skipped: skip.size,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
