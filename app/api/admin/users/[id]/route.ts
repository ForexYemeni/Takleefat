import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { reviewUserSchema } from '@/lib/validations/user'
import { notify } from '@/lib/notifications'
import { USER_STATUS_LABELS } from '@/lib/utils'

/**
 * PATCH /api/admin/users/[id]
 * مراجعة حساب: اعتماد / رفض / إيقاف — مع إشعار المستخدم
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('ADMIN')
    const { id } = await params

    const parsed = reviewUserSchema.safeParse(await req.json())
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const target = await db.user.findUnique({ where: { id } })
    if (!target) return jsonError('الحساب غير موجود', 404)

    // حماية: لا يمكن للمدير تعديل حسابه أو حساب مدير آخر
    if (target.role === 'ADMIN') {
      return jsonError('لا يمكن تعديل حسابات مديري النظام', 403)
    }

    const { status, rejectNote } = parsed.data

    if (status === 'REJECTED' && !rejectNote) {
      return jsonError('يجب إدخال سبب الرفض', 422)
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
