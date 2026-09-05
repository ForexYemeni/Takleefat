import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireSession, handleApiError } from '@/lib/api-helpers'

/**
 * GET /api/notifications — إشعارات المستخدم الحالي
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession()
    const unreadOnly = req.nextUrl.searchParams.get('unread') === '1'

    const notifications = await db.notification.findMany({
      where: { userId: session.user.id, ...(unreadOnly ? { isRead: false } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 30,
    })

    const unreadCount = await db.notification.count({
      where: { userId: session.user.id, isRead: false },
    })

    return NextResponse.json({ notifications, unreadCount })
  } catch (error) {
    return handleApiError(error)
  }
}

const markReadSchema = z.object({
  id: z.string().optional(),
  all: z.boolean().optional(),
})

/**
 * POST /api/notifications — تعليم الإشعارات كمقروءة
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession()
    const body = await req.json()
    const parsed = markReadSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'طلب غير صحيح' }, { status: 422 })
    }

    if (parsed.data.all) {
      await db.notification.updateMany({
        where: { userId: session.user.id, isRead: false },
        data: { isRead: true },
      })
    } else if (parsed.data.id) {
      await db.notification.updateMany({
        where: { id: parsed.data.id, userId: session.user.id },
        data: { isRead: true },
      })
    }

    return NextResponse.json({ message: 'تم التحديث' })
  } catch (error) {
    return handleApiError(error)
  }
}
