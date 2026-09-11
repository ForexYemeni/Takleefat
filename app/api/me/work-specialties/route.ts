import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, handleApiError, jsonError } from '@/lib/api-helpers'
import { workSpecialtiesSchema } from '@/lib/validations/user'

/**
 * تخصصات عمل الطبيب — تعدد تخصصات من كتالوج التخصصات الطبية (منظومة الأطباء)
 * GET /api/me/work-specialties — تخصصاتي الحالية + كل التخصصات النشطة (للاختيار)
 * PUT  /api/me/work-specialties — استبدال كامل لمجموعة التخصصات { specialtyIds: [] }
 *
 * عند إنشاء تكليف أطباء بتخصص محدد (باطنية/جراحة/أطفال...) يصل التكليف
 * مباشرة لكل طبيب أضاف هذا التخصص ضمن تخصصات عمله.
 */

const SPECIALTY_SELECT = { id: true, name: true } as const

export async function GET() {
  try {
    const session = await requireRole('DOCTOR')

    const [mine, allSpecialties] = await Promise.all([
      db.doctorSpecialty.findMany({
        where: { doctorId: session.user.id },
        orderBy: { createdAt: 'asc' },
        select: { specialty: { select: SPECIALTY_SELECT } },
      }),
      db.specialty.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: SPECIALTY_SELECT,
      }),
    ])

    return NextResponse.json({
      specialties: mine.map((w) => w.specialty),
      allSpecialties,
    })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PUT(req: Request) {
  try {
    const session = await requireRole('DOCTOR')
    const body = await req.json().catch(() => ({}))

    const parsed = workSpecialtiesSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'البيانات غير صحيحة', 422)
    }

    // إزالة التكرار مع حفظ الترتيب
    const ids = Array.from(new Set(parsed.data.specialtyIds))
    if (ids.length === 0) {
      // مجموعة فارغة = مسح كل التخصصات (قرار مشروع)
      await db.doctorSpecialty.deleteMany({ where: { doctorId: session.user.id } })
      return NextResponse.json({ message: 'تم تحديث تخصصات عملك', specialties: [] })
    }

    // كل التخصصات يجب أن تكون من كتالوج الإدارة النشط — لا تخصصات يخترعها الطبيب
    const valid = await db.specialty.findMany({
      where: { id: { in: ids }, isActive: true },
      select: SPECIALTY_SELECT,
    })
    if (valid.length !== ids.length) {
      return jsonError('بعض التخصصات غير موجودة في كتالوج الإدارة أو غير نشطة — حدّث القائمة', 422)
    }

    // استبدال كامل ذري للمجموعة
    await db.$transaction([
      db.doctorSpecialty.deleteMany({ where: { doctorId: session.user.id } }),
      db.doctorSpecialty.createMany({
        data: ids.map((specialtyId) => ({ doctorId: session.user.id, specialtyId })),
      }),
    ])

    const specialties = await db.doctorSpecialty.findMany({
      where: { doctorId: session.user.id },
      orderBy: { createdAt: 'asc' },
      select: { specialty: { select: SPECIALTY_SELECT } },
    })

    return NextResponse.json({
      message: `تم تحديث تخصصات عملك (${specialties.length} تخصص) — ستصل تكليفات هذه التخصصات إليك مباشرة`,
      specialties: specialties.map((w) => w.specialty),
    })
  } catch (error) {
    return handleApiError(error)
  }
}
