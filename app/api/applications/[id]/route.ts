import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError, ApiError } from '@/lib/api-helpers'
import { reviewApplicationSchema } from '@/lib/validations/post'
import { getSettings, calcAdminFee, calcApplicationFee } from '@/lib/settings'
import { notify } from '@/lib/notifications'
import { formatCurrency } from '@/lib/utils'

/**
 * PATCH /api/applications/[id] — مراجعة تقديم (اعتماد / رفض)
 * المستلم الإداري المالك (أو الإدارة).
 *
 * عند الاعتماد:
 * 1) يُنشأ تكليف مؤكد (Assignment) بحالة «تم الاستلام» للكادر المقبول
 * 2) تُحسب حصة الإدارة من قيمة التكليف وتُسجل
 * 3) يُشعَر الكادر بطرق الدفع (محفظة جيب / رقم الحساب / اسم الحساب)
 * 4) إذا اكتمل العدد المطلوب يُغلق التكليف ويُرفض بقية التقديمات
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('RECEIVER', 'ADMIN')
    const { id } = await params

    const parsed = reviewApplicationSchema.safeParse(await req.json())
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const application = await db.application.findUnique({
      where: { id },
      include: { post: true },
    })
    if (!application) return jsonError('التقديم غير موجود', 404)

    if (session.user.role === 'RECEIVER' && application.post.receiverId !== session.user.id) {
      throw new ApiError('يمكنك مراجعة تقديمات تكليفاتك فقط', 403)
    }

    if (application.status !== 'PENDING') {
      return jsonError('تمت مراجعة هذا التقديم مسبقاً', 409)
    }

    const { action, note } = parsed.data

    if (action === 'REJECT') {
      if (!note?.trim()) {
        return jsonError('يجب إدخال سبب الرفض', 422)
      }

      await db.application.update({
        where: { id },
        data: {
          status: 'REJECTED',
          reviewNote: note.trim(),
          reviewedById: session.user.id,
          reviewedAt: new Date(),
        },
      })

      await notify(application.nurseId, {
        title: 'لم يتم اعتماد تقديمك',
        body: `تقديمك على التكليف (${application.post.title}) لم يُعتمد. السبب: ${note.trim()}`,
        type: 'APPLICATION_REJECTED',
        link: '/nurse/assignments',
      })

      return NextResponse.json({ message: 'تم رفض التقديم وإشعار الكادر بالسبب' })
    }

    // ---------- الاعتماد ----------
    if (application.post.status !== 'OPEN') {
      return jsonError('التكليف لم يعد مفتوحاً للاعتماد', 409)
    }

    const settings = await getSettings()
    const adminFee = calcAdminFee(application.post.value, settings)

    const [updatedApplication, assignment] = await db.$transaction([
      db.application.update({
        where: { id },
        data: {
          status: 'APPROVED',
          reviewNote: note?.trim() || null,
          reviewedById: session.user.id,
          reviewedAt: new Date(),
        },
      }),
      db.assignment.create({
        data: {
          title: application.post.title,
          description: application.post.description,
          facility: application.post.facility,
          department: application.post.department,
          startDate: application.post.startDate,
          status: 'RECEIVED',
          receivedAt: new Date(),
          nurseId: application.nurseId,
          receiverId: application.post.receiverId,
          createdById: session.user.id,
          value: application.post.value,
          adminFee,
          postId: application.post.id,
          logs: {
            create: [
              {
                userId: session.user.id,
                action: 'اعتماد التقديم',
                note: `تم اعتماد تقديم الكادر وإنشاء التكليف بقيمة ${formatCurrency(application.post.value)}`,
              },
            ],
          },
        },
        select: { id: true, status: true },
      }),
    ])

    // إشعار الكادر المقبول مع تفاصيل الدفع
    // يُحصّل نوع واحد فقط حسب نمط الرسوم: حصة الإدارة أو رسوم التقديم
    const applicationFee = calcApplicationFee(settings)
    const dueAmount = adminFee + applicationFee
    const dueBreakdown =
      adminFee > 0 && applicationFee > 0
        ? `حصة الإدارة + رسوم التقديم`
        : adminFee > 0
          ? 'حصة الإدارة'
          : 'رسوم التقديم'
    await notify(application.nurseId, {
      title: 'تهانينا! تم اعتماد تقديمك',
      body: `تم اعتماد تقديمك على (${application.post.title}). المبلغ الواجب دفعه للإدارة ${formatCurrency(dueAmount)} (${dueBreakdown}) عبر ${settings.paymentMethod} — رقم الحساب: ${settings.paymentAccountNumber || '—'} — اسم الحساب: ${settings.paymentAccountName}`,
      type: 'APPLICATION_APPROVED',
      link: '/nurse/assignments',
    })

    // إذا اكتمل العدد المطلوب: إغلاق التكليف ورفض بقية التقديمات
    const approvedCount = await db.application.count({
      where: { postId: application.postId, status: 'APPROVED' },
    })

    let postClosed = false
    if (approvedCount >= application.post.nursesNeeded) {
      postClosed = true
      await db.post.update({
        where: { id: application.postId },
        data: { status: 'ASSIGNED' },
      })

      const remaining = await db.application.findMany({
        where: { postId: application.postId, status: 'PENDING' },
        select: { id: true, nurseId: true },
      })
      await Promise.all(
        remaining.map((app) =>
          db.application.update({
            where: { id: app.id },
            data: {
              status: 'REJECTED',
              reviewNote: 'تم اكتمال عدد الكادر المطلوب لهذا التكليف',
              reviewedById: session.user.id,
              reviewedAt: new Date(),
            },
          })
        )
      )
      await Promise.all(
        remaining.map((app) =>
          notify(app.nurseId, {
            title: 'لم يتم اعتماد تقديمك',
            body: `تقديمك على (${application.post.title}) لم يُعتمد. السبب: تم اكتمال عدد الكادر المطلوب`,
            type: 'APPLICATION_REJECTED',
            link: '/nurse/assignments',
          })
        )
      )
    }

    return NextResponse.json({
      message: `تم اعتماد التقديم وإنشاء التكليف — المبلغ الواجب دفعه للإدارة ${formatCurrency(dueAmount)}`,
      application: updatedApplication,
      assignment,
      postClosed,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
