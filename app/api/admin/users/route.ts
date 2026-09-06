import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { createReceiverSchema, createNurseSchema } from '@/lib/validations/user'
import { notify } from '@/lib/notifications'

/**
 * GET /api/admin/users?role=NURSE&status=PENDING&search=...
 * قائمة المستخدمين مع إمكانية التصفية
 */
export async function GET(req: NextRequest) {
  try {
    await requireRole('ADMIN')

    const role = req.nextUrl.searchParams.get('role')
    const status = req.nextUrl.searchParams.get('status')
    const search = req.nextUrl.searchParams.get('search')

    const users = await db.user.findMany({
      where: {
        ...(role === 'NURSE' || role === 'RECEIVER' || role === 'ADMIN' ? { role } : {}),
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
        _count: { select: { documents: true, assignments: true } },
      },
    })

    return NextResponse.json({ users })
  } catch (error) {
    return handleApiError(error)
  }
}

/**
 * POST /api/admin/users — إنشاء حساب جديد (مستلم إداري أو كادر تمريضي)
 * body: { role: 'RECEIVER' | 'NURSE', ...الحقول }
 * الحساب يُنشأ معتمداً تلقائياً لأن المدير هو من ينشئه.
 */
export async function POST(req: NextRequest) {
  try {
    await requireRole('ADMIN')

    const body = await req.json()
    const role: 'NURSE' | 'RECEIVER' = body?.role === 'NURSE' ? 'NURSE' : 'RECEIVER'

    // التحقق حسب نوع الحساب ثم الإنشاء (فصل الفروع لتضييق الأنواع بشكل صحيح)
    if (role === 'NURSE') {
      const parsed = createNurseSchema.safeParse(body)
      if (!parsed.success) {
        return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
      }
      const { name, phone, password, specialty, qualification, yearsOfExperience } = parsed.data

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
          specialty,
          qualification,
          yearsOfExperience,
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
