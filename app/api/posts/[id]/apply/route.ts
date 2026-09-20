import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError, ApiError } from '@/lib/api-helpers'
import { notify, notifyAdmins } from '@/lib/notifications'
import { getSettings } from '@/lib/settings'
import { canNurseSeePost, audienceRole, findTimeConflict } from '@/lib/network'
import { formatDate, formatTime12 } from '@/lib/utils'

/**
 * POST /api/posts/[id]/apply — تقديم الكادر الصحي/الطبيب على تكليف مُعلن
 * body: { coverNote?: string }
 * الشروط: حساب معتمد + التكليف مفتوح + جمهور التكليف يطابق دور المقدّم + عدم التقديم مسبقاً.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole('NURSE', 'DOCTOR')

    if (session.user.status !== 'APPROVED') {
      throw new ApiError('حسابك قيد المراجعة — يمكنك التقديم بعد اعتماد حسابك من الإدارة', 403)
    }

    // لا تقديم إطلاقاً قبل رفع المستندات (الهوية/المزاولة/الخبرة) — شرط أساسي لاعتماد الحساب والتقديم
    const documentsCount = await db.document.count({ where: { userId: session.user.id } })
    if (documentsCount === 0) {
      throw new ApiError(
        'لا يمكنك التقديم على التكليفات قبل رفع مستنداتك (الهوية وصورة المزاولة) — ارفعها من صفحة «مستنداتي» ثم أعد المحاولة',
        403
      )
    }

    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const coverNote = typeof body?.coverNote === 'string' ? body.coverNote.slice(0, 1000) : null

    const post = await db.post.findUnique({ where: { id } })
    if (!post) return jsonError('التكليف غير موجود', 404)
    if (post.status !== 'OPEN') {
      return jsonError('هذا التكليف غير متاح للتقديم حالياً', 409)
    }

    // حماية مزدوجة: مطابقة الجمهور (تمريض/أطباء) + فلتر الجنس + خصوصية التوزيع
    // — حتى لو وصل عبر رابط مباشر أو API (منظومة الأطباء: لا تقديم متبادل بين الجماهير)
    // الجولة 60 — الوضع النشط: التقديم بوضع اللوحة المفتوحة (لوحة الكادر = وضع الكادر)
    const operatingRole = session.user.activeRole ?? session.user.role
    if (audienceRole(post.audience) !== operatingRole) {
      return jsonError(
        operatingRole === 'DOCTOR'
          ? 'هذا التكليف مخصص للكادر الصحيي — لا يمكنك التقديم عليه بحساب الطبيب'
          : 'هذا التكليف مخصص للأطباء — لا يمكنك التقديم عليه بحسابك الحالي',
        403
      )
    }
    const me = await db.user.findUnique({ where: { id: session.user.id }, select: { gender: true } })
    const allowed = await canNurseSeePost(post, {
      nurseId: session.user.id,
      nurseGender: me?.gender ?? null,
      role: operatingRole === 'DOCTOR' ? 'DOCTOR' : 'NURSE',
    })
    if (!allowed) {
      return jsonError('هذا التكليف غير متاح للتقديم من حسابك (شروط الجنس أو جمهور التوزيع)', 403)
    }

    const existing = await db.application.findUnique({
      where: { postId_nurseId: { postId: id, nurseId: session.user.id } },
    })
    if (existing) {
      return jsonError('لقد قدّمت على هذا التكليف مسبقاً — بانتظار مراجعة الجهة المُعلنة', 409)
    }

    // منع التقديم على تكليف جديد قبل تأكيد الإدارة دفع رسوم/نسبة الإدارة لتكليف سابق
    const unpaid = await db.assignment.findFirst({
      where: {
        nurseId: session.user.id,
        paymentStatus: 'UNPAID',
        status: { not: 'CANCELLED' },
      },
      select: { id: true, title: true },
      orderBy: { createdAt: 'desc' },
    })
    if (unpaid) {
      return jsonError(
        `لا يمكنك التقديم على تكليف جديد قبل أن تؤكد إدارة المنصة دفع رسوم أو نسبة الإدارة لتكليفك (${unpaid.title}) — ارفع إثبات الدفع وتابع مع الإدارة`,
        403
      )
    }

    // ---------- الجولة 49: منع التقديم على تكليف يتقاطع وقته مع تكليف يعمل به الكادر ----------
    // البلاغ الحرفي: «لا يتمكن الكادر الصحي او الطبيب من التقديم في تكليف جديد
    // اذا كان بنفس التاريخ والوقت الذي هو يعمل فية» — التقديم يُرفض برسالة احترافية
    // تُسمّي التكليف المتعارض ونافذته الزمنية حتى يعيد الكادر ترتيب جدوله
    const conflict = await findTimeConflict(post, session.user.id)
    if (conflict) {
      return jsonError(
        `لا يمكنك التقديم على هذا التكليف — وقته (${formatDate(post.startDate)} من ${formatTime12(post.startDate)} إلى ${formatTime12(post.endTime)}) يتقاطع مع تكليفك الحالي «${conflict.title}» (${formatTime12(conflict.startDate)} — ${formatTime12(conflict.endDate ?? post.endTime)}) — أنهِ التكليف الحالي أولاً أو اختر تكليفاً بوقت آخر`,
        409
      )
    }

    const settings = await getSettings()

    const application = await db.application.create({
      data: {
        postId: id,
        nurseId: session.user.id,
        coverNote,
        status: 'PENDING',
      },
      select: { id: true, status: true, createdAt: true },
    })

    await notify(post.receiverId, {
      title: 'تقديم جديد على تكليفك',
      body: `${session.user.name} قدّم على التكليف (${post.title}) — راجع السيرة الذاتية واعتمد أو ارفض`,
      type: 'APPLICATION_SUBMITTED',
      link: operatingRole === 'DOCTOR' ? '/supervisor/assignments' : '/receiver/assignments',
    })

    // الجولة الخامسة عشرة: الإدارة ترى كل التقديمات الجديدة أيضاً
    await notifyAdmins({
      title: 'تقديم جديد على تكليف',
      body: `${session.user.name} قدّم على التكليف (${post.title}) لدى ${post.facility}`,
      type: 'APPLICATION_SUBMITTED',
      link: '/admin/assignments',
    })

    return NextResponse.json(
      {
        message: `تم إرسال تقديمك بنجاح — رسوم التقديم ${settings.applicationFee} ريال تُدفع بعد اعتماد تقديمك`,
        application,
      },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
