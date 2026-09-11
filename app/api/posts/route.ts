import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError, ApiError } from '@/lib/api-helpers'
import { createPostSchema } from '@/lib/validations/post'
import { getSettings, calcAdminFee, adminFeeLabel } from '@/lib/settings'
import { notify } from '@/lib/notifications'
import { formatCurrency, POST_GENDER_LABELS } from '@/lib/utils'
import {
  canNurseSeePost,
  escalateDueProgressivePosts,
  genderMatches,
  getDepartmentAudience,
  progressiveAudienceIds,
  DISTRIBUTION_LABELS,
} from '@/lib/network'
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
      // ترقية النشر التدريجي المستحق + جلب التكليفات المرشحة ثم فلترة الخصوصية والجنس
      await escalateDueProgressivePosts()

      const me = await db.user.findUnique({
        where: { id: session.user.id },
        select: { gender: true },
      })

      const [candidates, documentsCount] = await Promise.all([
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

      // فلترة الجنس + طريقة التوزيع على مستوى المنطق وقاعدة البيانات — لا واجهة فقط
      const posts: typeof candidates = []
      for (const post of candidates) {
        if (await canNurseSeePost(post, { nurseId: session.user.id, nurseGender: me?.gender ?? null })) {
          posts.push(post)
        }
      }

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
          invitations: { select: { id: true, status: true } },
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
        hospital: { select: { name: true } },
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
    const distribution = parsed.data.distribution ?? 'ALL_MATCHING'
    const invitedNurseIds = parsed.data.invitedNurseIds ?? []

    // الاستدعاء المحدد يتطلب قائمة كوادر
    if (distribution === 'INVITE_SELECTED' && invitedNurseIds.length === 0) {
      return jsonError('اختر كادراً واحداً على الأقل لاستدعائه', 422)
    }

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
        hospitalId: hospital.id,
        distribution,
        progressiveStage: 0,
        progressiveNextAt:
          distribution === 'PROGRESSIVE'
            ? new Date(Date.now() + (parsed.data.progressiveStageHours ?? 24) * 60 * 60 * 1000)
            : null,
      },
      select: { id: true, title: true, number: true, status: true, distribution: true, gender: true, receiverId: true, hospitalId: true, progressiveStage: true },
    })

    // ---------- جمهور الإشعار حسب طريقة التوزيع + فلتر الجنس (مستوى قاعدة البيانات) ----------
    // مع تحديد القسم: توجيه احترافي — التكليف يصل حصراً لكوادر القسم المطلوب
    // (من أقسام عملهم المصرّح بها) مع إشعار فاخر مخصص لهم
    const settings = await getSettings()
    const genderNote = gender === 'ANY' ? '' : ` — ${POST_GENDER_LABELS[gender]}`
    const postBody = `${finalTitle} — ${hospital.name}${department ? ` (${department})` : ''}${genderNote} — القيمة ${formatCurrency(value)}`

    if (distribution === 'INVITE_SELECTED') {
      // استدعاء مباشر: استدعاءات + إشعارات خاصة (للمطابقين للجنس حصراً)
      const targets = await db.user.findMany({
        where: { id: { in: invitedNurseIds }, role: 'NURSE', status: 'APPROVED' },
        select: { id: true, name: true, gender: true },
      })
      const matched = targets.filter((t) => genderMatches(gender, t.gender))
      const mismatchedNames = targets.filter((t) => !genderMatches(gender, t.gender)).map((t) => t.name)
      if (matched.length === 0) {
        await db.post.delete({ where: { id: post.id } })
        return jsonError(
          mismatchedNames.length > 0
            ? `فلترة الجنس تمنع استدعاء: ${mismatchedNames.join('، ')} — أعد إنشاء التكليف بكوادر مطابقة`
            : 'لا يوجد كادر مطابق للاستدعاء',
          422
        )
      }
      await db.nurseInvitation.createMany({
        data: matched.map((t) => ({
          postId: post.id,
          nurseId: t.id,
          receiverId: session.user.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        })),
      })
      await Promise.all(
        matched.map((t) =>
          notify(t.id, {
            title: 'استدعاء مباشر لتكليف',
            body: `${postBody} — راجع التفاصيل وأجب بالقبول أو الرفض`,
            type: 'INVITATION_RECEIVED',
            link: '/nurse/invitations',
          })
        )
      )
      return NextResponse.json(
        {
          message: `تم إنشاء التكليف وإرسال الاستدعاء إلى ${matched.length} كادر (${DISTRIBUTION_LABELS[distribution]}) — حصة الإدارة: ${adminFeeLabel(settings)}`,
          post,
        },
        { status: 201 }
      )
    }

    if (distribution === 'PROGRESSIVE') {
      const audience = (await progressiveAudienceIds(post)).filter(Boolean)
      await Promise.all(
        audience.map((nurseId) =>
          notify(nurseId, {
            title: 'تكليف متاح — أنت ضمن الأولوية الأولى',
            body: `${postBody} — سارِ بالتقديم قبل توسيع النشر لغيرك`,
            type: 'POST_CREATED',
            link: '/nurse/assignments',
          })
        )
      )
      return NextResponse.json(
        {
          message: `تم إنشاء التكليف بالنشر التدريجي (${DISTRIBUTION_LABELS.PROGRESSIVE}) — المرحلة 1: المفضلون — حصة الإدارة: ${adminFeeLabel(settings)}`,
          post,
        },
        { status: 201 }
      )
    }

    // التوزيع الواسع (ALL_MATCHING/AUTO_MATCH) مع قسم محدد: توجيه احترافي — التكليف
    // يصل حصراً لكوادر القسم المطلوب (من أقسام عملهم المصرّح بها) بإشعار فاخر مخصص
    // أما طرق التوزيع الخاصة (المفضلة/الجهة/المعتمدون/المتقابلون) فسلوكها القائم لا يتغير
    if (department && (distribution === 'ALL_MATCHING' || distribution === 'AUTO_MATCH')) {
      const { departmentNurseIds, extendedNurseIds } = await getDepartmentAudience({
        department,
        gender,
        hospitalId: hospital.id,
      })
      await Promise.all([
        ...departmentNurseIds.map((nurseId) =>
          notify(nurseId, {
            title: `تكليف جديد في قسم ${department}`,
            body: `${postBody} — بما أنك من كادر قسم ${department} هذه أولوية لك — سارِ بالتقديم قبل اكتمال العدد`,
            type: 'POST_CREATED',
            link: '/nurse/assignments',
          })
        ),
        ...extendedNurseIds.map((nurseId) =>
          notify(nurseId, {
            title: 'تكليف جديد متاح للتقديم',
            body: `${postBody} — سارِ بالتقديم قبل اكتمال العدد`,
            type: 'POST_CREATED',
            link: '/nurse/assignments',
          })
        ),
      ])
      const targetedNote =
        departmentNurseIds.length > 0
          ? ` — توجيه مباشر لكوادر قسم ${department} (${departmentNurseIds.length} كادر)`
          : ''
      return NextResponse.json(
        {
          message: `تم نشر التكليف بنجاح (${finalTitle}) — ${DISTRIBUTION_LABELS[distribution]}${targetedNote} — حصة الإدارة: ${adminFeeLabel(settings)}`,
          post,
        },
        { status: 201 }
      )
    }

    const genderWhere = gender === 'ANY' ? {} : { gender }
    const audienceNurses = await db.user.findMany({
      where: { role: 'NURSE', status: 'APPROVED', ...genderWhere },
      select: { id: true },
    })
    await Promise.all(
      audienceNurses.map((nurse) =>
        notify(nurse.id, {
          title: 'تكليف جديد متاح للتقديم',
          body: `${postBody} — سارِ بالتقديم قبل اكتمال العدد`,
          type: 'POST_CREATED',
          link: '/nurse/assignments',
        })
      )
    )

    return NextResponse.json(
      {
        message: `تم نشر التكليف بنجاح (${finalTitle}) — ${DISTRIBUTION_LABELS[distribution]} — حصة الإدارة: ${adminFeeLabel(settings)}`,
        post,
      },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
