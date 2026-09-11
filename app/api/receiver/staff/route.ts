import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { receiverCreateNurseSchema, createDoctorSchema } from '@/lib/validations/user'
import { notify } from '@/lib/notifications'
import { resolveReceiverOrg, AFFILIATION_STATUS_LABELS, healReceiverPendingAffiliations } from '@/lib/network'

/**
 * POST /api/receiver/staff — إضافة كادر/طبيب للجهة الصحية
 * المستلم الإداري → يضيف كادر تمريضي | مشرف الأطباء → يضيف أطباء (منظومة الأطباء)
 * - يُنشأ الحساب بحالة PENDING — لا يستقبل أي تكليف أو إجراء
 *   حتى اعتماده من حساب الإدارة ورفع مستنداته (الحاجز الفعلي على مستوى الحساب)
 * - يظهر فوراً في حساب الإدارة وفي لوحة الجهة
 * - الارتباط بالجهة: جهة نشطة → WORKING مباشرة، جهة بانتظار الاعتماد → PENDING
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

    // الجهة الصحية للمستلم — لا يمكن إضافة كوادر بلا جهة مصرّح بها
    const org = await resolveReceiverOrg(session.user.id)
    if (!org) {
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
    const orgActive = org.status === 'ACTIVE'

    // حساب الكادر/الطبيب + ارتباطه بالجهة — معاملة واحدة
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

      return user
    })

    // إشعار الإدارة: عضو جديد أضافه صاحب الجهة — بانتظار الاعتماد ورفع المستندات
    const admins = await db.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
    await Promise.all(
      admins.map((a) =>
        notify(a.id, {
          title: isSupervisor
            ? 'طبيب جديد أضافه مشرف الأطباء'
            : 'كادر تمريضي جديد أضافه المستلم الإداري',
          body: `${session.user.name} أضاف ${nurse.name} (${phone}) لجهة ${org.name} — راجع بياناته واعتمد حسابه بعد رفع مستنداته`,
          type: 'GENERIC',
          link: isSupervisor ? '/admin/doctors' : '/admin/nurses',
        })
      )
    )

    // إشعار العضو الجديد
    await notify(nurse.id, {
      title: 'مرحباً بك في تكليفات',
      body: `أنشأ لك ${isSupervisor ? 'مشرف الأطباء' : 'المستلم الإداري'} حساباً مرتبطاً بجهة (${org.name}) — ارفع مستنداتك وانتظر اعتماد حسابك من الإدارة لتفعيل جميع الميزات`,
      type: 'GENERIC',
      link: isSupervisor ? '/doctor/documents' : '/nurse/documents',
    })

    return NextResponse.json(
      {
        message: orgActive
          ? `تمت إضافة ${nurse.name} إلى ${isSupervisor ? 'أطباء' : 'كوادر'} ${org.name} — يظهر الآن في حساب الإدارة ولن يستقبل أي تكليف قبل اعتماد حسابه ورفع مستنداته`
          : `تمت إضافة ${nurse.name} إلى ${isSupervisor ? 'أطباء' : 'كوادر'} ${org.name} — سيُعتمد ارتباطه تلقائياً عند اعتماد الجهة الصحية من الإدارة`,
        nurse,
      },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * GET /api/receiver/staff — كوادر جهة المستلم الإداري
 * قائمة الارتباطات المرتبطة بجهة المستلم (كل الحالات) لعرضها في صفحة كوادر الجهة.
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

    const affiliations = await db.nurseAffiliation.findMany({
      where: { hospitalId: org.id },
      orderBy: { createdAt: 'desc' },
      include: {
        nurse: {
          select: {
            id: true,
            name: true,
            phone: true,
            gender: true,
            specialty: true,
            qualification: true,
            yearsOfExperience: true,
            status: true,
            _count: { select: { documents: true } },
          },
        },
      },
    })

    return NextResponse.json({
      org,
      nurses: affiliations.map((a) => ({
        affiliationId: a.id,
        affiliationStatus: a.status,
        affiliationStatusLabel: AFFILIATION_STATUS_LABELS[a.status] ?? a.status,
        requestedStatus: a.requestedStatus,
        workYears: a.workYears,
        createdAt: a.createdAt,
        nurse: a.nurse,
      })),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
