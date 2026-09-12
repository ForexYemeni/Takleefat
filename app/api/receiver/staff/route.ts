import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { receiverCreateNurseSchema, createDoctorSchema } from '@/lib/validations/user'
import { notify } from '@/lib/notifications'
import {
  resolveReceiverOrg,
  AFFILIATION_STATUS_LABELS,
  healReceiverPendingAffiliations,
  computeOrgCadreStats,
  busyStaffIds,
} from '@/lib/network'
import { isValidQualification, qualificationErrorMessage } from '@/lib/qualifications'
import { isTrustedViewer, phoneView, revealedStaffIds } from '@/lib/phone-privacy'

/**
 * POST /api/receiver/staff — إضافة كادر/طبيب
 * المستلم الإداري → يضيف كادر تمريضي لجهته | مشرف الأطباء → يضيف أطباء
 * للقائمة العامة للأطباء في المنصة — **الجهة الصحية ليست شرطاً للمشرف** (الجولة 34):
 * يضيف الأطباء بلا جهة أصلاً، وإن وُجدت جهة مرتبطة بحسابه فإنه يربطهم بها اختيارياً.
 * - يُنشأ الحساب بحالة PENDING — لا يستقبل أي تكليف أو إجراء
 *   حتى اعتماده من حساب الإدارة ورفع مستنداته إجبارياً (الحاجز الفعلي على مستوى الحساب)
 * - يظهر فوراً في حساب الإدارة وفي لوحة الجهة (إن وُجدت)
 * - الارتباط بالجهة (إن وُجدت): جهة نشطة → WORKING مباشرة، جهة بانتظار الاعتماد → PENDING
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole('RECEIVER', 'DOCTOR_SUPERVISOR')
    const isSupervisor = session.user.role === 'DOCTOR_SUPERVISOR'

    // مشرف الأطباء: مؤهلات الأطباء الخاصة — المستلم: مؤهلات الكادر
    const parsed = (isSupervisor ? createDoctorSchema : receiverCreateNurseSchema).safeParse(
      await req.json()
    )
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    const { name, phone, password, gender, qualification, specialty, yearsOfExperience } = parsed.data

    // الجولة 31: التخصص الطبي للطبيب إجباري من كتالوج التخصصات المُدار من حساب الإدارة
    if (isSupervisor) {
      const catalogSpecialty = await db.specialty.findUnique({
        where: { name: specialty.trim() },
        select: { id: true, isActive: true },
      })
      if (!catalogSpecialty || !catalogSpecialty.isActive) {
        return jsonError(
          'التخصص الطبي يجب أن يكون من كتالوج التخصصات المُدار من حساب الإدارة — راجع الإدارة لإضافة التخصص',
          422
        )
      }
    }

    // الجولة 32: المؤهل العلمي من كتالوج المؤهلات العلمية المُدار من حساب الإدارة
    if (qualification) {
      const audience = isSupervisor ? 'DOCTOR' : 'NURSE'
      if (!(await isValidQualification(qualification, audience))) {
        return jsonError(qualificationErrorMessage(audience), 422)
      }
    }

    // الجهة الصحية للمستلم — إجبارية للمستلم الإداري حصراً
    // الجولة 34: مشرف الأطباء يضيف أطباء للقائمة العامة بلا شرط جهة
    const org = await resolveReceiverOrg(session.user.id)
    if (!org && !isSupervisor) {
      return jsonError(
        'لا توجد جهة صحية معتمدة مرتبطة بحسابك — راجع الإدارة لربط جهتك أولاً',
        422
      )
    }

    const existing = await db.user.findUnique({ where: { phone } })
    if (existing) {
      return jsonError('رقم الهاتف مسجل مسبقاً في المنصة', 409)
    }

    const hashed = await hash(password, 12)

    // الجهة النشطة: ارتباط فعلي معتمد من المستلم المخول لجهته
    // الجهة المعلقة: يبقى الارتباط PENDING ويُعتمد تلقائياً عند اعتماد الجهة نفسها
    const orgActive = org?.status === 'ACTIVE'

    // حساب الكادر/الطبيب + ارتباطه بالجهة (إن وُجدت) — معاملة واحدة
    const nurse = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: name.trim(),
          phone,
          password: hashed,
          // مشرف الأطباء ينشئ أطباء — المستلم ينشئ كادر تمريضي (منظومة الأطباء)
          role: isSupervisor ? 'DOCTOR' : 'NURSE',
          // بانتظار اعتماد الإدارة — لا تكليفات ولا إجراءات قبل الاعتماد ورفع المستندات
          status: 'PENDING',
          specialty: specialty?.trim() || null,
          qualification: qualification?.trim() || null,
          yearsOfExperience: yearsOfExperience ?? 0,
          gender,
        },
        select: { id: true, name: true, phone: true, status: true },
      })

      if (org) {
        await tx.nurseAffiliation.create({
          data: {
            nurseId: user.id,
            hospitalId: org.id,
            status: orgActive ? 'WORKING' : 'PENDING',
            requestedStatus: 'WORKING',
            requestedById: session.user.id,
            reviewedById: orgActive ? session.user.id : null,
            reviewedAt: orgActive ? new Date() : null,
            note: isSupervisor
              ? 'أُضيف من مشرف الأطباء لجهته الصحية'
              : 'أُضيف من المستلم الإداري لجهته الصحية',
          },
        })
      }

      return user
    })

    // إشعار الإدارة: عضو جديد أضافه صاحب الحساب — بانتظار الاعتماد ورفع المستندات
    const admins = await db.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
    await Promise.all(
      admins.map((a) =>
        notify(a.id, {
          title: isSupervisor
            ? org
              ? 'طبيب جديد أضافه مشرف الأطباء لجهته'
              : 'طبيب جديد أضافه مشرف الأطباء للقائمة العامة'
            : 'كادر تمريضي جديد أضافه المستلم الإداري',
          body: org
            ? `${session.user.name} أضاف ${nurse.name} (${phone}) لجهة ${org.name} — راجع بياناته واعتمد حسابه بعد رفع مستنداته`
            : `${session.user.name} أضاف ${nurse.name} (${phone}) إلى قائمة أطباء المنصة — راجع بياناته واعتمد حسابه بعد رفع مستنداته إجبارياً`,
          type: 'GENERIC',
          link: isSupervisor ? '/admin/doctors' : '/admin/nurses',
        })
      )
    )

    // إشعار العضو الجديد
    await notify(nurse.id, {
      title: 'مرحباً بك في تكليفات',
      body: org
        ? `أنشأ لك ${isSupervisor ? 'مشرف الأطباء' : 'المستلم الإداري'} حساباً مرتبطاً بجهة (${org.name}) — رفع مستنداتك إجباري دون استثناء، وانتظر اعتماد حسابك ومستنداتك من الإدارة لتفعيل جميع الميزات`
        : `أنشأ لك مشرف الأطباء حساباً في قائمة أطباء المنصة — رفع مستنداتك إجباري دون استثناء، وانتظر اعتماد حسابك ومستنداتك من الإدارة لتفعيل جميع الميزات`,
      type: 'GENERIC',
      link: isSupervisor ? '/doctor/documents' : '/nurse/documents',
    })

    return NextResponse.json(
      {
        message: org
          ? orgActive
            ? `تمت إضافة ${nurse.name} إلى ${isSupervisor ? 'أطباء' : 'كوادر'} ${org.name} — يظهر الآن في حساب الإدارة ولن يستقبل أي تكليف قبل اعتماد حسابه ورفع مستنداته إجبارياً`
            : `تمت إضافة ${nurse.name} إلى ${isSupervisor ? 'أطباء' : 'كوادر'} ${org.name} — سيُعتمد ارتباطه تلقائياً عند اعتماد الجهة الصحية من الإدارة`
          : `تمت إضافة ${nurse.name} إلى قائمة ${isSupervisor ? 'الأطباء' : 'الكوادر'} في المنصة — لن يستقبل أي تكليف قبل رفع مستنداته واعتماد حسابه من الإدارة`,
        nurse,
      },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * GET /api/receiver/staff — كوادر/أطباء جهة صاحب التكليف
 * قائمة الارتباطات المرتبطة بجهته (كل الحالات) لعرضها في صفحة كوادر الجهة
 * مع حالة المفضلة الشخصية لكل صف (نجمة المفضلة تُدار مباشرة من صفحة الجهة).
 * الجولة 38: إحصاءات «مجتمع كوادر الجهة الصحية» (المعتمدون/المتاحون الآن)
 * + شارة التوفر لكل صف (available).
 */
