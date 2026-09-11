/* eslint-disable @typescript-eslint/no-require-imports */
/* ============================================================
 * تكليفات | Takleefat — تجهيز قاعدة البيانات (Seed)
 * ------------------------------------------------------------
 * المبدأ الرسمي: لا حسابات وهمية إطلاقاً.
 * المنصة تُنشر نظيفة بلا أي كادر تمريضي أو مستلم إداري مزيّف —
 * الحسابات الحقيقية تأتي من التسجيل أو من لوحة الإدارة فقط.
 *
 * ما يفعله هذا الملف:
 *   1) حساب المدير (إنقاذ دائم من ADMIN_PHONE / ADMIN_PASSWORD)
 *   2) مزامنة إنقاذ لكلمة مرور المدير فقط
 *   3) حذف نهائي دائم لأي حسابات تجريبية قديمة معروفة (تنظيف بلا عودة)
 *   4) إعدادات الرسوم وطرق الدفع
 *
 * مبدأ صارم (بمطالبة صاحب المنصة): لا تُضاف أي جهة صحية أو قسم من هنا أبداً —
 * الجهات والأقسام تُدار من حساب الإدارة فقط، ولا يجوز أن تعود بعد حذفها مهما كان التحديث.
 *
 * الاستخدام:
 *   npx prisma db push        (إنشاء الجداول أولاً)
 *   npx prisma db seed        (التجهيز)
 *
 * حساب المدير (إن لم تُضبط ADMIN_PHONE / ADMIN_PASSWORD):
 *   مدير النظام   773178684   Admin@1234
 * ============================================================ */

const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

// أرقام يمنية (تبدأ بـ 7 و 9 أرقام) — يمكن تعديلها من متغيرات البيئة
const ADMIN_PHONE = process.env.ADMIN_PHONE || '773178684'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@1234'

// حسابات تجريبية قديمة كانت تُبذر في إصدارات سابقة — تُحذف نهائياً للأبد
// عند كل تشغيل (حذف كامل بمعاملة واحدة، ولا تُعاد إنشاؤها مهما حدث)
const LEGACY_DEMO_PHONES = ['711111111', '722222222', '733333333']

async function purgeLegacyDemoUsers() {
  for (const phone of LEGACY_DEMO_PHONES) {
    const user = await prisma.user.findUnique({ where: { phone } })
    if (!user) continue
    // حماية: لا نلمس حسابات المديرين مهما كانت
    if (user.role === 'ADMIN') continue

    await prisma.$transaction(async (tx) => {
      // التكليفات التي طرفها الحساب + سجلات أحداثها
      const relatedAssignments = await tx.assignment.findMany({
        where: { OR: [{ nurseId: user.id }, { receiverId: user.id }, { createdById: user.id }] },
        select: { id: true },
      })
      const assignmentIds = relatedAssignments.map((a) => a.id)
      if (assignmentIds.length > 0) {
        await tx.assignmentLog.deleteMany({ where: { assignmentId: { in: assignmentIds } } })
        await tx.assignment.deleteMany({ where: { id: { in: assignmentIds } } })
      }

      // مراجعات أجراها الحساب — تُفرَّغ المراجع قبل الحذف
      await tx.application.updateMany({
        where: { reviewedById: user.id },
        data: { reviewedById: null },
      })
      await tx.document.updateMany({
        where: { reviewedById: user.id },
        data: { reviewedById: null },
      })

      // كل بيانات الحساب (التقييمات والأرباح والسحوبات والإشعارات تُحذف بالتعاقب)
      await tx.assignmentLog.deleteMany({ where: { userId: user.id } })
      await tx.notification.deleteMany({ where: { userId: user.id } })
      await tx.application.deleteMany({ where: { nurseId: user.id } })
      await tx.document.deleteMany({ where: { userId: user.id } })
      await tx.post.deleteMany({ where: { receiverId: user.id } })
      await tx.user.delete({ where: { id: user.id } })
    })

    console.log(`🧹 حذف نهائي دائم: الحساب التجريبي القديم (${phone}) بكل بياناته — لن يعود`)
  }
}

async function main() {
  console.log('\n🌱 تكليفات | Takleefat — تجهيز قاعدة البيانات...\n')

  const hash = (pwd) => bcrypt.hashSync(pwd, 12)

  // ---------- 1) حساب المدير (إنقاذ دائم) ----------
  const admin = await prisma.user.upsert({
    where: { phone: ADMIN_PHONE },
    update: { role: 'ADMIN', status: 'APPROVED' },
    create: {
      name: 'مدير النظام',
      phone: ADMIN_PHONE,
      password: hash(ADMIN_PASSWORD),
      role: 'ADMIN',
      status: 'APPROVED',
    },
  })
  console.log(`✅ مدير النظام جاهز → ${admin.phone}`)

  // ---------- 2) مزامنة إنقاذ لكلمة مرور المدير فقط ----------
  const adminAcc = await prisma.user.findUnique({ where: { phone: ADMIN_PHONE } })
  if (adminAcc && !bcrypt.compareSync(ADMIN_PASSWORD, adminAcc.password)) {
    await prisma.user.update({
      where: { phone: ADMIN_PHONE },
      data: { password: hash(ADMIN_PASSWORD) },
    })
    console.log('🔧 مزامنة إنقاذ: كلمة مرور المدير أُعيدت إلى القيمة الموثقة')
  }

  // ---------- 3) حذف نهائي دائم لأي حسابات وهمية قديمة ----------
  await purgeLegacyDemoUsers()

  // ---------- 4) إعدادات المنصة (الرسوم وطرق الدفع) ----------
  const settingsData = [
    { key: 'applicationFee', value: process.env.SETTINGS_APPLICATION_FEE || '1000' },
    { key: 'adminPercentage', value: process.env.SETTINGS_ADMIN_PERCENTAGE || '10' },
    { key: 'paymentMethod', value: 'محفظة جيب' },
    { key: 'paymentAccountNumber', value: process.env.SETTINGS_PAYMENT_ACCOUNT || '755000000' },
    { key: 'paymentAccountName', value: 'منصة تكليفات | Takleefat' },
    { key: 'paymentNotes', value: 'يُرجى إرسال صورة إثبات التحويل عبر واتساب للإدارة بعد الدفع.' },
  ]
  for (const s of settingsData) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: {},
      create: s,
    })
  }
  console.log('✅ إعدادات الرسوم وطرق الدفع (محفظة جيب — رسوم التقديم 1000 ريال — نسبة الإدارة 10٪)')

  // ---------- لا جهات صحية ولا أقسام من هنا — نهائياً ----------
  // (الجهات والأقسام تُضاف من حساب الإدارة فقط، وما حُذف لا يعود أبداً)
  const hospitalsCount = await prisma.hospital.count()
  const departmentsCount = await prisma.department.count()
  console.log(`✅ لا بذر للجهات الصحية أو الأقسام — الحالية: ${hospitalsCount} جهة، ${departmentsCount} قسم (من الإدارة فقط)`)

  const nursesCount = await prisma.user.count({ where: { role: 'NURSE' } })
  const receiversCount = await prisma.user.count({ where: { role: 'RECEIVER' } })
  console.log(`\n🎉 التجهيز اكتمل — المنصة نظيفة بلا أي حسابات وهمية`)
  console.log(`   الكادر التمريضي الحالي: ${nursesCount} | المستلمون الإداريون: ${receiversCount}`)
  console.log(`   الحسابات الحقيقية تُنشأ من التسجيل أو من لوحة الإدارة\n`)
}

main()
  .catch((e) => {
    console.error('\n❌ فشل تجهيز قاعدة البيانات:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
