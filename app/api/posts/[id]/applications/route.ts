import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError, ApiError } from '@/lib/api-helpers'

/**
 * GET /api/posts/[id]/applications — تقديمات التكليف المُعلن
 * للمستلم الإداري المالك (وللإدارة) — تشمل السيرة الذاتية الاحترافية:
 * البيانات، بيانات التواصل، المستندات (البطاقة والمزاولة) لكل متقدم.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('RECEIVER', 'ADMIN')
    const { id } = await params

    const post = await db.post.findUnique({
      where: { id },
      select: { id: true, receiverId: true, title: true, status: true },
    })
    if (!post) return jsonError('التكليف غير موجود', 404)

    if (session.user.role === 'RECEIVER' && post.receiverId !== session.user.id) {
      throw new ApiError('يمكنك عرض تقديمات تكليفاتك فقط', 403)
    }

    const applications = await db.application.findMany({
      where: { postId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        nurse: {
          select: {
            id: true,
            name: true,
            phone: true,
            specialty: true,
            qualification: true,
            yearsOfExperience: true,
            createdAt: true,
            documents: {
              select: {
                id: true,
                type: true,
                title: true,
                fileUrl: true,
                fileName: true,
                fileSize: true,
                mimeType: true,
                status: true,
              },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
    })

    return NextResponse.json({ applications })
  } catch (error) {
    return handleApiError(error)
  }
}
