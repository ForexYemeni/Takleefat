import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError, ApiError } from '@/lib/api-helpers'
import { updatePostSchema } from '@/lib/validations/post'
import { notify } from '@/lib/notifications'
import { canNurseSeePost, escalateDueProgressivePosts, progressiveAudienceIds, DISTRIBUTION_LABELS } from '@/lib/network'
import type { Gender } from '@prisma/client'

/**
 * GET /api/posts/[id] — تفاصيل تكليف مُعلن
 * - NURSE: التفاصيل + الرسوم + حالة تقديمه الخاص
 * - RECEIVER (المالك): التفاصيل + التقديمات
 * - ADMIN: التفاصيل الكاملة
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('NURSE', 'RECEIVER', 'ADMIN')
    const { id } = await params

    const post = await db.post.findUnique({
      where: { id },
      include: {
        receiver: { select: { id: true, name: true } },
        hospital: { select: { id: true, name: true, type: true, city: true, status: true } },
        applications: {
          include: {
            nurse: {
              select: {
                id: true,
                name: true,
                phone: true,
                gender: true,
                specialty: true,
                qualification: true,
                yearsOfExperience: true,
              },
            },
          },
        },
        assignments: {
          select: {
            id: true,
            status: true,
            value: true,
            adminFee: true,
            paymentStatus: true,
            nurse: { select: { id: true, name: true, phone: true } },
          },
        },
      },
    })

    if (!post) return jsonError('التكليف غير موجود', 404)

    if (session.user.role === 'NURSE') {
      await escalateDueProgressivePosts()
      const me = await db.user.findUnique({
        where: { id: session.user.id },
        select: { gender: true },
      })
      // حماية الرابط المباشر: غير المطابق للجنس أو غير المضمّن في جمهور التوزيع = 404
      const allowed = await canNurseSeePost(post, {
        nurseId: session.user.id,
        nurseGender: me?.gender ?? null,
      })
      if (!allowed) return jsonError('هذا التكليف غير متاح لك', 404)

      const { applications, ...rest } = post
      const mine = applications.find((a) => a.nurse.id === session.user.id) ?? null
      return NextResponse.json({ post: rest, myApplication: mine })
    }

    if (session.user.role === 'RECEIVER' && post.receiverId !== session.user.id) {
      throw new ApiError('ليست لديك صلاحية للوصول إلى هذا التكليف', 403)
    }

    return NextResponse.json({ post })
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * PATCH /api/posts/[id] — تعديل/إدارة التكليف المُعلن
 * - ADMIN: يمكنه تعديل أي تكليف (العنوان، القيمة، الجنس، الساعات، القسم...) — وإلغاؤه أو فتحه
 * - RECEIVER المالك: تعديل تكليفه وهو مفتوح + إلغاؤه أو إعادة فتحه
 * لا يمكن الإلغاء بعد وجود كادر معتمد، ولا تقليص العدد تحت عدد المعتمدين.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('RECEIVER', 'ADMIN')
    const { id } = await params

    const post = await db.post.findUnique({
      where: { id },
      include: { _count: { select: { applications: { where: { status: 'APPROVED' } } } } },
    })
    if (!post) return jsonError('التكليف غير موجود', 404)

    const isOwner = session.user.role === 'RECEIVER' && post.receiverId === session.user.id
    if (session.user.role === 'RECEIVER' && !isOwner) {
      throw new ApiError('يمكنك إدارة تكليفاتك المُعلنة فقط', 403)
    }

    const parsed = updatePostSchema.safeParse(await req.json())
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const data = parsed.data
    const approvedCount = post._count.applications

    // حماية العدد المطلوب — لا يقل عن عدد المعتمدين
    if (data.nursesNeeded != null && data.nursesNeeded < approvedCount) {
      return jsonError(
        `لا يمكن تقليص العدد المطلوب — يوجد ${approvedCount} كادر معتمد بالفعل`,
        409
      )
    }

    // الإلغاء ممنوع بعد اعتماد كادر
    if (data.status === 'CANCELLED' && approvedCount > 0) {
      return jsonError('لا يمكن إلغاء التكليف — يوجد كادر معتمد عليه بالفعل', 409)
    }

    // المالك يعدل الحقول فقط وهو مفتوح (الحالة مسموحة دائماً للمالك)
    if (isOwner && post.status !== 'OPEN' && !data.status) {
      return jsonError('لا يمكن تعديل بيانات التكليف بعد إغلاقه — يمكنك إعادة فتحه أولاً', 409)
    }

    // الجهة الصحية عند التعديل — من قوائم الإدارة
    let facility: string | undefined
    let location: string | null | undefined
    if (data.hospitalId) {
      const hospital = await db.hospital.findUnique({ where: { id: data.hospitalId } })
      if (!hospital || !hospital.isActive) {
        return jsonError('الجهة الصحية غير موجودة — اختر من القائمة المضافة من الإدارة', 422)
      }
      facility = hospital.name
      location = hospital.location
    }

    let start: Date | undefined
    if (data.startDate) {
      start = new Date(data.startDate)
      if (Number.isNaN(start.getTime())) return jsonError('تاريخ البدء غير صحيح', 422)
    }

    const updated = await db.post.update({
      where: { id },
      data: {
        ...(data.title != null ? { title: data.title.trim() } : {}),
        ...(data.description !== undefined ? { description: data.description || null } : {}),
        ...(facility != null ? { facility, location, hospitalId: data.hospitalId } : {}),
        ...(data.department !== undefined ? { department: data.department || null } : {}),
        ...(start != null ? { startDate: start } : {}),
        ...(data.hours !== undefined ? { hours: data.hours ? Number(data.hours) : null } : {}),
        ...(data.gender != null ? { gender: data.gender as Gender } : {}),
        ...(data.nursesNeeded != null ? { nursesNeeded: data.nursesNeeded } : {}),
        ...(data.value != null ? { value: data.value } : {}),
        ...(data.status != null ? { status: data.status } : {}),
      },
      select: { id: true, title: true, status: true, facility: true, location: true, distribution: true, progressiveStage: true },
    })

    // ---------- ترقية مرحلة النشر التدريجي يدوياً ----------
    if (data.escalateStage && updated.distribution === 'PROGRESSIVE' && updated.progressiveStage < 3 && !data.status) {
      const nextStage = updated.progressiveStage + 1
      await db.post.update({
        where: { id },
        data: {
          progressiveStage: nextStage,
          progressiveNextAt: nextStage >= 3 ? null : new Date(Date.now() + (data.progressiveStageHours ?? 24) * 60 * 60 * 1000),
        },
      })
      const fresh = await db.post.findUnique({ where: { id } })
      if (fresh) {
        const audience = await progressiveAudienceIds(fresh)
        await Promise.all(
          audience.map((nurseId) =>
            notify(nurseId, {
              title: 'تكليف متاح في مرحلتك',
              body: `تم توسيع نشر التكليف (${updated.title}) ليشمل فئتك — راجعه وتقدّم الآن`,
              type: 'POST_CREATED',
              link: '/nurse/assignments',
            })
          )
        )
      }
      return NextResponse.json({
        message: `تم توسيع نشر التكليف إلى ${DISTRIBUTION_LABELS.PROGRESSIVE} — المرحلة ${nextStage + 1}`,
        post: updated,
      })
    }

    // إشعار المتقدمين عند الإلغاء
    if (data.status === 'CANCELLED') {
      const applicants = await db.application.findMany({
        where: { postId: id, status: 'PENDING' },
        select: { nurseId: true },
      })
      await Promise.all(
        applicants.map((a) =>
          db.notification.create({
            data: {
              userId: a.nurseId,
              title: 'إلغاء تكليف',
              body: `تم إلغاء التكليف (${post.title}) من الجهة المُعلنة`,
              type: 'GENERIC',
              link: '/nurse/assignments',
            },
          })
        )
      )
    }

    return NextResponse.json({
      message: data.status === 'CANCELLED'
        ? 'تم إلغاء التكليف المُعلن'
        : data.status === 'OPEN'
          ? 'تم إعادة فتح التكليف للتقديم'
          : 'تم تحديث التكليف بنجاح',
      post: updated,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * DELETE /api/posts/[id] — حذف تكليف مُعلن (الإدارة أو المالك)
 * يُسمح فقط عندما لا يوجد كادر معتمد — تُرفض التقديمات المعلقة بإشعار.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('RECEIVER', 'ADMIN')
    const { id } = await params

    const post = await db.post.findUnique({
      where: { id },
      include: {
        _count: { select: { applications: { where: { status: 'APPROVED' } } } },
        assignments: { select: { id: true } },
      },
    })
    if (!post) return jsonError('التكليف غير موجود', 404)

    const isOwner = session.user.role === 'RECEIVER' && post.receiverId === session.user.id
    if (session.user.role === 'RECEIVER' && !isOwner) {
      throw new ApiError('يمكنك حذف تكليفاتك المُعلنة فقط', 403)
    }

    if (post._count.applications > 0) {
      return jsonError('لا يمكن حذف التكليف — يوجد كادر معتمد عليه', 409)
    }
    if (post.assignments.length > 0) {
      return jsonError('لا يمكن حذف التكليف — مرتبط بتكليفات مؤكدة', 409)
    }

    // إشعار المتقدمين المعلقين قبل الحذف
    const pending = await db.application.findMany({
      where: { postId: id, status: 'PENDING' },
      select: { id: true, nurseId: true },
    })
    await Promise.all(
      pending.map((a) =>
        notify(a.nurseId, {
          title: 'إلغاء تكليف',
          body: `تم حذف التكليف (${post.title}) الذي قدّمت عليه`,
          type: 'GENERIC',
          link: '/nurse/assignments',
        })
      )
    )

    await db.post.delete({ where: { id } })

    return NextResponse.json({ message: `تم حذف التكليف (${post.title}) بنجاح` })
  } catch (error) {
    return handleApiError(error)
  }
}
