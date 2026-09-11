import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { receiverCreateAssignmentSchema } from '@/lib/validations/assignment'
import { notify } from '@/lib/notifications'

/**
 * POST /api/receiver/assignments
 * إنشاء تكليف مباشر من حساب المستلم الإداري — بنفس طريقة حساب الإدارة تماماً:
 * يختار الكادر التمريضي المعتمد مباشرة فيُنشأ التكليف فوراً بحالة ACTIVE
 * ويصل الكادر إشعار — دون المرور بتكليف مُعلن وتقديمات.
 * المستلم هو الطرف المستقبِل بطبيعة الحال، لذا يُضبط receiverId من الجلسة.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole('RECEIVER')

    // لا إسناد مباشر إلا بعد اعتماد حساب المستلم من الإدارة (كما في إنشاء التكليفات المُعلنة)
    if (session.user.status !== 'APPROVED') {
      return jsonError('لا يمكن إنشاء التكليف قبل اعتماد حسابك من الإدارة', 403)
    }

    const parsed = receiverCreateAssignmentSchema.safeParse(await req.json())
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const { title, description, facility, department, startDate, endDate, nurseId } = parsed.data

    // التحقق من وجود الكادر وصلاحية اعتماد حسابه — نفس قاعدة الإدارة
    const nurse = await db.user.findUnique({ where: { id: nurseId } })
    if (!nurse || nurse.role !== 'NURSE' || nurse.status !== 'APPROVED') {
      return jsonError('الكادر التمريضي المختار غير موجود أو حسابه غير معتمد', 422)
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
        receiverId: session.user.id,
        createdById: session.user.id,
        status: 'ACTIVE',
      },
    })

    await db.assignmentLog.create({
      data: {
        assignmentId: assignment.id,
        userId: session.user.id,
        action: 'إنشاء التكليف (إسناد مباشر)',
        note: `أُسند التكليف مباشرة من حساب المستلم إلى الكادر ${nurse.name} — بنفس طريقة حساب الإدارة`,
      },
    })

    // إشعار الكادر المعني — نفس رسالة مسار الإدارة
    await notify(nurseId, {
      title: 'تكليف جديد',
      body: `تم إسناد تكليف جديد إليك: ${title} — ${facility}`,
      type: 'ASSIGNMENT_CREATED',
      link: '/nurse/assignments',
    })

    return NextResponse.json(
      { message: 'تم إنشاء التكليف مباشرة وإشعار الكادر المعني', assignment },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
