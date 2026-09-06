import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError, ApiError } from '@/lib/api-helpers'
import { createPostSchema } from '@/lib/validations/post'
import { getSettings, calcAdminFee, adminFeeLabel } from '@/lib/settings'
import { notify } from '@/lib/notifications'
import { formatCurrency, POST_GENDER_LABELS } from '@/lib/utils'
import type { Prisma } from '@prisma/client'

/**
 * GET /api/posts — قائمة التكليفات المُعلنة (حسب الدور)
 * - NURSE: التكليفات المفتوحة + حالة تقديمه الخاص + بيانات الرسوم
 * - RECEIVER: تكليفاته المُعلنة مع عدد التقديمات + الرقم التالي
 * - ADMIN: جميع التكليفات المُعلنة
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireRole('NURSE', 'RECEIVER', 'ADMIN')
    const status = req.nextUrl.searchParams.get('status')

    const statusWhere: Prisma.PostWhereInput = {}
    if (status && ['OPEN', 'ASSIGNED', 'COMPLETED', 'CANCELLED'].includes(status)) {
      statusWhere.status = status as 'OPEN' | 'ASSIGNED' | 'COMPLETED' | 'CANCELLED'
    }

    if (session.user.role === 'NURSE') {
      const [posts, documentsCount] = await Promise.all([
        db.post.findMany({
          where: { ...statusWhere, status: status ? statusWhere.status : 'OPEN' },
          orderBy: { createdAt: 'desc' },
          include: {
            receiver: { select: { id: true, name: true } },
            _count: { select: { applications: true } },
            applications: {
              where: { nurseId: session.user.id },
              select: { id: true, status: true, reviewNote: true, createdAt: true },
            },
          },
        }),
        // عدد مستندات الكادر — يُستخدم لقيد التقديم حتى رفع المستندات
        db.document.count({ where: { userId: session.user.id } }),
      ])

      const settings = await getSettings()
      return NextResponse.json({ posts, settings, documentsCount })
    }

    if (session.user.role === 'RECEIVER') {
      const posts = await db.post.findMany({
        where: { ...statusWhere, receiverId: session.user.id },
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { applications: { where: { status: 'PENDING' } } } },
          assignments: { select: { id: true, nurse: { select: { id: true, name: true } } } },
        },
      })
      const last = await db.post.aggregate({ _max: { number: true } })
      return NextResponse.json({ posts, nextNumber: (last._max.number ?? 0) + 1 })
    }

    // ADMIN
    const posts = await db.post.findMany({
      where: statusWhere,
      orderBy: { createdAt: 'desc' },
      include: {
        receiver: { select: { id: true, name: true } },
        _count: { select: { applications: true } },
      },
    })
    return NextResponse.json({ posts })
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * POST /api/posts — إنشاء تكليف مُعلن جديد (المستلم الإداري)
 * - العنوان يُولَّد تلقائياً «التكليف رقم N» مع ترقيم تسلسلي احترافي
 * - الجهة الصحية تُختار من المستشفيات المضافة من الإدارة والموقع يُعبأ تلقائياً منها
 * - القسم من قوائم الإدارة + الجنس المطلوب + عدد الساعات — بدون تاريخ انتهاء
 */
export async function POST(req: NextRequest) {
  try {
    // الإدارة والمستلم الإداري كلاهما يمكنهما إنشاء تكليف مُعلن
    const session = await requireRole('RECEIVER', 'ADMIN')

    if (session.user.status !== 'APPROVED') {
      throw new ApiError('حسابك قيد المراجعة — لا يمكنك إنشاء تكليف حتى اعتماده من الإدارة', 403)
    }

    const parsed = createPostSchema.safeParse(await req.json())
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const { title, description, hospitalId, department, startDate, nursesNeeded, hours, gender, value } =
      parsed.data

    const start = new Date(startDate)
    if (Number.isNaN(start.getTime())) return jsonError('تاريخ البدء غير صحيح', 422)

    // الجهة الصحية من قوائم الإدارة — الموقع الفعلي يُشتق منها تلقائياً
    const hospital = await db.hospital.findUnique({ where: { id: hospitalId } })
    if (!hospital || !hospital.isActive) {
      return jsonError('الجهة الصحية غير موجودة — اختر من القائمة المضافة من الإدارة', 422)
    }

    // ترقيم تسلسلي احترافي: التكليف رقم 1، 2، 3...
    const last = await db.post.aggregate({ _max: { number: true } })
    const number = (last._max.number ?? 0) + 1
    const finalTitle = title?.trim() || `التكليف رقم ${number}`

    const post = await db.post.create({
      data: {
        number,
        title: finalTitle,
        description: description || null,
        facility: hospital.name,
        department: department || null,
        location: hospital.location || null,
        startDate: start,
        hours: hours ? Number(hours) : null,
        gender,
        nursesNeeded,
        value,
        status: 'OPEN',
        receiverId: session.user.id,
      },
      select: { id: true, title: true, number: true, status: true },
    })

    // إشعار جميع الكادر المعتمد بوجود تكليف جديد
    const settings = await getSettings()
    const genderNote = gender === 'ANY' ? '' : ` — ${POST_GENDER_LABELS[gender]}`
    const nurses = await db.user.findMany({
      where: { role: 'NURSE', status: 'APPROVED' },
      select: { id: true },
    })
    await Promise.all(
      nurses.map((nurse) =>
        notify(nurse.id, {
          title: 'تكليف جديد متاح للتقديم',
          body: `${finalTitle} — ${hospital.name}${department ? ` (${department})` : ''}${genderNote} — القيمة ${formatCurrency(value)} — سارِ بالتقديم قبل اكتمال العدد`,
          type: 'POST_CREATED',
          link: '/nurse/assignments',
        })
      )
    )

    return NextResponse.json(
      {
        message: `تم نشر التكليف بنجاح (${finalTitle}) — حصة الإدارة: ${adminFeeLabel(settings)}`,
        post,
      },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
