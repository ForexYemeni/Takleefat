/* eslint-disable @typescript-eslint/no-require-imports */
/* ============================================================
 * تكليفات | Takleefat — قاعدة بيانات وهمية (Seed)
 * ------------------------------------------------------------
 * ينشئ حسابات تجريبية جاهزة + تكليفات ومستندات وإشعارات تجريبية
 * الاستخدام:
 *   npx prisma db push        (إنشاء الجداول أولاً)
 *   npx prisma db seed        (تعبئة البيانات الوهمية)
 *
 * الحسابات التجريبية (إن لم تُضبط ADMIN_PHONE / ADMIN_PASSWORD):
 *   مدير النظام      773178684   Admin@1234
 *   ممرضة (معتمدة)   711111111   Nurse@1234
 *   ممرضة (معلّقة)   722222222   Nurse@1234
 *   مستلم إداري      733333333   Receiver@1234
 * ============================================================ */

const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

// أرقام يمنية (تبدأ بـ 7 و 9 أرقام) — يمكن تعديلها من متغيرات البيئة
const ADMIN_PHONE = process.env.ADMIN_PHONE || '773178684'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@1234'

async function main() {
  console.log('\n🌱 تكليفات | Takleefat — تعبئة البيانات الوهمية...\n')

  const hash = (pwd) => bcrypt.hashSync(pwd, 12)

  // ---------- 1) حسابات المستخدمين ----------
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

  const nurse = await prisma.user.upsert({
    where: { phone: '711111111' },
    update: {},
    create: {
      name: 'سارة أحمد',
      phone: '711111111',
      password: hash('Nurse@1234'),
      role: 'NURSE',
      status: 'APPROVED',
      specialty: 'تمريض عام',
      qualification: 'بكالوريوس تمريض',
      yearsOfExperience: 5,
      gender: 'FEMALE',
    },
  })

  // ممرضة معلّقة لتجربة مسار "اعتماد الحسابات" من لوحة المدير
  const pendingNurse = await prisma.user.upsert({
    where: { phone: '722222222' },
    update: {},
    create: {
      name: 'نور محمد',
      phone: '722222222',
      password: hash('Nurse@1234'),
      role: 'NURSE',
      status: 'PENDING',
      specialty: 'تمريض أطفال',
      qualification: 'دبلوم تمريض',
      yearsOfExperience: 2,
    },
  })

  const receiver = await prisma.user.upsert({
    where: { phone: '733333333' },
    update: {},
    create: {
      name: 'خالد عبدالله',
      phone: '733333333',
      password: hash('Receiver@1234'),
      role: 'RECEIVER',
      status: 'APPROVED',
    },
  })

  console.log('✅ الحسابات:')
  console.log(`   مدير       → ${admin.phone} / ${ADMIN_PASSWORD}`)
  console.log(`   ممرضة      → ${nurse.phone} / Nurse@1234 (معتمدة)`)
  console.log(`   ممرضة      → ${pendingNurse.phone} / Nurse@1234 (معلّقة — جرّب اعتمادها)`)
  console.log(`   مستلم إداري → ${receiver.phone} / Receiver@1234`)

  // ---------- 2) إعدادات المنصة (الرسوم وطرق الدفع) ----------
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

  // ---------- 3) مستندات تجريبية للكادر ----------
  const demoFile = '/demo/sample-document.txt'
  const docsCount = await prisma.document.count({ where: { userId: nurse.id } })
  if (docsCount === 0) {
    await prisma.document.createMany({
      data: [
        {
          userId: nurse.id,
          type: 'PRACTICE_LICENSE',
          title: 'صورة المزاولة',
          fileUrl: demoFile,
          fileName: 'practice-license.txt',
          fileSize: 120,
          mimeType: 'text/plain',
          status: 'APPROVED',
          reviewedById: admin.id,
          reviewedAt: new Date(),
        },
        {
          userId: nurse.id,
          type: 'ID_CARD',
          title: 'الهوية الشخصية',
          fileUrl: demoFile,
          fileName: 'id-card.txt',
          fileSize: 120,
          mimeType: 'text/plain',
          status: 'PENDING',
        },
      ],
    })
    console.log('✅ مستندات تجريبية للكادر (معتمد + بانتظار المراجعة)')
  }

  // ---------- 3) تكليفات تجريبية ----------
  const today = new Date()
  const inDays = (n) => new Date(today.getTime() + n * 24 * 60 * 60 * 1000)
  const existingAssignments = await prisma.assignment.count()
  if (existingAssignments === 0) {

    // تكليف نشط
    const active = await prisma.assignment.create({
      data: {
        title: 'تكليف تمريضي — قسم الطوارئ',
        description:
          'تغطية وردية صباحية بقسم الطوارئ مع متابعة الحالات الحرجة وتوثيق العلامات الحيوية.',
        facility: 'مستشفى المركزي',
        department: 'الطوارئ',
        startDate: today,
        endDate: inDays(14),
        status: 'ACTIVE',
        nurseId: nurse.id,
        receiverId: receiver.id,
        createdById: admin.id,
        logs: {
          create: [
            { userId: admin.id, action: 'إنشاء التكليف', note: 'تم إنشاء التكليف وإسناده للكادر' },
          ],
        },
      },
    })
    await prisma.notification.create({
      data: {
        userId: nurse.id,
        title: 'تكليف جديد',
        body: 'تم إسناد تكليف (قسم الطوارئ) إليك — برجاء مراجعة التفاصيل',
        type: 'ASSIGNMENT_CREATED',
        link: '/nurse/assignments',
      },
    })

    // تكليف تم استلامه
    const received = await prisma.assignment.create({
      data: {
        title: 'تكليف رعاية مرضى المركّز',
        description: 'متابعة مرضى العناية المركزة وتحديث التقارير الطبية بشكل يومي.',
        facility: 'مستشفى الأمل',
        department: 'العناية المركزة',
        startDate: inDays(-3),
        endDate: inDays(21),
        status: 'RECEIVED',
        nurseId: nurse.id,
        receiverId: receiver.id,
        createdById: admin.id,
        receivedAt: inDays(-2),
        logs: {
          create: [
            { userId: admin.id, action: 'إنشاء التكليف', note: 'تم إنشاء التكليف وإسناده للكادر' },
            { userId: receiver.id, action: 'تأكيد الاستلام', note: 'تم استلام الكادر وتوثيق ذلك إلكترونياً' },
          ],
        },
      },
    })
    await prisma.notification.create({
      data: {
        userId: admin.id,
        title: 'تأكيد استلام',
        body: 'تم استلام تكليف (رعاية مرضى المركّز) إلكترونياً من المستلم الإداري',
        type: 'ASSIGNMENT_RECEIVED',
        link: '/admin/assignments',
      },
    })

    // تكليف مكتمل
    const completed = await prisma.assignment.create({
      data: {
        title: 'تكليف معمل ومتابعة الحالات',
        description: 'العمل بمختبر المستشفى ومتابعة نتائج التحاليل وتسجيلها.',
        facility: 'مستشفى الرعاية التخصصي',
        department: 'المختبر',
        startDate: inDays(-30),
        endDate: inDays(-2),
        status: 'COMPLETED',
        nurseId: nurse.id,
        receiverId: receiver.id,
        createdById: admin.id,
        receivedAt: inDays(-29),
        logs: {
          create: [
            { userId: admin.id, action: 'إنشاء التكليف', note: 'تم إنشاء التكليف وإسناده للكادر' },
            { userId: receiver.id, action: 'تأكيد الاستلام', note: 'تم استلام الكادر' },
            { userId: admin.id, action: 'إنهاء التكليف', note: 'اكتملت فترة التكليف بنجاح' },
          ],
        },
      },
    })

    console.log('✅ تكليفات تجريبية: نشط + مُستلَم + مكتمل (مع سجل أحداث لكل تكليف)')

    // ---------- 4) إشعارات للمستلم الإداري ----------
    await prisma.notification.createMany({
      data: [
        {
          userId: receiver.id,
          title: 'تكليف جديد بانتظار الاستلام',
          body: 'تم إنشاء تكليف (قسم الطوارئ) — بانتظار توثيق الاستلام منك',
          type: 'ASSIGNMENT_CREATED',
          link: '/receiver/assignments',
        },
        {
          userId: receiver.id,
          title: 'مرحباً بك في تكليفات',
          body: 'تم اعتماد حسابك — يمكنك الآن توثيق استلام التكليفات إلكترونياً',
          type: 'ACCOUNT_APPROVED',
          link: '/receiver',
        },
      ],
    })
    console.log('✅ إشعارات تجريبية للأطراف الثلاثة')
  } else {
    console.log('ℹ️  يوجد تكليفات مسبقة — تم تجاهل إضافة تكليفات تجريبية جديدة')
  }

  // ---------- 3-b) الجهات الصحية والأقسام (قوائم الإدارة) — تُبذر دائماً ----------
  // (لا تربطها بوجود التكليفات — قوائم اختيار أساسية يجب أن تكون جاهزة دوماً،
  //  upsert آمن للتكرار لا يمس البيانات المضافة من الإدارة)
  const hospitalsData = [
    { name: 'مستشفى الملكية', location: 'صنعاء — شارع حدة' },
    { name: 'مستشفى الثورة العام', location: 'صنعاء — شارع الزراعة' },
    { name: 'مستشفى الولادة والأطفال', location: 'صنعاء — السبعين' },
    { name: 'مستشفى الحباري', location: 'عدن — خور مكسر' },
    { name: 'مركز الرازي', location: 'تعز — الحوبان' },
  ]
  for (const h of hospitalsData) {
    await prisma.hospital.upsert({ where: { name: h.name }, update: {}, create: h })
  }
  const departmentsData = ['عناية', 'طوارئ', 'رقود', 'حضانة', 'قبالة', 'مختبر']
  for (const name of departmentsData) {
    await prisma.department.upsert({ where: { name }, update: {}, create: { name } })
  }
  console.log('✅ الجهات الصحية (5) والأقسام الطبية (6) جاهزة في قوائم الإدارة')

  // ---------- تكليف مُعلن مفتوح للتقديم (فقط إذا لا توجد تكليفات معلنة) ----------
  const existingPosts = await prisma.post.count()
  if (existingPosts === 0) {
      const openPost = await prisma.post.create({
        data: {
          number: 1,
          title: 'التكليف رقم 1',
          description:
            'مطلوب كادر تمريضي لقسم العناية — وردية صباحية 8 ساعات — متابعة الحالات الحرجة وتوثيقها. يُرجى التقديم مع إرفاق المستندات.',
          facility: 'مستشفى الملكية',
          department: 'عناية',
          location: 'صنعاء — شارع حدة',
          startDate: inDays(3),
          hours: 8,
          gender: 'ANY',
          nursesNeeded: 2,
          value: 120000,
          status: 'OPEN',
          receiverId: receiver.id,
        },
      })
      // تقديم معلّق من الكادر المعتمد ليظهر للاستلم الإداري للمراجعة
      await prisma.application.create({
        data: {
          postId: openPost.id,
          nurseId: nurse.id,
          coverNote: 'لدي خبرة 5 سنوات في العناية المركزة وشهادة مزاولة سارية — جاهزة للبدء فوراً.',
          status: 'PENDING',
        },
      })
      await prisma.notification.create({
        data: {
          userId: receiver.id,
          title: 'تقديم جديد على تكليفك',
          body: `${nurse.name} قدّم على التكليف (${openPost.title}) — راجع السيرة الذاتية واعتمد أو ارفض`,
          type: 'APPLICATION_SUBMITTED',
          link: '/receiver/assignments',
        },
      })
      console.log('✅ تكليف مُعلن مفتوح للتقديم + تقديم بانتظار المراجعة')
    }

  console.log('\n🎉 تمت تعبئة قاعدة البيانات الوهمية بنجاح — يمكنك الآن تسجيل الدخول بجميع الحسابات\n')
}

main()
  .catch((e) => {
    console.error('\n❌ فشل تعبئة البيانات:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
