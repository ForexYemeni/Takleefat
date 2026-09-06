import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError, ApiError } from '@/lib/api-helpers'
import { notify } from '@/lib/notifications'
import { getSettings } from '@/lib/settings'

/**
 * POST /api/posts/[id]/apply — تقديم الكادر التمريضي على تكليف مُعلن
 * body: { coverNote?: string }
 * الشروط: حساب معتمد + التكليف مفتوح + عدم التقديم مسبقاً.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('NURSE')

    if (session.user.status !== 'APPROVED') {
      throw new ApiError('حسابك قيد المراجعة — يمكنك التقديم بعد اعتماد حسابك من الإدارة', 403)
    }

    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const coverNote = typeof body?.coverNote === 'string' ? body.coverNote.slice(0, 1000) : null

    const post = await db.post.findUnique({ where: { id } })
    if (!post) return jsonError('التكليف غير موجود', 404)
    if (post.status !== 'OPEN') {
      return jsonError('هذا التكليف غير متاح للتقديم حالياً', 409)
    }

    const existing = await db.application.findUnique({
      where: { postId_nurseId: { postId: id, nurseId: session.user.id } },
    })
    if (existing) {
      return jsonError('لقد قدّمت على هذا التكليف مسبقاً — بانتظار مراجعة الجهة المُعلنة', 409)
    }

    // منع التقديم على تكليف جديد قبل تأكيد الإدارة دفع رسوم/نسبة الإدارة لتكليف سابق
    const unpaid = await db.assignment.findFirst({
      where: {
        nurseId: session.user.id,
        paymentStatus: 'UNPAID',
        status: { not: 'CANCELLED' },
      },
      select: { id: true, title: true },
      orderBy: { createdAt: 'desc' },
    })
    if (unpaid) {
      return jsonError(
        `لا يمكنك التقديم على تكليف جديد قبل أن تؤكد إدارة المنصة دفع رسوم أو نسبة الإدارة لتكليفك (${unpaid.title}) — ارفع إثبات الدفع وتابع مع الإدارة`,
        403
      )
    }

    const settings = await getSettings()

    const application = await db.application.create({
      data: {
        postId: id,
        nurseId: session.user.id,
        coverNote,
        status: 'PENDING',
      },
      select: { id: true, status: true, createdAt: true },
    })

    await notify(post.receiverId, {
      title: 'تقديم جديد على تكليفك',
      body: `${session.user.name} قدّم على التكليف (${post.title}) — راجع السيرة الذاتية واعتمد أو ارفض`,
      type: 'APPLICATION_SUBMITTED',
      link: '/receiver/assignments',
    })

    return NextResponse.json(
      {
        message: `تم إرسال تقديمك بنجاح — رسوم التقديم ${settings.applicationFee} ريال تُدفع بعد اعتماد تقديمك`,
        application,
      },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
