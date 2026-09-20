# -*- coding: utf-8 -*-
"""
ترقيع مؤقت للفحص البصري المعزول (VISUAL_CHECK=1) — الجولة 65
يُرَقّع: middleware + admin layout + مسارات API الإدارية الخمسة + stats
كل ترقيع يُعلَّم بـ [VISUAL_CHECK] ويُستعاد عبر git checkout قبل الرفع.
"""
import sys, shutil, pathlib

ROOT = pathlib.Path('/home/z/my-project')
BAK = ROOT / '.shots/orig-catalog5'

FILES = [
    'middleware.ts',
    'app/admin/layout.tsx',
    'app/api/admin/users/route.ts',
    'app/api/admin/specialties/route.ts',
    'app/api/admin/departments/route.ts',
    'app/api/admin/qualifications/route.ts',
    'app/api/stats/route.ts',
]

def patch(rel, old, new):
    p = ROOT / rel
    txt = p.read_text(encoding='utf-8')
    if '[VISUAL_CHECK]' in txt and old not in txt:
        print(f'  ~ {rel}: مُرقّع مسبقاً — تخطٍ')
        return
    assert old in txt, f'ANCHOR NOT FOUND in {rel}: {old[:60]!r}'
    p.write_text(txt.replace(old, new, 1), encoding='utf-8')
    print(f'  + {rel}')

