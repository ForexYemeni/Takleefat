import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError, ApiError } from '@/lib/api-helpers'
import { reviewApplicationSchema } from '@/lib/validations/post'
import { getSettings, calcAdminFee, calcApplicationFee } from '@/lib/settings'
import { notify, notifyAdmins } from '@/lib/notifications'
import { formatCurrency } from '@/lib/utils'
import { audienceRole, audienceAssignmentsLink } from '@/lib/network'

/**
 * PATCH /api/applications/[id] — مراجعة تقديم (اعتماد / رفض)
 * المستلم الإداري المالك (تكليفاته) أو مشرف الأطباء المالك (تكليفات أطبائه) أو الإدارة.
 *
 * عند الاعتماد:
 * 1) يُنشأ تكليف مؤكد (Assignment) بحالة «تم الاستلام» للجمهور المقبول
 * 2) تُحسب حصة الإدارة من قيمة التكليف وتُسجل
 * 3) يُشعَر المقدّم بطرق الدفع (محفظة جيب / رقم الحساب / اسم الحساب)
 * 4) إذا اكتمل العدد المطلوب يُغلق التكليف ويُرفض بقية التقديمات
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('RECEIVER', 'ADMIN', 'DOCTOR_SUPERVISOR')
    const { id } = await params

    const parsed = reviewApplicationSchema.safeParse(await req.json())
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const application = await db.application.findUnique({
      where: { id },
      include: { post: true, nurse: { select: { name: true } } },
    })
    if (!application) return jsonError('التقديم غير موجود', 404)

    if (
      (session.user.role === 'RECEIVER' || session.user.role === 'DOCTOR_SUPERVISOR') &&
      application.post.receiverId !== session.user.id
    ) {
      throw new ApiError('يمكنك مراجعة تقديمات تكليفاتك فقط', 403)
    }

    // حماية الجمهور: مشرف الأطباء يراجع تقديمات تكليفات الأطباء حصراً — والمستلم تمريض حصراً
    const postAudienceRole = audienceRole(application.post.audience)
    if (
      session.user.role !== 'ADMIN' &&
      ((session.user.role === 'DOCTOR_SUPERVISOR' && postAudienceRole !== 'DOCTOR') ||
        (session.user.role === 'RECEIVER' && postAudienceRole !== 'NURSE'))
    ) {
      throw new ApiError('جمهور هذا التكليف لا يطابق دور حسابك', 403)
    }

    // رابط لوحة الجمهور — لإشعارات النتائج
    const audienceLink = audienceAssignmentsLink(application.post.audience)

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
        link: audienceLink,
      })

      // الجولة الخامسة عشرة: الإدارة ترى الرفض أيضاً (غير مُراجع التقديم نفسه)
      await notifyAdmins(
        {
          title: 'رفض تقديم على تكليف',
          body: `رُفض تقديم ${application.nurse.name} على التكليف (${application.post.title}) — السبب: ${note.trim()}`,
          type: 'APPLICATION_REJECTED',
          link: '/admin/assignments',
        },
        session.user.id
      )

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

    // إشعار الكادر المقبول مع تفاصيل الدفع — الكادر وحده من يرى طرق الدفع والمبالغ
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
      body: `تم اعتماد تقديمك على (${application.post.title}). المبلغ الواجب دفعه للإدارة ${formatCurrency(dueAmount)} (${dueBreakdown}) عبر ${settings.paymentMethod} — رقم الحساب: ${settings.paymentAccountNumber || '—'} — اسم الحساب: ${settings.paymentAccountName} — بعد الدفع ارفع لقطة شاشة إثبات الدفع من صفحة تكليفاتك`,
      type: 'APPLICATION_APPROVED',
      link: audienceLink,
    })

    // الجولة الخامسة عشرة: الإدارة ترى الاعتماد وإنشاء التكليف (غير المُعتمِد نفسه)
    await notifyAdmins(
      {
        title: 'اعتماد تقديم وإنشاء تكليف',
        body: `تم اعتماد تقديم ${application.nurse.name} على التكليف (${application.post.title}) بقيمة ${formatCurrency(application.post.value)}`,
        type: 'APPLICATION_APPROVED',
        link: '/admin/assignments',
      },
      session.user.id
    )

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
            body: `تقديمك على (${application.post.title}) لم يُعتمد. السبب: تم اكتمال العدد المطلوب لهذا التكليف`,
            type: 'APPLICATION_REJECTED',
            link: audienceLink,
          })
        )
      )
    }

    return NextResponse.json({
      // رسالة المستلم الإداري — بلا أي تفاصيل مالية: فقط تأكيد اختيار الكادر
      message: 'تم اختيار الكادر بنجاح — أصبح التكليف مؤكداً وستتابع حالته من قائمة التكليفات المؤكدة',
      application: updatedApplication,
      assignment,
      postClosed,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
