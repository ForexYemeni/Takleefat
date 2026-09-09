import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError, ApiError } from '@/lib/api-helpers'
import { affiliationCreateSchema } from '@/lib/validations/post'
import { notify } from '@/lib/notifications'
import { AFFILIATION_STATUS_LABELS, resolveReceiverOrg } from '@/lib/network'
import type { Prisma } from '@prisma/client'

/**
 * الارتباط المهني | Professional Affiliation — شبكة الكوادر الصحية المعتمدة
 *
 * GET /api/affiliations
 * - NURSE: ارتباطاته هو (كل جهاته وحالاتها)
 * - RECEIVER: ارتباطات جهته الصحية فقط
 * - ADMIN: جميع الارتباطات (فلاتر: hospitalId / status / nurseId)
 *
 * POST /api/affiliations
 * - NURSE: طلب إضافة جهة عمل — يُسجل PENDING فقط ولا يستطيع تعيين الحالات المحمية أبداً
 * - RECEIVER: تسجيل كادر في جهته (بالحالات المسموحة له)
 * - ADMIN: تسجيل كادر في أي جهة بأي حالة (مع بوابة المستندات للاعتماد)
 *
 * الحالات المحمية (معتمد/تمت مقابلته/غير معتمد) لا يضبطها الكادر بنفسه إطلاقاً.
 */

const NURSE_ALLOWED_STATUSES = ['PENDING'] as const
const RECEIVER_ALLOWED_STATUSES = ['WORKING', 'FORMER', 'INTERVIEWED', 'ENDORSED', 'EXTERNAL', 'UNENDORSED', 'SUSPENDED'] as const
/** الاعتماد (مثل اعتماد الحساب) لا يتم أبداً قبل رفع مستندات الكادر */
const DOCUMENT_GATED_STATUSES = ['ENDORSED', 'WORKING'] as const

