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
            gender: true,
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
            // التقييمات الاحترافية — تُضاف إلى السيرة الذاتية عند التقديم لأي تكليف
            ratingsReceived: {
              orderBy: { createdAt: 'desc' },
              select: {
                overall: true,
                punctuality: true,
                quality: true,
                communication: true,
                discipline: true,
                comment: true,
                createdAt: true,
                receiver: { select: { name: true } },
                assignment: { select: { title: true } },
              },
            },
          },
        },
      },
    })

    // ملخص التقييمات لكل متقدم (المتوسط + العدد + أحدث التعليقات) + علم المفضلة الخاص بالمستلم
    const favorites = await db.favoriteNurse.findMany({
      where: { receiverId: session.user.id },
      select: { nurseId: true },
    })
    const favSet = new Set(favorites.map((f) => f.nurseId))

    const applicationsWithRatings = applications.map((a) => {
      const rs = a.nurse.ratingsReceived
      const count = rs.length
      const average =
        count > 0
          ? Math.round((rs.reduce((s, r) => s + r.overall, 0) / count) * 10) / 10
          : 0
      const avg = (key: 'punctuality' | 'quality' | 'communication' | 'discipline') => {
        const vals = rs.map((r) => r[key]).filter((v): v is number => typeof v === 'number')
        return vals.length > 0
          ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10
          : null
      }
      const { ratingsReceived, ...nurse } = a.nurse
      return {
        ...a,
        nurse: {
          ...nurse,
          isFavorite: favSet.has(a.nurse.id),
          ratings: {
            average,
            count,
            axes: {
              punctuality: avg('punctuality'),
              quality: avg('quality'),
              communication: avg('communication'),
              discipline: avg('discipline'),
            },
            latest: ratingsReceived.slice(0, 3).map((r) => ({
              overall: r.overall,
              comment: r.comment,
              createdAt: r.createdAt,
              receiverName: r.receiver.name,
              assignmentTitle: r.assignment.title,
            })),
          },
        },
      }
    })

    // applicationId = معرّف التقديم (تتوقعه بطاقة السيرة الذاتية في الواجهة)
    return NextResponse.json({
      applications: applicationsWithRatings.map((a) => ({ ...a, applicationId: a.id })),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
