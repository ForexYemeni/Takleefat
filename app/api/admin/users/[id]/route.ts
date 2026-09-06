import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { reviewUserSchema, resetPasswordSchema } from '@/lib/validations/user'
import { notify } from '@/lib/notifications'
import { USER_STATUS_LABELS } from '@/lib/utils'

/**
 * PATCH /api/admin/users/[id]
 * مراجعة حساب: اعتماد / رفض / إيقاف — أو إعادة تعيين كلمة المرور { password }
 * مع إشعار المستخدم (عند مراجعة الحالة).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('ADMIN')
    const { id } = await params

    const target = await db.user.findUnique({ where: { id } })
    if (!target) return jsonError('الحساب غير موجود', 404)

    // حماية: لا يمكن للمدير تعديل حسابه أو حساب مدير آخر
    if (target.role === 'ADMIN') {
      return jsonError('لا يمكن تعديل حسابات مديري النظام', 403)
    }

    const body = await req.json().catch(() => ({}))

    // ---------- إعادة تعيين كلمة المرور ----------
    if (body && typeof body === 'object' && 'password' in body) {
      const parsed = resetPasswordSchema.safeParse(body)
      if (!parsed.success) {
        return jsonError(parsed.error.issues[0]?.message ?? 'كلمة المرور غير صحيحة', 422)
      }

      const hashed = await hash(parsed.data.password, 12)
      await db.user.update({ where: { id }, data: { password: hashed } })

      await notify(id, {
        title: 'تم تغيير كلمة مرورك',
        body: 'قامت إدارة المنصة بإعادة تعيين كلمة مرور حسابك — استخدم كلمة المرور الجديدة التي استلمتها من الإدارة لتسجيل الدخول.',
        type: 'GENERIC',
      })

      return NextResponse.json({
        message: `تم تعيين كلمة مرور جديدة للحساب (${target.name}) — أبلغها له بشكل آمن`,
      })
    }

    // ---------- مراجعة الحالة ----------
    const parsed = reviewUserSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const { status, rejectNote } = parsed.data

    if (status === 'REJECTED' && !rejectNote) {
      return jsonError('يجب إدخال سبب الرفض', 422)
    }

    // سياسة الاعتماد: لا يُعتمد أي كادر تمريضي قبل رفع مستنداته — بلا مستندات لا توجد موافقة
    if (status === 'APPROVED' && target.role === 'NURSE') {
      const documentsCount = await db.document.count({ where: { userId: id } })
      if (documentsCount === 0) {
        return jsonError(
          'لا يمكن اعتماد الكادر التمريضي قبل رفع مستنداته (الهوية وصورة المزاولة) — اطلب منه رفع المستندات أولاً',
          422
        )
      }
    }

    const updated = await db.user.update({
      where: { id },
      data: {
        status,
        rejectNote: status === 'REJECTED' ? rejectNote : null,
      },
      select: { id: true, name: true, status: true },
    })

    // إشعار المستخدم بقرار المراجعة
    if (status === 'APPROVED') {
      await notify(id, {
        title: 'تم اعتماد حسابك',
        body: 'تهانينا! تم اعتماد حسابك في منصة تكليفات ويمكنك الآن استخدام جميع الخدمات.',
        type: 'ACCOUNT_APPROVED',
        link: target.role === 'NURSE' ? '/nurse' : '/receiver',
      })
    } else if (status === 'REJECTED') {
      await notify(id, {
        title: 'تم رفض الحساب',
        body: `لم يتم اعتماد حسابك. السبب: ${rejectNote}`,
        type: 'ACCOUNT_REJECTED',
        link: '/nurse',
      })
    } else if (status === 'SUSPENDED') {
      await notify(id, {
        title: 'تم إيقاف الحساب',
        body: 'تم إيقاف حسابك مؤقتاً. يرجى التواصل مع إدارة المنصة.',
        type: 'GENERIC',
      })
    }

    return NextResponse.json({
      message: `تم تحديث حالة الحساب إلى: ${USER_STATUS_LABELS[status]}`,
      user: updated,
      reviewedBy: session.user.name,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * DELETE /api/admin/users/[id] — حذف نهائي للحساب
 * يُحذف الحساب بكل بياناته المرتبطة (مستندات، تقديمات، تكليفات، إشعارات)
 * داخل معاملة واحدة. لا ينطبق على حسابات المديرين.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('ADMIN')
    const { id } = await params

    const target = await db.user.findUnique({
      where: { id },
      include: {
        _count: { select: { documents: true, assignments: true, posts: true, applications: true } },
      },
    })
    if (!target) return jsonError('الحساب غير موجود', 404)

    if (target.role === 'ADMIN') {
      return jsonError('لا يمكن حذف حسابات مديري النظام', 403)
    }
    if (target.id === session.user.id) {
      return jsonError('لا يمكنك حذف حسابك الحالي', 403)
    }

    const result = await db.$transaction(async (tx) => {
      // سجلات التكليفات المرتبطة بالتكليفات التي طرفها الحساب
      const relatedAssignments = await tx.assignment.findMany({
        where: { OR: [{ nurseId: id }, { receiverId: id }, { createdById: id }] },
        select: { id: true },
      })
      const assignmentIds = relatedAssignments.map((a) => a.id)

      if (assignmentIds.length > 0) {
        await tx.assignmentLog.deleteMany({ where: { assignmentId: { in: assignmentIds } } })
        await tx.assignment.deleteMany({ where: { id: { in: assignmentIds } } })
      }

      // مراجعات أجراها الحساب — نُفرغ المراجع قبل حذف تقديمات غيره
      await tx.application.updateMany({
        where: { reviewedById: id },
        data: { reviewedById: null },
      })
      await tx.document.updateMany({
        where: { reviewedById: id },
        data: { reviewedById: null },
      })

      // سجلات الأحداث التي أنشأها الحساب على أي تكليف — تُحذف كي لا تعيق حذف الحساب
      await tx.assignmentLog.deleteMany({ where: { userId: id } })

      // بيانات الحساب نفسها (تُحذف بقية الارتباطات بالتتابع/التعاقب)
      await tx.notification.deleteMany({ where: { userId: id } })
      await tx.application.deleteMany({ where: { nurseId: id } })
      await tx.document.deleteMany({ where: { userId: id } })
      await tx.post.deleteMany({ where: { receiverId: id } })
      await tx.user.delete({ where: { id } })

      return {
        deletedAssignments: assignmentIds.length,
        deletedPosts: target._count.posts,
        deletedDocuments: target._count.documents,
        deletedApplications: target._count.applications,
      }
    })

    return NextResponse.json({
      message: `تم حذف الحساب (${target.name}) حذفاً نهائياً للأبد مع ${result.deletedAssignments} تكليف و${result.deletedPosts} تكليف مُعلن و${result.deletedDocuments} مستند — لا عودة ولا استرجاع`,
      details: result,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
