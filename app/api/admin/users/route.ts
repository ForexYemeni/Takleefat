import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import {
  createReceiverSchema,
  createNurseSchema,
  createDoctorSchema,
  createSupervisorSchema,
} from '@/lib/validations/user'
import { notify } from '@/lib/notifications'

/**
 * GET /api/admin/users?role=NURSE&status=PENDING&search=...
 * قائمة المستخدمين مع إمكانية التصفية (كل الأدوار: كادر، مستلمون، أطباء، مشرفو أطباء)
 */
export async function GET(req: NextRequest) {
  try {
    await requireRole('ADMIN')

    const role = req.nextUrl.searchParams.get('role')
    const status = req.nextUrl.searchParams.get('status')
    const search = req.nextUrl.searchParams.get('search')

    const users = await db.user.findMany({
      where: {
        ...(role && ['NURSE', 'RECEIVER', 'ADMIN', 'DOCTOR', 'DOCTOR_SUPERVISOR'].includes(role)
          ? { role: role as 'NURSE' | 'RECEIVER' | 'ADMIN' | 'DOCTOR' | 'DOCTOR_SUPERVISOR' }
          : {}),
        ...(status && ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'].includes(status)
          ? { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' }
          : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
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
        createdAt: true,
        // جهة الكادر الأولى (إذا أضافه مستلم إداري لجهته) — تُعرض في قائمة الكادر
        affiliations: {
          take: 1,
          orderBy: { createdAt: 'desc' as const },
          select: { hospital: { select: { name: true, status: true } } },
        },
        _count: { select: { documents: true, assignments: true } },
      },
    })

    return NextResponse.json({ users })
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * POST /api/admin/users — إنشاء حساب جديد من الإدارة
 * body: { role: 'RECEIVER' | 'NURSE' | 'DOCTOR' | 'DOCTOR_SUPERVISOR', ...الحقول }
 * الحساب يُنشأ معتمداً تلقائياً لأن المدير هو من ينشئه.
 * DOCTOR_SUPERVISOR: مشرف أطباء (يستدعي الأطباء — منظومة الأطباء)
 * DOCTOR: طبيب بمؤهلات التخصص الطبي الخاصة
 */
export async function POST(req: NextRequest) {
  try {
    await requireRole('ADMIN')

    const body = await req.json()
    const role: 'NURSE' | 'RECEIVER' | 'DOCTOR' | 'DOCTOR_SUPERVISOR' =
      body?.role === 'NURSE'
        ? 'NURSE'
        : body?.role === 'DOCTOR'
          ? 'DOCTOR'
          : body?.role === 'DOCTOR_SUPERVISOR'
            ? 'DOCTOR_SUPERVISOR'
            : 'RECEIVER'

    // التحقق حسب نوع الحساب ثم الإنشاء (فصل الفروع لتضييق الأنواع بشكل صحيح)
    if (role === 'NURSE') {
      const parsed = createNurseSchema.safeParse(body)
      if (!parsed.success) {
        return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
      }
      const { name, phone, password, specialty, qualification, gender, yearsOfExperience } = parsed.data

      const existing = await db.user.findUnique({ where: { phone } })
      if (existing) {
        return jsonError('رقم الهاتف مسجل مسبقاً في المنصة', 409)
      }

      const hashed = await hash(password, 12)
      const user = await db.user.create({
        data: {
          name,
          phone,
          password: hashed,
          role: 'NURSE',
          status: 'APPROVED',
          // التخصص اختياري (الجولة الثامنة) — المؤهل من 3 خيارات والجنس إجباري
          specialty: specialty?.trim() || null,
          qualification,
          gender,
          yearsOfExperience: yearsOfExperience ?? 0,
        },
        select: { id: true, name: true, phone: true, role: true, status: true },
      })

      await notify(user.id, {
        title: 'مرحباً بك في تكليفات',
        body: 'تم إنشاء حسابك ككادر تمريضي. يمكنك الآن استعراض التكليفات المسندة إليك ورفع مستنداتك.',
        type: 'GENERIC',
        link: '/nurse',
      })

      return NextResponse.json(
        { message: 'تم إنشاء حساب الكادر التمريضي بنجاح', user },
        { status: 201 }
      )
    }

    // الطبيب — مؤهلات التخصص الطبي الخاصة (منظومة الأطباء)
    if (role === 'DOCTOR') {
      const parsed = createDoctorSchema.safeParse(body)
      if (!parsed.success) {
        return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
      }
      const { name, phone, password, specialty, qualification, gender, yearsOfExperience } = parsed.data

      const existing = await db.user.findUnique({ where: { phone } })
      if (existing) {
        return jsonError('رقم الهاتف مسجل مسبقاً في المنصة', 409)
      }

      const hashed = await hash(password, 12)
      const user = await db.user.create({
        data: {
          name,
          phone,
          password: hashed,
          role: 'DOCTOR',
          status: 'APPROVED',
          specialty: specialty.trim(),
          qualification,
          gender,
          yearsOfExperience: yearsOfExperience ?? 0,
        },
        select: { id: true, name: true, phone: true, role: true, status: true },
      })

      await notify(user.id, {
        title: 'مرحباً بك في تكليفات',
        body: 'تم إنشاء حسابك كطبيب. يمكنك الآن استعراض التكليفات المتاحة ورفع مستنداتك والتقديم عليها.',
        type: 'GENERIC',
        link: '/doctor',
      })

      return NextResponse.json(
        { message: 'تم إنشاء حساب الطبيب بنجاح', user },
        { status: 201 }
      )
    }

    // مشرف الأطباء — نفس شكل المستلم الإداري (منظومة الأطباء)
    if (role === 'DOCTOR_SUPERVISOR') {
      const parsed = createSupervisorSchema.safeParse(body)
      if (!parsed.success) {
        return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
      }
      const { name, phone, password, hospitalName } = parsed.data

      const existing = await db.user.findUnique({ where: { phone } })
      if (existing) {
        return jsonError('رقم الهاتف مسجل مسبقاً في المنصة', 409)
      }

      const hashed = await hash(password, 12)
      const user = await db.user.create({
        data: {
          name,
          phone,
          password: hashed,
          role: 'DOCTOR_SUPERVISOR',
          status: 'APPROVED', // حسابات يُنشئها المدير تكون معتمدة تلقائياً
          ...(hospitalName ? { hospitalName: hospitalName.trim() } : {}),
        },
        select: { id: true, name: true, phone: true, role: true, status: true },
      })

      await notify(user.id, {
        title: 'مرحباً بك في تكليفات',
        body: 'تم إنشاء حسابك كمشرف أطباء. يمكنك الآن إنشاء تكليفات الأطباء واستدعاء الأطباء لجهتك.',
        type: 'GENERIC',
        link: '/supervisor',
      })

      return NextResponse.json(
        { message: 'تم إنشاء حساب مشرف الأطباء بنجاح', user },
        { status: 201 }
      )
    }

    const parsed = createReceiverSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }
    const { name, phone, password, hospitalName } = parsed.data

    const existing = await db.user.findUnique({ where: { phone } })
    if (existing) {
      return jsonError('رقم الهاتف مسجل مسبقاً في المنصة', 409)
    }

    const hashed = await hash(password, 12)
    const user = await db.user.create({
      data: {
        name,
        phone,
        password: hashed,
        role: 'RECEIVER',
        status: 'APPROVED', // حسابات يُنشئها المدير تكون معتمدة تلقائياً
        ...(hospitalName ? { hospitalName: hospitalName.trim() } : {}),
      },
      select: { id: true, name: true, phone: true, role: true, status: true },
    })

    await notify(user.id, {
      title: 'مرحباً بك في تكليفات',
      body: 'تم إنشاء حسابك كمستلم إداري. يمكنك الآن استلام التكليفات المسندة إليك.',
      type: 'GENERIC',
      link: '/receiver',
    })

    return NextResponse.json(
      { message: 'تم إنشاء حساب المستلم الإداري بنجاح', user },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}