export async function GET(req: NextRequest) {
  try {
    const session = await requireRole('NURSE', 'RECEIVER', 'ADMIN')
    const hospitalId = req.nextUrl.searchParams.get('hospitalId')
    const status = req.nextUrl.searchParams.get('status')
    const nurseId = req.nextUrl.searchParams.get('nurseId')

    let where: Prisma.NurseAffiliationWhereInput = {
      ...(hospitalId ? { hospitalId } : {}),
      ...(status && status in AFFILIATION_STATUS_LABELS
        ? { status: status as keyof typeof AFFILIATION_STATUS_LABELS as never }
        : {}),
      ...(nurseId ? { nurseId } : {}),
    }

    if (session.user.role === 'NURSE') {
      where = { ...where, nurseId: session.user.id }
    } else if (session.user.role === 'RECEIVER') {
      const org = await resolveReceiverOrg(session.user.id)
      if (!org) return NextResponse.json({ affiliations: [], org: null })
      where = { ...where, hospitalId: org.id }
    }

    const [affiliations, org] = await Promise.all([
      db.nurseAffiliation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          hospital: { select: { id: true, name: true, type: true, city: true, status: true } },
          nurse: {
            select: {
              id: true, name: true, phone: true, gender: true, specialty: true,
              qualification: true, yearsOfExperience: true, status: true,
            },
          },
        },
      }),
      session.user.role === 'RECEIVER' ? resolveReceiverOrg(session.user.id) : Promise.resolve(null),
    ])

    return NextResponse.json({ affiliations, org })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole('NURSE', 'RECEIVER', 'ADMIN')
    const parsed = affiliationCreateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const { hospitalId, note } = parsed.data
    // الكادر يطلب لنفسه — المستلم/الإدارة يحددان الكادر
    const targetNurseId = session.user.role === 'NURSE' ? session.user.id : parsed.data.nurseId
    if (!targetNurseId) return jsonError('معرّف الكادر مطلوب', 422)
    const requestedStatus = parsed.data.status ?? (session.user.role === 'NURSE' ? 'PENDING' : 'WORKING')

    const [nurse, hospital] = await Promise.all([
      db.user.findUnique({ where: { id: targetNurseId }, select: { id: true, name: true, role: true, status: true } }),
      db.hospital.findUnique({ where: { id: hospitalId }, select: { id: true, name: true, status: true, isActive: true } }),
    ])
    if (!nurse || nurse.role !== 'NURSE') return jsonError('الكادر التمريضي غير موجود', 404)
    if (!hospital) return jsonError('الجهة الصحية غير موجودة', 404)

    // التكرار ممنوع — ارتباط واحد لكل (كادر × جهة)
    const existing = await db.nurseAffiliation.findUnique({
      where: { nurseId_hospitalId: { nurseId: targetNurseId, hospitalId } },
    })
    if (existing) {
      return jsonError(
        `الارتباط موجود مسبقاً (${AFFILIATION_STATUS_LABELS[existing.status]}) — عدّل الحالة بدلاً من التكرار`,
        409
      )
    }

    let finalStatus: string = requestedStatus

    if (session.user.role === 'NURSE') {
      // الكادر يطلب فقط — الحالات المحمية محرّمة عليه نهائياً
      if (!(NURSE_ALLOWED_STATUSES as readonly string[]).includes(requestedStatus)) {
        throw new ApiError(
          'لا يمكنك تعيين حالة الاعتماد أو المقابلة بنفسك — طلبك يُسجل «قيد المراجعة» وتُعتمده الجهة المختصة',
          403
        )
      }
      finalStatus = 'PENDING'
    } else if (session.user.role === 'RECEIVER') {
      // المستلم الإداري المخول: جهته الصحية فقط + الحالات المسموحة له
      const org = await resolveReceiverOrg(session.user.id)
      if (!org || org.id !== hospitalId) {
        throw new ApiError('يمكنك إدارة الكوادر المرتبطين بجهتك الصحية فقط', 403)
      }
      if (!(RECEIVER_ALLOWED_STATUSES as readonly string[]).includes(requestedStatus)) {
        throw new ApiError('حالة الارتباط غير متاحة للحساب المستلم — راجع الإدارة', 403)
      }
    }

    // بوابة المستندات: الاعتماد/العمل الحالي لا يتم قبل رفع مستندات الكادر — مثل أي كادر آخر
    if ((DOCUMENT_GATED_STATUSES as readonly string[]).includes(finalStatus)) {
      const documentsCount = await db.document.count({ where: { userId: targetNurseId } })
      if (documentsCount === 0) {
        return jsonError(
          'لا يمكن الاعتماد قبل رفع مستندات الكادر (الهوية وصورة المزاولة) — اطلب منه رفعها أولاً',
          422
        )
      }
    }

    const affiliation = await db.nurseAffiliation.create({
      data: {
        nurseId: targetNurseId,
        hospitalId,
        status: finalStatus as never,
        note: note?.trim() || null,
        requestedById: session.user.id,
        reviewedById: session.user.role === 'NURSE' ? null : session.user.id,
        reviewedAt: session.user.role === 'NURSE' ? null : new Date(),
      },
      include: { hospital: { select: { name: true } } },
    })

    // الإشعارات
    if (session.user.role === 'NURSE') {
      const admins = await db.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
      await Promise.all(
        admins.map((a) =>
          notify(a.id, {
            title: 'طلب ارتباط مهني جديد',
            body: `${nurse.name} يطلب إضافة جهة (${hospital.name}) إلى سجله المهني — راجع الطلب واعتمده`,
            type: 'AFFILIATION_UPDATED',
            link: '/admin/nurses',
          })
        )
      )
    } else {
      await notify(targetNurseId, {
        title: 'تحديث سجلك المهني',
        body: `تم تسجيل ارتباطك بجهة (${hospital.name}) بحالة: ${AFFILIATION_STATUS_LABELS[finalStatus]}`,
        type: 'AFFILIATION_UPDATED',
        link: '/nurse/profile',
      })
    }

    return NextResponse.json(
      { message: `تم تسجيل الارتباط (${hospital.name}) بحالة: ${AFFILIATION_STATUS_LABELS[finalStatus]}`, affiliation },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
