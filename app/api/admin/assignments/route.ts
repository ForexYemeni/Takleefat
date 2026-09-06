import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { createAssignmentSchema } from '@/lib/validations/assignment'
import { notify } from '@/lib/notifications'
import type { AssignmentStatus } from '@prisma/client'

/**
 * GET /api/admin/assignments?status=ACTIVE
 * قائمة جميع التكليفات
 */
export async function GET(req: NextRequest) {
  try {
    await requireRole('ADMIN')

    const status = req.nextUrl.searchParams.get('status')

    const assignments = await db.assignment.findMany({
      where: {
        ...(status && ['ACTIVE', 'RECEIVED', 'COMPLETED', 'CANCELLED'].includes(status)
          ? { status: status as AssignmentStatus }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        nurse: { select: { id: true, name: true, specialty: true } },
        receiver: { select: { id: true, name: true } },
        post: { select: { id: true, title: true } },
        _count: { select: { logs: true } },
      },
    })

    return NextResponse.json({ assignments })
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * POST /api/admin/assignments
 * إنشاء تكليف جديد وإسناده لكادر تمريضي ومستلم إداري
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole('ADMIN')

    const parsed = createAssignmentSchema.safeParse(await req.json())
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const { title, description, facility, department, startDate, endDate, nurseId, receiverId } =
      parsed.data

    // التحقق من وجود الكادر والمستلم وصلاحية اعتماد الحسابات
    const [nurse, receiver] = await Promise.all([
      db.user.findUnique({ where: { id: nurseId } }),
      db.user.findUnique({ where: { id: receiverId } }),
    ])

    if (!nurse || nurse.role !== 'NURSE' || nurse.status !== 'APPROVED') {
      return jsonError('الكادر التمريضي المختار غير موجود أو حسابه غير معتمد', 422)
    }
    if (!receiver || receiver.role !== 'RECEIVER' || receiver.status !== 'APPROVED') {
      return jsonError('المستلم الإداري المختار غير موجود أو حسابه غير معتمد', 422)
    }

    const start = new Date(startDate)
    const end = endDate ? new Date(endDate) : null
    if (isNaN(start.getTime())) return jsonError('تاريخ البدء غير صحيح', 422)
    if (end && isNaN(end.getTime())) return jsonError('تاريخ الانتهاء غير صحيح', 422)
    if (end && end < start) {
      return jsonError('تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء', 422)
    }

    const assignment = await db.assignment.create({
      data: {
        title,
        description: description || null,
        facility,
        department: department || null,
        startDate: start,
        endDate: end,
        nurseId,
        receiverId,
        createdById: session.user.id,
        status: 'ACTIVE',
      },
    })

    await db.assignmentLog.create({
      data: {
        assignmentId: assignment.id,
        userId: session.user.id,
        action: 'إنشاء التكليف',
        note: `تم إسناد التكليف إلى ${nurse.name} والمستلم ${receiver.name}`,
      },
    })

    // إشعار المعنيين
    await notify(nurseId, {
      title: 'تكليف جديد',
      body: `تم إسناد تكليف جديد إليك: ${title} — ${facility}`,
      type: 'ASSIGNMENT_CREATED',
      link: '/nurse/assignments',
    })
    await notify(receiverId, {
      title: 'تكليف جديد بانتظار الاستلام',
      body: `تم إسناد تكليف "${title}" بانتظار استلامك له`,
      type: 'ASSIGNMENT_CREATED',
      link: '/receiver/assignments',
    })

    return NextResponse.json(
      { message: 'تم إنشاء التكليف بنجاح وإشعار المعنيين', assignment },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