export async function GET() {
  try {
    const session = await requireRole('RECEIVER', 'DOCTOR_SUPERVISOR')
    const org = await resolveReceiverOrg(session.user.id)
    if (!org) {
      return NextResponse.json({ org: null, nurses: [] })
    }

    // شفاء كسول: ارتباطات أُضيفت من المستلم ثم اعتُمدت الجهة وتوقفت على PENDING
    await healReceiverPendingAffiliations(org.id)

    const [affiliations, favorites, me, community] = await Promise.all([
      db.nurseAffiliation.findMany({
        where: { hospitalId: org.id },
        orderBy: { createdAt: 'desc' },
        include: {
          nurse: {
            select: {
              id: true,
              name: true,
              phone: true,
              gender: true,
              role: true,
              specialty: true,
              qualification: true,
              yearsOfExperience: true,
              status: true,
              _count: { select: { documents: true } },
            },
          },
        },
      }),
      // مفضلة صاحب الحساب نفسه — لتصيير نجمة المفضلة بحالتها الصحيحة
      db.favoriteNurse.findMany({
        where: { receiverId: session.user.id },
        select: { nurseId: true },
      }),
      // الجولة 32: إذن رؤية البيانات الكاملة — تُظهر الواجهة زر «السيرة الذاتية الكاملة» حسبه
      db.user.findUnique({
        where: { id: session.user.id },
        select: { fullProfileAccess: true },
      }),
      // الجولة 38: إحصاءات مجتمع كوادر الجهة الصحية
      computeOrgCadreStats(org.id),
    ])
    // الجولة 39: المستندات المعتمدة من الإدارة — الاعتماد المهني (كطبيب/ككادر طبي)
    // لا يُمنح إلا برفع المستندات والموافقة عليها من حساب الإدارة، ولا يمنحه
    // اعتماد الجهة من المستلم/المشرف إطلاقاً
    const approvedDocs = await db.document.groupBy({
      by: ['userId'],
      where: {
        userId: { in: affiliations.map((a) => a.nurse.id) },
        status: 'APPROVED',
      },
      _count: { _all: true },
    })
    const approvedDocsMap = new Map(approvedDocs.map((d) => [d.userId, d._count._all]))
    const favoriteSet = new Set(favorites.map((f) => f.nurseId))
    // الجولة 38: من المشغول الآن بتكليف سارٍ — لشارة «متاح الآن / في تكليف»
    const busy = await busyStaffIds(affiliations.map((a) => a.nurse.id))

    // الجولة 34: أرقام الكوادر/الأطباء مخفية — تُفتح فقط بتكليف سارٍ مسدد النسبة بين الطرفين
    // الجولة 36: «الموثوق جداً» يرى كل الأرقام دون استثناء
    const trusted = await isTrustedViewer(session.user.id)
    const revealed = await revealedStaffIds(
      session.user.id,
      affiliations.map((a) => a.nurse.id),
      trusted
    )

    return NextResponse.json({
      org,
      fullProfileAccess: me?.fullProfileAccess ?? false,
      // الجولة 38: مجتمع كوادر الجهة الصحية — ثلاثة عدادات فورية
      community,
      nurses: affiliations.map((a) => ({
        affiliationId: a.id,
        affiliationStatus: a.status,
        affiliationStatusLabel: AFFILIATION_STATUS_LABELS[a.status] ?? a.status,
        requestedStatus: a.requestedStatus,
        workYears: a.workYears,
        createdAt: a.createdAt,
        isFavorite: favoriteSet.has(a.nurse.id),
        // الجولة 38: متاح الآن = بلا تكليف سارٍ (ACTIVE/RECEIVED)
        available: !busy.has(a.nurse.id),
        // الجولة 39: الاعتماد المهني من الإدارة — مستندات معتمدة من حساب الإدارة
        approvedDocuments: approvedDocsMap.get(a.nurse.id) ?? 0,
        nurse: {
          ...a.nurse,
          ...phoneView(session.user.role, a.nurse.phone, revealed.has(a.nurse.id), trusted),
        },
      })),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
