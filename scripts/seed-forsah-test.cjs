/**
 * بيانات اختبار «فرصة» على PostgreSQL المحلي — تكليفات | Takleefat
 * ============================================================
 * يُنشئ حسابات اختبار وكتالوجات وفرصة جاهزة للفحص الشامل للدورة الكاملة.
 * للاستخدام المحلي حصراً (DATABASE_URL يشير لقاعدة الاختبار).
 * الاستخدام: DATABASE_URL=... node scripts/seed-forsah-test.cjs
 */
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const db = new PrismaClient()

async function main() {
  const hash = (p) => bcrypt.hashSync(p, 10)

  // الإدارة (نفس حساب البيئة ليطابق تسجيل الدخول في الاختبار)
  const adminPhone = process.env.ADMIN_PHONE || '773178684'
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin12345'
  await db.user.upsert({
    where: { phone: adminPhone },
    update: { role: 'ADMIN', status: 'APPROVED' },
    create: {
      name: 'مدير النظام',
      phone: adminPhone,
      password: hash(adminPassword),
      role: 'ADMIN',
      status: 'APPROVED',
      forsahPermissions: [],
    },
  })

  // حساب HR للاختبار
  const hr = await db.user.upsert({
    where: { phone: '770100200' },
    update: { role: 'HR', status: 'APPROVED' },
    create: {
      name: 'سامي عبدالله',
      phone: '770100200',
      password: hash('Forsah1234'),
      role: 'HR',
      status: 'APPROVED',
      hospitalName: 'مستشفى الثورة العام',
      jobTitle: 'مدير التوظيف',
      forsahPermissions: [
        'opportunity.view', 'opportunity.create', 'opportunity.edit', 'opportunity.publish',
        'opportunity.pause', 'opportunity.viewApplicants', 'opportunity.inviteInterview',
        'opportunity.selectCandidate', 'opportunity.viewFinancials', 'opportunity.viewCommission',
      ],
    },
  })

  // كتالوجات أساسية
  const hospital = await db.hospital.upsert({
    where: { name: 'مستشفى الثورة العام' },
    update: {},
    create: { name: 'مستشفى الثورة العام', location: 'صنعاء — شارع الزراعة', city: 'صنعاء', type: 'HOSPITAL', status: 'ACTIVE', isActive: true },
  })
  const dept = await db.department.upsert({
    where: { name: 'عناية مركزة' },
    update: {},
    create: { name: 'عناية مركزة', isActive: true },
  })
  const dept2 = await db.department.upsert({
    where: { name: 'طوارئ' },
    update: {},
    create: { name: 'طوارئ', isActive: true },
  })
  const spec = await db.specialty.upsert({
    where: { name: 'باطنية' },
    update: {},
    create: { name: 'باطنية', isActive: true },
  })
  const qualN = await db.qualification.upsert({
    where: { name: 'دبلوم ثلاث سنوات' },
    update: {},
    create: { name: 'دبلوم ثلاث سنوات', audience: 'NURSE', isActive: true },
  })
  const qualD = await db.qualification.upsert({
    where: { name: 'بكالوريوس طب وجراحة' },
    update: {},
    create: { name: 'بكالوريوس طب وجراحة', audience: 'DOCTOR', isActive: true },
  })

  // كادر تمريضي مؤهل (أنثى، عناية مركزة، دبلوم، 3 سنوات، مستندات معتمدة)
  const nurse = await db.user.upsert({
    where: { phone: '770300400' },
    update: { status: 'APPROVED' },
    create: {
      name: 'أمل محمد',
      phone: '770300400',
      password: hash('Nurse1234'),
      role: 'NURSE',
      status: 'APPROVED',
      gender: 'FEMALE',
      qualification: 'دبلوم ثلاث سنوات',
      yearsOfExperience: 3,
      workDepartments: { create: [{ departmentId: dept.id }, { departmentId: dept2.id }] },
    },
  })
  // مستند معتمد للكادر
  const nurseDocs = await db.document.count({ where: { userId: nurse.id } })
  if (nurseDocs === 0) {
    await db.document.create({
      data: { userId: nurse.id, type: 'ID_CARD', title: 'الهوية الشخصية', fileUrl: '/files/test-id.jpg', fileName: 'test-id.jpg', status: 'APPROVED' },
    })
  }

  // كادر غير مؤهل (ذكر، لا أقسام عمل — لاختبار فلترة الأهلية)
  const nurse2 = await db.user.upsert({
    where: { phone: '770300500' },
    update: { status: 'APPROVED' },
    create: {
      name: 'خالد أحمد',
      phone: '770300500',
      password: hash('Nurse1234'),
      role: 'NURSE',
      status: 'APPROVED',
      gender: 'MALE',
      qualification: 'أورديلي سنة',
      yearsOfExperience: 1,
    },
  })

  // طبيب مؤهل
  const doctor = await db.user.upsert({
    where: { phone: '770500600' },
    update: { status: 'APPROVED' },
    create: {
      name: 'فهد سعيد',
      phone: '770500600',
      password: hash('Doctor1234'),
      role: 'DOCTOR',
      status: 'APPROVED',
      gender: 'MALE',
      qualification: 'بكالوريوس طب وجراحة',
      yearsOfExperience: 6,
      workSpecialties: { create: [{ specialtyId: spec.id }] },
    },
  })
  const doctorDocs = await db.document.count({ where: { userId: doctor.id } })
  if (doctorDocs === 0) {
    await db.document.createMany({
      data: [
        { userId: doctor.id, type: 'PRACTICE_LICENSE', title: 'ترخيص مزاولة المهنة', fileUrl: '/files/test-license.jpg', fileName: 'test-license.jpg', status: 'APPROVED' },
      ],
    })
  }

  console.log('SEED OK:')
  console.log('  ADMIN:', adminPhone, '/', adminPassword)
  console.log('  HR: 770100200 / Forsah1234 (id:', hr.id + ')')
  console.log('  NURSE مؤهل: 770300400 / Nurse1234')
  console.log('  NURSE غير مؤهل: 770300500 / Nurse1234')
  console.log('  DOCTOR: 770500600 / Doctor1234')
  console.log('  HOSPITAL:', hospital.id, '| DEPT:', dept.name, '| SPEC:', spec.name)
}

main()
  .catch((e) => {
    console.error('SEED FAILED:', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
