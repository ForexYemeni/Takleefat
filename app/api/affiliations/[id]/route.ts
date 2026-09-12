import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError, ApiError } from '@/lib/api-helpers'
import { affiliationUpdateSchema } from '@/lib/validations/post'
import { notify } from '@/lib/notifications'
import { AFFILIATION_STATUS_LABELS, resolveReceiverOrg } from '@/lib/network'

/**
 * PATCH /api/affiliations/[id] — تغيير حالة الارتباط المهني
 * - ADMIN: أي حالة لأي ارتباط (بوابة المستندات للاعتماد)
 * - RECEIVER: ارتباطات جهته الصحية فقط — كادر تمريضي حصراً (الجولة 39)
 * - DOCTOR_SUPERVISOR: ارتباطات جهته الصحية فقط — أطباء حصراً (الجولة 39)
 * - NURSE: ممنوع — لا يعدل حالة ارتباطه بنفسه
 * DELETE /api/affiliations/[id] — إزالة ارتباط (ADMIN / RECEIVER / DOCTOR_SUPERVISOR لجهته)
 * الإشعار يصل للكادر عند كل تغيير.
 *
 * الجولة 39 — فصل مستويي الاعتماد:
 *  - اعتماد الجهة (إضافة لمجتمع كوادر الجهة): يمنحه المستلم الإداري للكادر التمريضي
 *    ومشرف الأطباء للأطباء في جهته حصراً — بلا شرط مستندات.
 *  - الاعتماد المهني (كطبيب/ككادر طبي): من حساب الإدارة حصراً بعد رفع المستندات
 *    والموافقة عليها — لا يمنحه اعتماد الجهة إطلاقاً.
 */

const SUPPORTER_ALLOWED_STATUSES = ['WORKING', 'FORMER', 'INTERVIEWED', 'ENDORSED', 'EXTERNAL', 'UNENDORSED', 'SUSPENDED'] as const
const DOCUMENT_GATED_STATUSES = ['ENDORSED', 'WORKING'] as const

async function loadWithAccess(id: string, role: string, userId: string) {
  const affiliation = await db.nurseAffiliation.findUnique({
    where: { id },
    include: {
      hospital: { select: { id: true, name: true } },
      nurse: { select: { id: true, name: true, role: true } },
    },
  })
  if (!affiliation) return { error: jsonError('الارتباط غير موجود', 404) }

  // الجولة 39: المستلم والمشرف محصوران بجهتهما الصحية — كان المشرف يتجاوز الفحص (ثغرة)
  if (role === 'RECEIVER' || role === 'DOCTOR_SUPERVISOR') {
    const org = await resolveReceiverOrg(userId)
    if (!org || org.id !== affiliation.hospitalId) {
      return { error: jsonError('يمكنك إدارة كوادر جهتك الصحية فقط', 403) }
    }
    // مطابقة الدور مع الهدف: المستلم → كادر تمريضي | مشرف الأطباء → طبيب
    const expectedRole = role === 'DOCTOR_SUPERVISOR' ? 'DOCTOR' : 'NURSE'
    if (affiliation.nurse.role !== expectedRole) {
      return {
        error: jsonError(
          role === 'DOCTOR_SUPERVISOR'
            ? 'اعتماد الأطباء من اختصاص مشرف الأطباء — والكادر التمريضي من اختصاص المستلم الإداري'
            : 'اعتماد الكادر التمريضي من اختصاص المستلم الإداري — والأطباء من اختصاص مشرف الأطباء',
          403
        ),
      }
    }
  }
  return { affiliation }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('ADMIN', 'RECEIVER', 'DOCTOR_SUPERVISOR')
    const { id } = await params

    const parsed = affiliationUpdateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }
    const { status, note } = parsed.data

    const { affiliation, error } = await loadWithAccess(id, session.user.role, session.user.id)
    if (error || !affiliation) return error!

    if (session.user.role === 'RECEIVER' || session.user.role === 'DOCTOR_SUPERVISOR') {
      if (!(SUPPORTER_ALLOWED_STATUSES as readonly string[]).includes(status)) {
        throw new ApiError('حالة الارتباط غير متاحة لحسابك — راجع الإدارة', 403)
      }
    }

    // بوابة المستندات للاعتماد — من الإدارة حصراً (الجولة 39: اعتماد الجهة من
    // المستلم/المشرف بلا بوابة مستندات، والاعتماد المهني يبقى للإدارة بعد المستندات)
    if (session.user.role === 'ADMIN' && (DOCUMENT_GATED_STATUSES as readonly string[]).includes(status)) {
      const documentsCount = await db.document.count({ where: { userId: affiliation.nurseId } })
      if (documentsCount === 0) {
        return jsonError('لا يمكن الاعتماد قبل رفع مستندات الكادر — اطلب منه رفعها أولاً', 422)
      }
    }

    const updated = await db.nurseAffiliation.update({
      where: { id },
      data: {
        status,
        ...(note !== undefined ? { note: note?.trim() || null } : {}),
        reviewedById: session.user.id,
        reviewedAt: new Date(),
      },
    })

    await notify(affiliation.nurseId, {
      title: 'تحديث حالة الارتباط المهني',
      body: `حالة ارتباطك بجهة (${affiliation.hospital.name}) أصبحت: ${AFFILIATION_STATUS_LABELS[status]}`,
      type: 'AFFILIATION_UPDATED',
      link: '/nurse/profile',
    })

    return NextResponse.json({
      message: `تم تحديث حالة (${affiliation.nurse.name}) إلى: ${AFFILIATION_STATUS_LABELS[status]}`,
      affiliation: updated,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('ADMIN', 'RECEIVER', 'DOCTOR_SUPERVISOR')
    const { id } = await params

    const { affiliation, error } = await loadWithAccess(id, session.user.role, session.user.id)
    if (error || !affiliation) return error!

    await db.nurseAffiliation.delete({ where: { id } })

    await notify(affiliation.nurseId, {
      title: 'إزالة ارتباط مهني',
      body: `تم إزالة ارتباطك بجهة (${affiliation.hospital.name}) من السجل المهني`,
      type: 'AFFILIATION_UPDATED',
      link: '/nurse/profile',
    })

    return NextResponse.json({ message: `تم إزالة الارتباط مع (${affiliation.hospital.name})` })
  } catch (error) {
    return handleApiError(error)
  }
}
