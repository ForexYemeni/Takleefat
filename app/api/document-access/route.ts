import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { createDocumentAccessSchema } from '@/lib/validations/document-access'
import { notifyAdmins } from '@/lib/notifications'

/**
 * طلبات رؤية مستندات الكادر — الجولة 61 | تكليفات | Takleefat
 * ============================================================
 * GET  /api/document-access — قائمة الطلبات:
 *      الإدارة ترى كل الطلبات، والمستلم/المشرف يرى طلباته هو فقط.
 * POST /api/document-access — إنشاء طلب جديد (المستلم/المشرف):
 *      { targetId, reason } — سبب إجباري، ولا يُقبل طلب جديد
 *      إذا كان هناك طلب قيد المراجعة أو منح قائم لنفس الكادر.
 */
export async function GET() {
  try {
    const session = await requireRole('ADMIN', 'RECEIVER', 'DOCTOR_SUPERVISOR')
    const isAdmin = session.user.role === 'ADMIN'

    const requests = await db.documentAccessRequest.findMany({
      where: isAdmin ? {} : { requesterId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        reason: true,
        status: true,
        reviewNote: true,
        createdAt: true,
        reviewedAt: true,
        requester: { select: { id: true, name: true, role: true } },
        target: {
          select: { id: true, name: true, role: true, specialty: true, status: true },
        },
        reviewer: { select: { name: true } },
      },
    })

    return NextResponse.json({ requests })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole('RECEIVER', 'DOCTOR_SUPERVISOR')

    if (session.user.status !== 'APPROVED') {
      return jsonError('لا يمكن إرسال الطلب قبل اعتماد حسابك من الإدارة', 403)
    }

    const parsed = createDocumentAccessSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }
    const { targetId, reason } = parsed.data

    if (targetId === session.user.id) {
      return jsonError('لا يمكنك طلب رؤية مستنداتك', 422)
    }

    const target = await db.user.findUnique({
      where: { id: targetId },
      select: { id: true, name: true, role: true, status: true },
    })
    if (!target || (target.role !== 'NURSE' && target.role !== 'DOCTOR')) {
      return jsonError('الحساب المطلوب ليس كادراً تمريضياً أو طبيباً', 404)
    }
    if (target.status !== 'APPROVED') {
      return jsonError('حساب هذا الكادر غير معتمد حالياً', 422)
    }

    const existing = await db.documentAccessRequest.findFirst({
      where: {
        requesterId: session.user.id,
        targetId,
        status: { in: ['PENDING', 'APPROVED'] },
      },
      select: { id: true, status: true },
    })
    if (existing) {
      return jsonError(
        existing.status === 'PENDING'
          ? 'لديك طلب قيد مراجعة الإدارة لهذا الكادر — يُرجى الانتظار حتى القرار'
          : 'لديك صلاحية رؤية مستندات هذا الكادر بالفعل',
        409
      )
    }

    const requester = await db.user.findUnique({
      where: { id: session.user.id },
      select: { name: true },
    })

    const created = await db.documentAccessRequest.create({
      data: {
        requesterId: session.user.id,
        targetId,
        reason: reason.trim(),
      },
      select: { id: true, status: true, createdAt: true },
    })

    // إشعار الإدارة بطلب جديد — لا يُفشل المسار الأساسي أبداً
    await notifyAdmins({
      title: 'طلب رؤية مستندات',
      body: `${requester?.name ?? 'جهة صحية'} يطلب رؤية مستندات ${target.name} — السبب: ${reason.trim()}`,
      type: 'DOCUMENT_ACCESS_REQUESTED',
      link: '/admin/document-access',
    })

    return NextResponse.json(
      { message: 'أُرسل طلبك إلى الإدارة — سيصلك إشعار فور صدور القرار', request: created },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
