import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError, ApiError } from '@/lib/api-helpers'
import { updatePostStatusSchema } from '@/lib/validations/post'

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
        applications: {
          include: {
            nurse: {
              select: {
                id: true,
                name: true,
                phone: true,
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
 * PATCH /api/posts/[id] — إدارة حالة التكليف المُعلن (فتح/إلغاء)
 * المالك (المستلم الإداري) أو الإدارة — ولا يمكن الإلغاء بعد وجود كادر معتمد.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('RECEIVER', 'ADMIN')
    const { id } = await params

    const parsed = updatePostStatusSchema.safeParse(await req.json())
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const post = await db.post.findUnique({
      where: { id },
      include: { _count: { select: { applications: { where: { status: 'APPROVED' } } } } },
    })
    if (!post) return jsonError('التكليف غير موجود', 404)

    if (session.user.role === 'RECEIVER' && post.receiverId !== session.user.id) {
      throw new ApiError('يمكنك إدارة تكليفاتك المُعلنة فقط', 403)
    }

    const { status } = parsed.data

    if (status === 'CANCELLED' && post._count.applications.approved > 0) {
      return jsonError('لا يمكن إلغاء التكليف — يوجد كادر معتمد عليه بالفعل', 409)
    }

    const updated = await db.post.update({
      where: { id },
      data: { status },
      select: { id: true, status: true },
    })

    // إشعار المتقدمين عند الإلغاء
    if (status === 'CANCELLED') {
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
      message: status === 'CANCELLED' ? 'تم إلغاء التكليف المُعلن' : 'تم إعادة فتح التكليف للتقديم',
      post: updated,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
