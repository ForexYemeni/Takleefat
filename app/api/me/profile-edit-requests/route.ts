import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError, ApiError } from '@/lib/api-helpers'
import { profileEditRequestSchema } from '@/lib/validations/user'
import { isValidQualification, qualificationErrorMessage } from '@/lib/qualifications'
import { notify, notifyAdmins } from '@/lib/notifications'
import { profilePhotoUrl } from '@/lib/document-access'

/**
 * الجولة 74 — طلبات تعديل الملف المهني (إضافي بحت كلياً)
 * =========================================================
 * GET  /api/me/profile-edit-requests — طلبات صاحب الحساب (آخر 15) مع حالة كل طلب
 * POST /api/me/profile-edit-requests — إرسال طلب تعديل جديد (التخصص/المؤهل/سنوات الخبرة)
 *      · حقل واحد على الأقل بقيمة جديدة مختلفة عن الحالية
 *      · المؤهل يُتحقق منه من كتالوج الإدارة حسب جمهور صاحب الطلب (كادر/طبيب)
 *      · لا يُقبل طلب جديد إذا كان لديه طلب قيد المراجعة (نمنع التكدس)
 *      · عند الإرسال: إشعار داخلي + بريد + دفع للإدارة (PROFILE_EDIT_REQUESTED)
 */
export async function GET() {
  try {
    const session = await requireRole('NURSE', 'DOCTOR')

    const [requests, user] = await Promise.all([
      db.profileEditRequest.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'desc' },
        take: 15,
        select: {
          id: true,
          status: true,
          requestedSpecialty: true,
          requestedQualification: true,
          requestedYearsOfExperience: true,
          appliedSpecialty: true,
          appliedQualification: true,
          appliedYearsOfExperience: true,
          note: true,
          reviewNote: true,
          reviewedAt: true,
          createdAt: true,
          reviewer: { select: { name: true } },
        },
      }),
      db.user.findUnique({
        where: { id: session.user.id },
        select: {
          specialty: true,
          qualification: true,
          yearsOfExperience: true,
          profilePhotoBlobId: true,
        },
      }),
    ])

    const pending = requests.find((r) => r.status === 'PENDING') ?? null

    return NextResponse.json({
      requests,
      pendingRequest: pending,
      current: {
        specialty: user?.specialty ?? null,
        qualification: user?.qualification ?? null,
        yearsOfExperience: user?.yearsOfExperience ?? null,
        photoUrl: profilePhotoUrl(user?.profilePhotoBlobId ?? null),
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole('NURSE', 'DOCTOR')
    const operating = session.user.activeRole ?? session.user.role
    if (operating !== 'NURSE' && operating !== 'DOCTOR') {
      throw new ApiError('طلبات تعديل الملف المهني متاحة للكادر الصحي والأطباء حصراً', 403)
    }

    const body = await req.json().catch(() => ({}))
    const parsed = profileEditRequestSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: {
        name: true,
        specialty: true,
        qualification: true,
        yearsOfExperience: true,
        status: true,
      },
    })
    if (!user) throw new ApiError('الحساب غير موجود', 404)
    if (user.status === 'PENDING') {
      throw new ApiError('حسابك قيد المراجعة من الإدارة — يمكن طلب التعديل بعد الاعتماد', 403)
    }

    const pendingCount = await db.profileEditRequest.count({
      where: { userId: session.user.id, status: 'PENDING' },
    })
    if (pendingCount > 0) {
      throw new ApiError('لديك طلب قيد المراجعة حالياً — انتظر حسمه قبل إرسال طلب جديد', 409)
    }

    const { specialty, qualification, yearsOfExperience, note } = parsed.data

    // يجب أن تختلف القيمة الجديدة عن الحالية — التطابق يُرفض بوضوح (حماية من الطلبات الفارغة)
    if (specialty !== undefined && specialty === user.specialty) {
      throw new ApiError('التخصص المدخل مطابق لقيمتك الحالية — أدخل قيمة جديدة', 422)
    }
    if (qualification !== undefined && qualification === user.qualification) {
      throw new ApiError('المؤهل المدخل مطابق لقيمتك الحالية — اختر مؤهلاً جديداً من القائمة', 422)
    }
    if (yearsOfExperience !== undefined && yearsOfExperience === user.yearsOfExperience) {
      throw new ApiError('سنوات الخبرة المدخلة مطابقة لقيمتك الحالية — أدخل قيمة جديدة', 422)
    }

    // المؤهل الجديد يجب أن يكون من كتالوج الإدارة حسب جمهور صاحب الطلب
    if (qualification !== undefined) {
      const valid = await isValidQualification(qualification, operating === 'DOCTOR' ? 'DOCTOR' : 'NURSE')
      if (!valid) {
        throw new ApiError(qualificationErrorMessage(operating === 'DOCTOR' ? 'DOCTOR' : 'NURSE'), 422)
      }
    }

    const created = await db.profileEditRequest.create({
      data: {
        userId: session.user.id,
        requestedSpecialty: specialty ?? null,
        requestedQualification: qualification ?? null,
        requestedYearsOfExperience: yearsOfExperience ?? null,
        note: note ?? null,
      },
      select: { id: true, createdAt: true },
    })

    const fieldsSummary = [
      specialty !== undefined && `التخصص: ${specialty}`,
      qualification !== undefined && `المؤهل: ${qualification}`,
      yearsOfExperience !== undefined && `سنوات الخبرة: ${yearsOfExperience}`,
    ]
      .filter(Boolean)
      .join(' — ')

    // إشعار صاحب الطلب + الإدارة (داخلية + بريد + دفع) — لا تُفشل العملية الأساسية أبداً
    try {
      await notify(session.user.id, {
        title: '📨 تم استلام طلب تعديل ملفك المهني',
        body: `${fieldsSummary} — سيُراجع من الإدارة أو الموارد البشرية وتصلك النتيجة هنا.`,
        type: 'PROFILE_EDIT_REQUESTED',
        link: operating === 'DOCTOR' ? '/doctor/profile' : '/nurse/profile',
      })
      await notifyAdmins({
        title: '✏️ طلب تعديل ملف مهني جديد',
        body: `${user.name} يطلب: ${fieldsSummary}${note ? ` — ملاحظته: ${note}` : ''}`,
        type: 'PROFILE_EDIT_REQUESTED',
        link: '/admin/profile-edits',
      })
    } catch (e) {
      console.error('profile-edit notify failed:', e)
    }

    return NextResponse.json({
      message: 'تم إرسال طلب التعديل بنجاح — سيُراجع من الإدارة أو الموارد البشرية',
      request: created,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
