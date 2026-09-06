import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError, ApiError } from '@/lib/api-helpers'
import { createPostSchema } from '@/lib/validations/post'
import { getSettings, calcAdminFee } from '@/lib/settings'
import { notify } from '@/lib/notifications'
import { formatCurrency } from '@/lib/utils'
import type { Prisma } from '@prisma/client'

/**
 * GET /api/posts — قائمة التكليفات المُعلنة (حسب الدور)
 * - NURSE: التكليفات المفتوحة + حالة تقديمه الخاص + بيانات الرسوم
 * - RECEIVER: تكليفاته المُعلنة مع عدد التقديمات
 * - ADMIN: جميع التكليفات المُعلنة
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireRole('NURSE', 'RECEIVER', 'ADMIN')
    const status = req.nextUrl.searchParams.get('status')

    const statusWhere: Prisma.PostWhereInput = {}
    if (status && ['OPEN', 'ASSIGNED', 'COMPLETED', 'CANCELLED'].includes(status)) {
      statusWhere.status = status as 'OPEN' | 'ASSIGNED' | 'COMPLETED' | 'CANCELLED'
    }

    if (session.user.role === 'NURSE') {
      const posts = await db.post.findMany({
        where: { ...statusWhere, status: status ? statusWhere.status : 'OPEN' },
        orderBy: { createdAt: 'desc' },
        include: {
          receiver: { select: { id: true, name: true } },
          _count: { select: { applications: true } },
          applications: {
            where: { nurseId: session.user.id },
            select: { id: true, status: true, reviewNote: true, createdAt: true },
          },
        },
      })

      const settings = await getSettings()
      return NextResponse.json({ posts, settings })
    }

    if (session.user.role === 'RECEIVER') {
      const posts = await db.post.findMany({
        where: { ...statusWhere, receiverId: session.user.id },
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { applications: { where: { status: 'PENDING' } } } },
          assignments: { select: { id: true, nurse: { select: { id: true, name: true } } } },
        },
      })
      return NextResponse.json({ posts })
    }

    // ADMIN
    const posts = await db.post.findMany({
      where: statusWhere,
      orderBy: { createdAt: 'desc' },
      include: {
        receiver: { select: { id: true, name: true } },
        _count: { select: { applications: true } },
      },
    })
    return NextResponse.json({ posts })
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * POST /api/posts — إنشاء تكليف مُعلن جديد (المستلم الإداري)
 * يظهر التكليف فوراً للكادر التمريضي المعتمد للتقديم مع الرسوم والنسبة.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole('RECEIVER')

    if (session.user.status !== 'APPROVED') {
      throw new ApiError('حسابك قيد المراجعة — لا يمكنك إنشاء تكليف حتى اعتماده من الإدارة', 403)
    }

    const parsed = createPostSchema.safeParse(await req.json())
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const { title, description, facility, department, location, startDate, endDate, nursesNeeded, value } =
      parsed.data

    const start = new Date(startDate)
    if (Number.isNaN(start.getTime())) return jsonError('تاريخ البدء غير صحيح', 422)
    const end = endDate ? new Date(endDate) : null
    if (end && Number.isNaN(end.getTime())) return jsonError('تاريخ الانتهاء غير صحيح', 422)
    if (end && end < start) return jsonError('تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء', 422)

    const post = await db.post.create({
      data: {
        title,
        description: description || null,
        facility,
        department: department || null,
        location: location || null,
        startDate: start,
        endDate: end,
        nursesNeeded,
        value,
        status: 'OPEN',
        receiverId: session.user.id,
      },
      select: { id: true, title: true, status: true },
    })

    // إشعار جميع الكادر المعتمد بوجود تكليف جديد
    const settings = await getSettings()
    const adminFee = calcAdminFee(value, settings.adminPercentage)
    const nurses = await db.user.findMany({
      where: { role: 'NURSE', status: 'APPROVED' },
      select: { id: true },
    })
    await Promise.all(
      nurses.map((nurse) =>
        notify(nurse.id, {
          title: 'تكليف جديد متاح للتقديم',
          body: `${title} — ${facility}${department ? ` (${department})` : ''} — القيمة ${formatCurrency(value)} — سارِ بالتقديم قبل اكتمال العدد`,
          type: 'POST_CREATED',
          link: '/nurse/assignments',
        })
      )
    )
    void adminFee

    return NextResponse.json(
      { message: 'تم نشر التكليف بنجاح وأصبح متاحاً للتقديم', post },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
