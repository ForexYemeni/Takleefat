import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { reviewUserSchema, resetPasswordSchema, commissionPercentSchema, fullProfileAccessSchema } from '@/lib/validations/user'
import { notify } from '@/lib/notifications'
import { getSettings, effectiveSharePercent } from '@/lib/settings'
import { USER_STATUS_LABELS } from '@/lib/utils'

/**
 * GET /api/admin/users/[id] — الملف التفصيلي الكامل للحساب (قبل الاعتماد وبعده)
 * - المستلم الإداري ومشرف الأطباء: بياناتهما + التكليفات المُعلنة + التكليفات + الأرباح + طلبات السحب
 *   (نسبة الحصة حسب الدور: supervisorSharePercent للمشرف / receiverSharePercent للمستلم)
 * - الكادر التمريضي والطبيب: بياناته + مستنداته + تكليفاته + تقييماته
 * لا تُرجع كلمة المرور إطلاقاً، ولا ينطبق على حسابات المديرين.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole('ADMIN')
    const { id } = await params

    const user = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        phone: true,
        role: true,
        status: true,
        specialty: true,
        qualification: true,
        yearsOfExperience: true,
        hospitalName: true,
        rejectNote: true,
        commissionPercent: true,
        fullProfileAccess: true,
        walletAddress: true,
        accountNumber: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { documents: true, assignments: true, posts: true, notifications: true } },
      },
    })
    if (!user) return jsonError('الحساب غير موجود', 404)
    if (user.role === 'ADMIN') return jsonError('لا يمكن عرض ملفات مديري النظام', 403)

    // ---------- المستلم الإداري ومشرف الأطباء: تكليفات مُعلنة + تكليفات + أرباح + سحوبات ----------
    // الجولة 31: مشرف الأطباء كان يفتح «البيانات الكاملة» بلا أي محتوى لأن النافذة
    // تتطلب مفتاح receiver الذي كان يُعاد للمستلم حصراً — الآن نفس الحزمة الكاملة
    // تُعاد للمشرف بنسبة حصته الخاصة (supervisorSharePercent).
    if (user.role === 'RECEIVER' || user.role === 'DOCTOR_SUPERVISOR') {
      const [posts, assignments, earningRecords, recentWithdrawals, allWithdrawals, earnedAgg, settings] =
        await Promise.all([
          db.post.findMany({
            where: { receiverId: id },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
              id: true, number: true, title: true, facility: true, department: true,
              value: true, hours: true, status: true, createdAt: true,
              _count: { select: { applications: true } },
            },
          }),
          db.assignment.findMany({
            where: { receiverId: id },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
              id: true, title: true, facility: true, department: true, status: true,
              value: true, adminFee: true, paymentStatus: true, createdAt: true,
              nurse: { select: { name: true } },
            },
          }),
          db.receiverEarning.findMany({
            where: { receiverId: id },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
              id: true, amount: true, percent: true, createdAt: true,
              assignment: { select: { id: true, title: true } },
            },
          }),
          db.withdrawal.findMany({
            where: { receiverId: id },
            orderBy: { createdAt: 'desc' },
            take: 10,
          }),
          db.withdrawal.findMany({ where: { receiverId: id }, select: { status: true, amount: true } }),
          db.receiverEarning.aggregate({ where: { receiverId: id }, _sum: { amount: true } }),
          getSettings(),
        ])

      const totalEarned = earnedAgg._sum.amount ?? 0
      const withdrawn = allWithdrawals.filter((w) => w.status === 'PAID').reduce((s, w) => s + w.amount, 0)
      const pending = allWithdrawals.filter((w) => w.status === 'PENDING').reduce((s, w) => s + w.amount, 0)
      const available = Math.max(0, totalEarned - withdrawn - pending)

      // الجولة 32 — النسبة الفعالة: مخصصة على الحساب إن عيّنتها الإدارة،
      // وإلا التلقائي (نصف نسبة الإدارة)
      const sharePercent = effectiveSharePercent(user, settings)

      return NextResponse.json({
        user,
        receiver: {
          posts,
          assignments,
          earnings: {
            summary: {
              totalEarned,
              withdrawn,
              pending,
              available,
              sharePercent,
            },
            records: earningRecords,
          },
          withdrawals: recentWithdrawals,
          totals: {
            posts: user._count.posts,
            withdrawals: allWithdrawals.length,
          },
        },
      })
    }

    // ---------- الكادر التمريضي: مستندات + تكليفات + تقييمات ----------
    const [documents, assignments, ratingsAgg, recentRatings] = await Promise.all([
      db.document.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, type: true, title: true, fileName: true, fileUrl: true,
          fileSize: true, mimeType: true, status: true, reviewNote: true, createdAt: true,
        },
      }),
      db.assignment.findMany({
        where: { nurseId: id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true, title: true, facility: true, department: true, status: true,
          value: true, adminFee: true, paymentStatus: true, createdAt: true,
          receiver: { select: { name: true } },
        },
      }),
      db.nurseRating.aggregate({
        where: { nurseId: id },
        _avg: { overall: true, punctuality: true, quality: true, communication: true, discipline: true },
        _count: true,
      }),
      db.nurseRating.findMany({
        where: { nurseId: id },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true, overall: true, comment: true, createdAt: true,
          receiver: { select: { name: true } },
          assignment: { select: { title: true } },
        },
      }),
    ])

    return NextResponse.json({
      user,
      nurse: {
        documents,
        assignments,
        ratings: {
          average: ratingsAgg._avg.overall ? Number(ratingsAgg._avg.overall.toFixed(2)) : null,
          count: ratingsAgg._count,
          dimensions: {
            punctuality: ratingsAgg._avg.punctuality ? Number(ratingsAgg._avg.punctuality.toFixed(2)) : null,
            quality: ratingsAgg._avg.quality ? Number(ratingsAgg._avg.quality.toFixed(2)) : null,
            communication: ratingsAgg._avg.communication ? Number(ratingsAgg._avg.communication.toFixed(2)) : null,
            discipline: ratingsAgg._avg.discipline ? Number(ratingsAgg._avg.discipline.toFixed(2)) : null,
          },
          recent: recentRatings,
        },
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}

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

    // ---------- نِسَب الحصة — للمستلم الإداري ومشرف الأطباء فقط (الجولة 32) ----------
    if (body && typeof body === 'object' && 'commissionPercent' in body) {
      if (target.role !== 'RECEIVER' && target.role !== 'DOCTOR_SUPERVISOR') {
        return jsonError('نسبة الحصة تُدار للمستلمين الإداريين ومشرفي الأطباء فقط', 422)
      }

      const parsed = commissionPercentSchema.safeParse(body)
      if (!parsed.success) {
        return jsonError(parsed.error.issues[0]?.message ?? 'النسبة غير صحيحة', 422)
      }

      const { commissionPercent } = parsed.data
      const updated = await db.user.update({
        where: { id },
        data: { commissionPercent },
        select: { id: true, name: true, commissionPercent: true },
      })

      const settings = await getSettings()
      const auto = effectiveSharePercent({ commissionPercent: null }, settings)

      await notify(id, {
        title: commissionPercent == null ? 'أُعيدت نسبة حصتك للتلقائية' : 'تم تحديث نسبة حصتك من التكليفات',
        body:
          commissionPercent == null
            ? `قامت إدارة المنصة بإعادة نسبة حصتك من قيمة كل تكليف إلى النسبة التلقائية (${auto}٪).`
            : `قامت إدارة المنصة بتحديث نسبة حصتك من قيمة كل تكليف إلى ${commissionPercent}٪.`,
        type: 'GENERIC',
      })

      return NextResponse.json({
        message:
          commissionPercent == null
            ? `أُعيدت نسبة الحصة لـ (${updated.name}) إلى التلقائية: ${auto}٪`
            : `تم تعيين نسبة الحصة لـ (${updated.name}) إلى ${commissionPercent}٪ من قيمة كل تكليف`,
        user: updated,
      })
    }

    // ---------- أذونات رؤية البيانات الكاملة — للمستلم الإداري ومشرف الأطباء (الجولة 32) ----------
    if (body && typeof body === 'object' && 'fullProfileAccess' in body) {
      if (target.role !== 'RECEIVER' && target.role !== 'DOCTOR_SUPERVISOR') {
        return jsonError('هذا الإذن متاح للمستلمين الإداريين ومشرفي الأطباء فقط', 422)
      }

      const parsed = fullProfileAccessSchema.safeParse(body)
      if (!parsed.success) {
        return jsonError(parsed.error.issues[0]?.message ?? 'قيمة الإذن غير صحيحة', 422)
      }

      const { fullProfileAccess } = parsed.data
      const updated = await db.user.update({
        where: { id },
        data: { fullProfileAccess },
        select: { id: true, name: true, fullProfileAccess: true },
      })

      const audienceLabel =
        target.role === 'DOCTOR_SUPERVISOR' ? 'بيانات الأطباء كاملة' : 'بيانات الكوادر كاملة'

      await notify(id, {
        title: fullProfileAccess ? 'مُنحت إذن رؤية البيانات الكاملة' : 'سُحب إذن رؤية البيانات الكاملة',
        body: fullProfileAccess
          ? `فتحت إدارة المنصة لك إذن رؤية ${audienceLabel} مع السيرة الذاتية والمستندات من حسابك.`
          : 'أغلقت إدارة المنصة إذن رؤية البيانات الكاملة من حسابك — عُدت لعرض البيانات المختصرة.',
        type: 'GENERIC',
      })

      return NextResponse.json({
        message: fullProfileAccess
          ? `فُتح إذن رؤية ${audienceLabel} مع السيرة الذاتية للحساب (${updated.name})`
          : `أُغلق إذن رؤية البيانات الكاملة على الحساب (${updated.name})`,
        user: updated,
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
        link:
          target.role === 'NURSE'
            ? '/nurse'
            : target.role === 'DOCTOR'
              ? '/doctor'
              : target.role === 'DOCTOR_SUPERVISOR'
                ? '/supervisor'
                : '/receiver',
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
      // شبكة الكوادر: مراجعات/طلبات الارتباط التي أجراها الحساب
      await tx.nurseAffiliation.updateMany({
        where: { reviewedById: id },
        data: { reviewedById: null },
      })
      await tx.nurseAffiliation.updateMany({
        where: { requestedById: id },
        data: { requestedById: null },
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
