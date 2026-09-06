import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { compare, hashSync } from 'bcryptjs'

/**
 * نقطة تشخيص مؤقتة لمشكلة تسجيل الدخول على الإنتاج — تكليفات | Takleefat
 * تُظهر مؤشرات غير حساسة فقط: وجود الحسابات، حالتها، سلامة صيغة الهاش،
 * واختبار ذاتي لـ bcrypt داخل بيئة التشغيل. لا تُظهر أي كلمات مرور أو هاشات.
 * (تُحذف بعد حل المشكلة)
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const mask = (phone: string) => `${phone.slice(0, 2)}****${phone.slice(-2)}`

  try {
    // 1) اختبار ذاتي: bcrypt يعمل في بيئة التشغيل؟
    let bcryptSelfTest = false
    let bcryptError: string | undefined
    try {
      const h = hashSync('self-test-1234', 10)
      bcryptSelfTest = await compare('self-test-1234', h)
    } catch (e) {
      bcryptError = e instanceof Error ? e.message : 'unknown'
    }

    // 2) الحسابات المعروفة — هل توجد؟ حالة؟ الهاش بصيغة سليمة؟
    const phones = ['773178684', '711111111', '733333333']
    const users = await db.user.findMany({
      where: { phone: { in: phones } },
      select: { phone: true, role: true, status: true, password: true, updatedAt: true },
    })

    const accountChecks = phones.map((p) => {
      const u = users.find((x) => x.phone === p)
      return {
        phone: mask(p),
        exists: Boolean(u),
        role: u?.role ?? null,
        status: u?.status ?? null,
        hashFormatValid: Boolean(u?.password && u.password.startsWith('$2') && u.password.length >= 59),
        updatedAt: u?.updatedAt ?? null,
      }
    })

    // 3) التحقق الفعلي من سلسلة الهاش والمقارنة (بلا لمس بيانات حقيقية)
    let compareFlowWorks = false
    let compareFlowError: string | undefined
    try {
      const h = hashSync('Flow@12345', 12)
      compareFlowWorks = await compare('Flow@12345', h)
    } catch (e) {
      compareFlowError = e instanceof Error ? e.message : 'unknown'
    }

    // 4) إجمالي المستخدمين المعتمدين
    const approvedCount = await db.user.count({ where: { status: 'APPROVED' } })
    const totalCount = await db.user.count()

    // 5) محاكاة خطوات authorize بالضبط للحساب الإداري — مؤشرات منطقية فقط (بلا أي تسريب)
    const { loginSchema } = await import('@/lib/validations/auth')
    const parsed = loginSchema.safeParse({ phone: '773178684', password: 'Admin@1234' })
    const admin = parsed.success
      ? await db.user.findUnique({ where: { phone: '773178684' } })
      : null
    const compareOk = admin
      ? await compare('Admin@1234', admin.password).catch(() => false)
      : false

    return NextResponse.json({
      time: new Date().toISOString(),
      bcryptSelfTest,
      ...(bcryptError ? { bcryptError } : {}),
      compareFlowWorks,
      ...(compareFlowError ? { compareFlowError } : {}),
      accountChecks,
      counts: { total: totalCount, approved: approvedCount },
      authorizeSim: {
        schemaParseOk: parsed.success,
        userFound: Boolean(admin),
        passwordCompareOk: compareOk,
        statusApproved: admin?.status === 'APPROVED',
      },
      note: 'نقطة تشخيص مؤقتة — تُحذف بعد حل مشكلة الدخول',
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'diag-failed',
        message: error instanceof Error ? error.message.split('\n')[0] : 'unknown',
      },
      { status: 500 }
    )
  }
}