def main():
    BAK.mkdir(parents=True, exist_ok=True)
    for rel in FILES:
        shutil.copy2(ROOT / rel, BAK / pathlib.Path(rel).name)
    print('backups ->', BAK)

    # 1) middleware — تجاوز المصادقة أثناء الفحص
    patch('middleware.ts',
        "export async function middleware(req: NextRequest) {\n  const { pathname } = req.nextUrl",
        "export async function middleware(req: NextRequest) {\n  // [VISUAL_CHECK] تجاوز مؤقت للفحص البصري — يُستعاد قبل الرفع\n  if (process.env.VISUAL_CHECK === '1') return NextResponse.next()\n\n  const { pathname } = req.nextUrl")

    # 2) admin layout — جلسة محاكاة
    patch('app/admin/layout.tsx',
        "  const session = await getServerSession(authOptions)",
        "  // [VISUAL_CHECK] جلسة محاكاة للفحص البصري — تُستعاد قبل الرفع\n  const session: any =\n    process.env.VISUAL_CHECK === '1'\n      ? { user: { id: 'visual-check', name: 'مدير النظام', role: 'ADMIN', activeRole: 'ADMIN' } }\n      : await getServerSession(authOptions)")

    # 3) users — مستلمون + مشرفون بأسماء عربية طويلة واقعية (درس ج63)
    users_mock = """    // [VISUAL_CHECK] بيانات محاكاة للفحص البصري — تُستعاد قبل الرفع
    if (process.env.VISUAL_CHECK === '1') {
      const role = req.nextUrl.searchParams.get('role') ?? 'RECEIVER'
      const mk = (i: number, name: string, phone: string, role: string, status: string, hospitalName: string | null, commissionPercent: number | null, fullProfileAccess: boolean, trustedContactViewer: boolean, docs: number, assignments: number, days: number) => ({
        id: `vc-${role}-${i}`,
        name, phone, role, status, hospitalName, commissionPercent, fullProfileAccess, trustedContactViewer,
        createdAt: new Date(Date.now() - days * 86400000).toISOString(),
        documents: Array.from({ length: docs }, (_, d) => ({ type: 'ID', status: d % 2 ? 'APPROVED' : 'PENDING' })),
        affiliations: [],
        _count: { documents: docs, assignments },
      })
      const all = [
        mk(1, 'م. سالم عبدالله محمد الشرعبي الضبيبي', '771102345', role, 'APPROVED', 'مستشفى الجمهوري التعليمي العالي — صنعاء', 7, true, true, 4, 12, 220),
        mk(2, 'أحمد يحيى قائد المروني الحميري', '733556780', role, 'APPROVED', 'مجمع الشفاء الطبي الحديث للاستشفاء والعلاج', null, false, true, 2, 5, 150),
        mk(3, 'فاطمة علي حسن الصبري الحضرمية', '770991122', role, 'PENDING', null, null, false, false, 1, 0, 9),
        mk(4, 'عبدالرحمن غالب المهدي الصلاحي', '712334455', role, 'APPROVED', 'مستشفى الأمل التخصصي للأمراض والجراحات الدقيقة', 5, true, false, 7, 23, 310),
        mk(5, 'نجاة محمد صالح العمراني العامري', '738221100', role, 'SUSPENDED', 'مستشفى التوثيق العام الفرع الجديد', null, false, false, 3, 8, 95),
      ]
      return NextResponse.json({ users: all.filter((u) => u.role === role), autoSharePercent: 5 })
    }
"""
    patch('app/api/admin/users/route.ts',
        "export async function GET(req: NextRequest) {\n  try {\n",
        "export async function GET(req: NextRequest) {\n  try {\n" + users_mock)

    # 4) specialties — 11 تخصصاً بأسماء طويلة
    sp_mock = """    // [VISUAL_CHECK] بيانات محاكاة للفحص البصري — تُستعاد قبل الرفع
    if (process.env.VISUAL_CHECK === '1') {
      const s = (n: number, name: string, isActive: boolean, doctors: number) => ({
        id: `vc-sp-${n}`, name, isActive, _count: { doctors },
      })
      return NextResponse.json({ specialties: [
        s(1, 'الباطنية العامة والأمراض المزمنة', true, 12),
        s(2, 'الجراحة العامة وجراحة المناظير', true, 8),
        s(3, 'طب الأطفال وحديثي الولادة', true, 6),
        s(4, 'النساء والتوليد وأمراض النساء', true, 9),
        s(5, 'أمراض القلب والأوعية الدموية والقسطرة', true, 4),
        s(6, 'المخ والأعصاب والطب النفسي العصبي', true, 2),
        s(7, 'جراحة العظام والمفاصل والكسور والرضوض', true, 5),
        s(8, 'العيون والجفون المدارية والشبكية', true, 3),
        s(9, 'الأنف والأذن والحنجرة — جراحة الرأس والرقبة', true, 1),
        s(10, 'الجلدية والتناسلية والأمراض الجلدية المناظيرية', false, 0),
        s(11, 'الأمراض المعدية والحميات والوبائيات الحادة والمزمنة', false, 0),
      ] })
    }
"""
    patch('app/api/admin/specialties/route.ts',
        "export async function GET() {\n  try {\n    await requireRole('ADMIN')",
        "export async function GET() {\n  try {\n" + sp_mock + "    await requireRole('ADMIN')")

    # 5) departments — 10 أقساماً
    dp_mock = """    // [VISUAL_CHECK] بيانات محاكاة للفحص البصري — تُستعاد قبل الرفع
    if (process.env.VISUAL_CHECK === '1') {
      const d = (n: number, name: string, isActive: boolean, nurses: number) => ({
        id: `vc-dp-${n}`, name, isActive, _count: { nurses },
      })
      return NextResponse.json({ departments: [
        d(1, 'العناية المركزة والحرجة', true, 14),
        d(2, 'الطوارئ والحوادث والإسعاف', true, 11),
        d(3, 'الرقود والباطنية', true, 7),
        d(4, 'حضانة الأطفال والخدج', true, 6),
        d(5, 'القبالة والتوليد والولادة', true, 9),
        d(6, 'المختبرات الطبية والأمراض', true, 4),
        d(7, 'الأشعة والتصوير الطبي التشخيصي', true, 3),
        d(8, 'غرف العمليات والتعقيم المركزي', true, 8),
        d(9, 'الغسيل الكلوي ووحدة الكلى', true, 2),
        d(10, 'التغذية العلاجية والإكلينيكية', false, 0),
      ] })
    }
"""
    patch('app/api/admin/departments/route.ts',
        "export async function GET() {\n  try {\n    await requireRole('ADMIN')",
        "export async function GET() {\n  try {\n" + dp_mock + "    await requireRole('ADMIN')")

    # 6) qualifications — كتالوج + مستخدمون
    q_mock = """    // [VISUAL_CHECK] بيانات محاكاة للفحص البصري — تُستعاد قبل الرفع
    if (process.env.VISUAL_CHECK === '1') {
      const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString()
      const cat = [
        { id: 'vc-q1', name: 'ثانوية قسم تمريض', audience: 'NURSE', isActive: true, createdAt: daysAgo(400), usersCount: 24 },
        { id: 'vc-q2', name: 'دبلوم متوسط في التمريض العام', audience: 'NURSE', isActive: true, createdAt: daysAgo(390), usersCount: 18 },
        { id: 'vc-q3', name: 'بكالوريوس علوم تمريض', audience: 'NURSE', isActive: true, createdAt: daysAgo(380), usersCount: 33 },
        { id: 'vc-q4', name: 'دبلوم عالي في العناية المركزة والقلبية', audience: 'NURSE', isActive: true, createdAt: daysAgo(300), usersCount: 7 },
        { id: 'vc-q5', name: 'بكالوريوس طب وجراحة عامة', audience: 'DOCTOR', isActive: true, createdAt: daysAgo(370), usersCount: 9 },
        { id: 'vc-q6', name: 'ماجرستير في طب القلب التداخلي', audience: 'DOCTOR', isActive: true, createdAt: daysAgo(200), usersCount: 2 },
        { id: 'vc-q7', name: 'دكتوراه في العلوم الطبية الإكلينيكية', audience: 'DOCTOR', isActive: false, createdAt: daysAgo(190), usersCount: 0 },
        { id: 'vc-q8', name: 'شهادة المزاولة المهنية للتمريض', audience: 'NURSE', isActive: false, createdAt: daysAgo(160), usersCount: 1 },
      ]
      const us = [
        { id: 'vc-u1', name: 'السيدة/ أمال محمد قاسم الأغبري الشامي', phone: '777001122', role: 'NURSE', status: 'APPROVED', specialty: 'العناية المركزة والحرجة', qualification: 'بكالوريوس علوم تمريض', yearsOfExperience: 8, hospitalName: null, createdAt: daysAgo(280), affiliations: [{ hospital: { name: 'مستشفى الجمهوري التعليمي العالي — صنعاء' } }], _count: { documents: 5 } },
        { id: 'vc-u2', name: 'عبدالله سالم أحمد البكري المقطري', phone: '712445566', role: 'NURSE', status: 'APPROVED', specialty: 'الطوارئ والحوادث والإسعاف', qualification: 'دبلوم متوسط في التمريض العام', yearsOfExperience: 5, hospitalName: null, createdAt: daysAgo(240), affiliations: [], _count: { documents: 3 } },
        { id: 'vc-u3', name: 'د. هيثم ناجي عبده الحداد الصامتي', phone: '733889900', role: 'DOCTOR', status: 'APPROVED', specialty: 'أمراض القلب والأوعية الدموية والقسطرة', qualification: 'ماجرستير في طب القلب التداخلي', yearsOfExperience: 12, hospitalName: null, createdAt: daysAgo(420), affiliations: [{ hospital: { name: 'مجمع الشفاء الطبي الحديث للاستشفاء والعلاج' } }], _count: { documents: 6 } },
        { id: 'vc-u4', name: 'د. رنا شوقي علي المحروشي الزبيدية', phone: '770554433', role: 'DOCTOR', status: 'PENDING', specialty: 'طب الأطفال وحديثي الولادة', qualification: null, yearsOfExperience: 3, hospitalName: null, createdAt: daysAgo(15), affiliations: [], _count: { documents: 1 } },
        { id: 'vc-u5', name: 'سعاد ناصر حسين الحبيشي العمري', phone: '738112233', role: 'NURSE', status: 'APPROVED', specialty: null, qualification: null, yearsOfExperience: 2, hospitalName: 'مستشفى الأمل التخصصي للأمراض والجراحات الدقيقة', createdAt: daysAgo(60), affiliations: [], _count: { documents: 2 } },
      ]
      return NextResponse.json({ users: us, catalog: cat })
    }
"""
    patch('app/api/admin/qualifications/route.ts',
        "export async function GET() {\n  try {\n",
        "export async function GET() {\n  try {\n" + q_mock)

    # 7) stats — قيمة صفرية للشارات
    patch('app/api/stats/route.ts',
        "export async function GET() {\n  try {\n",
        "export async function GET() {\n  try {\n    // [VISUAL_CHECK] محاكاة للفحص البصري — تُستعاد قبل الرفع\n    if (process.env.VISUAL_CHECK === '1') return NextResponse.json({ pendingApplications: 0 })\n")

    print('ALL PATCHED OK')

if __name__ == '__main__':
    sys.exit(main())
