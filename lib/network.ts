import { db } from '@/lib/db'
import type { Gender, Post, DistributionMethod, Audience } from '@prisma/client'

/**
 * شبكة الكوادر الصحية المعتمدة | Verified Healthcare Workforce Network
 * مكتبة المطابقة الذكية وخصوصية التوزيع والنشر التدريجي — تُستخدم من كل واجهات API
 * منظومة الأطباء: نفس المحرك يعمل لجمهور NURSE (أقسام العمل) وجمهور DOCTOR (تخصصات العمل)
 */

/** دور الجمهور المستهدف من التكليف — يحدد من يرى ويقدّم */
export function audienceRole(audience: Audience | null | undefined): 'NURSE' | 'DOCTOR' {
  return audience === 'DOCTOR' ? 'DOCTOR' : 'NURSE'
}

/** رابط لوحة الجمهور — للإشعارات الموجهة */
export function audienceAssignmentsLink(audience: Audience | null | undefined): string {
  return audience === 'DOCTOR' ? '/doctor/assignments' : '/nurse/assignments'
}

// ---------- تسميات الحالات ----------

export const AFFILIATION_STATUS_LABELS: Record<string, string> = {
  WORKING: 'يعمل حالياً',
  FORMER: 'عمل سابقاً',
  INTERVIEWED: 'تمت مقابلته',
  ENDORSED: 'معتمد',
  ON_CALL: 'تحت الإستدعاء',
  PENDING: 'قيد المراجعة',
  EXTERNAL: 'خارجي مؤهل',
  UNENDORSED: 'غير معتمد',
  SUSPENDED: 'موقوف',
}

/**
 * الجولتان 42/43 — خيارات الحالة المهنية لكادر الجهة التي يديرها مسؤول الجهة
 * (المستلم الإداري للكادر التمريضي / مشرف الأطباء للأطباء) في مسارين:
 * ① عند قبول طلب الانضمام يختار حالة الكادر في الجهة (الجولة 42)
 * ② وفي أي وقت بعدها يحوّل حالته بين هذه الخيارات الخمسة (الجولة 43)
 * الحالات الإدارية (قيد المراجعة/خارجي مؤهل/غير معتمد/موقوف) من حساب الإدارة حصراً.
 */
export const ORG_CADRE_STATUS_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: 'ENDORSED', label: 'معتمد', hint: 'يُحتسب ضمن «المعتمدين» في مجتمع كوادر الجهة' },
  { value: 'WORKING', label: 'يعمل حالياً', hint: 'عضو نشط في كوادر الجهة الآن' },
  { value: 'FORMER', label: 'يعمل سابقاً', hint: 'يُسجّل كعمل سابق في الجهة' },
  { value: 'ON_CALL', label: 'تحت الإستدعاء', hint: 'ضمن كوادر الجهة وجاهز للاستدعاء عند الحاجة' },
  { value: 'INTERVIEWED', label: 'تمت المقابلة معه', hint: 'يُسجّل بعد المقابلة — دون احتساب ضمن المعتمدين' },
]

/**
 * الجولة 43 — الحالات التي يمكن لمسؤول الجهة (المستلم/مشرف الأطباء) تعيينها
 * وتحويلها لكوادر جهته: الخمس حالات المهنية حصراً — قبولاً لطلب انضمام أو
 * تحويلاً لاحقاً لحالة عضو قائم. مصدر واحد للحقيقة تشاركه واجهتا PATCH/POST.
 */
export const ORG_MANAGEABLE_STATUSES = ['ENDORSED', 'WORKING', 'FORMER', 'ON_CALL', 'INTERVIEWED'] as const

export const ORG_TYPE_LABELS: Record<string, string> = {
  HOSPITAL: 'مستشفى',
  MEDICAL_CENTER: 'مركز طبي',
  SPECIALIZED_CENTER: 'مركز تخصصي',
  CLINIC: 'عيادة',
  MEDICAL_COMPLEX: 'مجمع طبي',
  OTHER: 'جهة صحية أخرى',
}

export const ORG_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'نشطة',
  INACTIVE: 'غير نشطة',
  SUSPENDED: 'معلقة',
  PENDING: 'بانتظار اعتماد الإدارة',
  REJECTED: 'مرفوضة',
}

export const DISTRIBUTION_LABELS: Record<string, string> = {
  ALL_MATCHING: 'نشر للجميع المطابقين',
  AUTO_MATCH: 'نشر تلقائي للمطابقين',
  INVITE_SELECTED: 'استدعاء ممرضين محددين',
  FAVORITES: 'اختيار من المفضلة',
  SAME_ORG: 'العاملون في نفس الجهة',
  ENDORSED: 'المعتمدون لدى الجهة',
  INTERVIEWED: 'المتقابَل معهم سابقاً',
  PROGRESSIVE: 'النشر التدريجي الذكي',
}

export const INVITATION_STATUS_LABELS: Record<string, string> = {
  PENDING: 'بانتظار الرد',
  ACCEPTED: 'مقبول',
  DECLINED: 'مرفوض',
  CANCELLED: 'ملغى',
  EXPIRED: 'منتهي',
}

/**
 * أولوية المطابقة (نجوم):
 * 5 مفضلون متوافقون ← 4 يعمل حالياً بالجهة ← 3 معتمد ← 2 تمت مقابلته ← 1 خارجي مؤهل
 */
export const MATCH_PRIORITY_LABELS: Record<number, string> = {
  5: 'مفضل ومتوافق — أولوية قصوى',
  4: 'يعمل حالياً في نفس الجهة',
  3: 'معتمد لدى الجهة',
  2: 'تمت مقابلته مسبقاً',
  1: 'خارجي مؤهل متوافق',
  0: 'مطابق للشروط الأساسية',
}

export const PROGRESSIVE_STAGES = [
  { stage: 0, label: 'المرحلة 1: الممرضون المفضلون', audience: 'FAVORITES' },
  { stage: 1, label: 'المرحلة 2: العاملون في نفس الجهة', audience: 'SAME_ORG' },
  { stage: 2, label: 'المرحلة 3: المعتمدون والمتقابَل معهم', audience: 'ENDORSED' },
  { stage: 3, label: 'المرحلة 4: الخارجيون المؤهلون المطابقون', audience: 'EXTERNAL_ALL' },
] as const

// ---------- فلترة الجنس (مستوى قاعدة البيانات والمنطق — ليست واجهة فقط) ----------

/**
 * هل يطابق الكادر الجنس المطلوب للتكليف؟
 * ANY: الجميع — MALE/FEMALE: المطابق حصراً. كادر بلا جنس مسجل لا يرى إلا تكليفات ANY.
 */
export function genderMatches(postGender: Gender, nurseGender: Gender | null | undefined): boolean {
  if (postGender === 'ANY') return true
  if (!nurseGender) return false
  return postGender === nurseGender
}

// ---------- الجهة الصحية للمستلم الإداري ----------

/**
 * الجهة الصحية المصرّح بها للمستلم الإداري — تُشتق من اسم الجهة المسجل في حسابه.
 * تُستخدم لتقييد إدارة الارتباطات وتسجيل المقابلات والاعتماد لجهته فقط.
 */
export async function resolveReceiverOrg(receiverId: string, hospitalName?: string | null) {
  let name = hospitalName ?? null
  if (!name) {
    const user = await db.user.findUnique({ where: { id: receiverId }, select: { hospitalName: true } })
    name = user?.hospitalName ?? null
  }
  if (!name) return null
  return db.hospital.findFirst({
    where: { name, status: { not: 'INACTIVE' } },
    // الجولة 38: type مطلوب لعرض نوع الجهة في مجتمع الكوادر
    select: { id: true, name: true, type: true, city: true, status: true },
  })
}

// ---------- شفاء الارتباطات المعلقة (إصلاح الجولة الثامنة) ----------

/**
 * شفاء الارتباطات المعلقة التي ما زالت PENDING لجهة صحية أصبحت نشطة:
 * سيناريو «أُضيف الكادر ثم اعتُمدت الجهة الصحية» — يعتمد الارتباط تلقائياً
 * على الحالة المطلوبة (requestedStatus) لأن اعتماد الجهة هو الموافقة المرجعية،
 * ويبقى حاجز التكليفات مفعلاً عبر حالة الحساب (PENDING) والمستندات لدى الإدارة.
 * تُستدعى بشكل كسول عند قراءة قوائم الكوادر (نفس نمط escalateDueProgressivePosts)
 * — آمنة للتكرار (idempotent) ولا تمس طلبات الكادر لجهات نشطة أصلاً.
 */
export async function healReceiverPendingAffiliations(hospitalId?: string): Promise<number> {
  const stuck = await db.nurseAffiliation.findMany({
    where: {
      status: 'PENDING',
      ...(hospitalId ? { hospitalId } : {}),
      hospital: { status: 'ACTIVE' },
      requestedBy: { role: 'RECEIVER' },
    },
    select: { id: true, requestedStatus: true },
    take: 100,
  })
  if (stuck.length === 0) return 0

  let healed = 0
  for (const aff of stuck) {
    const res = await db.nurseAffiliation.updateMany({
      where: { id: aff.id, status: 'PENDING' },
      data: {
        status: aff.requestedStatus ?? 'WORKING',
        reviewedAt: new Date(),
      },
    })
    healed += res.count
  }
  return healed
}

// ---------- معاينة جمهور التكليف الحية (الجولة العاشرة) ----------

export interface AudiencePreviewResult {
  distribution: string
  total: number
  breakdown: {
    favorites: number
    working: number
    endorsed: number
    interviewed: number
    external: number
    former: number
    basic: number
    /** المطابقة العلائقية حصراً — كوادر أضافوا القسم ضمن أقسام عملهم */
    departmentMatch: number
  }
  /** عدد الكوادر المصرّحين بقسم التكليف ضمن أقسام عملهم (مطابقة علائقية) */
  departmentMatch: number
  /** عدد من ستصلهم الإشعارات الفورية فور النشر (وفق طريقة التوزيع والقسم) */
  directNotify: number
  /** اسم القسم المطلوب كما مُرّر للمعاينة */
  departmentName: string | null
  /** عدادات مراحل النشر التدريجي — تُملأ فقط عند distribution = PROGRESSIVE */
  progressive?: { stage0: number; stage1: number; stage2: number; stage3: number }
}

/**
 * معاينة حية لجمهور تكليف قبل نشره — بنفس منطق canNurseSeePost حرفياً
 * (فلتر الجنس + خصوصية التوزيع + مطابقة القسم) حتى يطابق العدد المتوقع
 * ما يحدث فعلاً بعد النشر دون أي مفاجأة.
 */
export async function getAudiencePreview(opts: {
  receiverId: string
  hospitalId?: string | null
  department?: string | null
  gender?: Gender | null
  distribution?: string | null
  /** جمهور التكليف — NURSE (كادر تمريضي) أو DOCTOR (أطباء — منظومة الأطباء) */
  audience?: Audience | null
}): Promise<AudiencePreviewResult> {
  const role = audienceRole(opts.audience)
  const genderWhere = opts.gender && opts.gender !== 'ANY' ? { gender: opts.gender } : {}
  const base = { role, status: 'APPROVED' as const, ...genderWhere }

  const [nurses, favorites] = await Promise.all([
    db.user.findMany({
      where: base,
      select: { id: true, specialty: true, qualification: true },
    }),
    db.favoriteNurse.findMany({ where: { receiverId: opts.receiverId }, select: { nurseId: true } }),
  ])
  const nurseIds = nurses.map((n) => n.id)
  // خريطة أقسام/تخصصات العمل — علائقية حسب الجمهور
  const workDeptsMap =
    role === 'DOCTOR' ? await getSpecialtiesMap(nurseIds) : await getWorkDepartmentsMap(nurseIds)
  const affs =
    opts.hospitalId && nurseIds.length > 0
      ? await db.nurseAffiliation.findMany({
          where: { hospitalId: opts.hospitalId, nurseId: { in: nurseIds } },
          select: { nurseId: true, status: true },
        })
      : []

  const favSet = new Set(favorites.map((f) => f.nurseId))
  const affMap = new Map(affs.map((a) => [a.nurseId, a.status as string]))

  const dept = (opts.department ?? '').trim()
  const deptMatch = (n: { id: string; specialty: string | null; qualification: string | null }): boolean => {
    if (!dept) return false
    // علائقياً أولاً: القسم ضمن أقسام عمله المصرّح بها
    if ((workDeptsMap.get(n.id) ?? []).includes(dept)) return true
    const hay = `${n.specialty ?? ''} ${n.qualification ?? ''}`.trim()
    if (!hay) return false
    return hay.includes(dept) || dept.includes(hay)
  }
  // المطابقة العلائقية حصراً — كوادر أضافوا القسم ضمن أقسام عملهم من كتالوج الإدارة
  const relationalDeptMatch = (nurseId: string): boolean =>
    !!dept && (workDeptsMap.get(nurseId) ?? []).includes(dept)
  const affIs = (nurseId: string, statuses: string[]): boolean =>
    statuses.includes(affMap.get(nurseId) ?? '')

  // التوزيع الهرمي حسب الأولوية — لعرض الشرائح
  const breakdown: AudiencePreviewResult['breakdown'] = {
    favorites: 0,
    working: 0,
    endorsed: 0,
    interviewed: 0,
    external: 0,
    former: 0,
    basic: 0,
    departmentMatch: 0,
  }
  for (const n of nurses) {
    if (favSet.has(n.id)) breakdown.favorites++
    const st = affMap.get(n.id)
    if (st === 'WORKING') breakdown.working++
    else if (st === 'ENDORSED') breakdown.endorsed++
    else if (st === 'INTERVIEWED') breakdown.interviewed++
    else if (st === 'EXTERNAL') breakdown.external++
    else if (st === 'FORMER') breakdown.former++
    else breakdown.basic++
  }

  const distribution = opts.distribution ?? 'ALL_MATCHING'
  let total = 0
  let progressive: AudiencePreviewResult['progressive'] | undefined

  // جمهور الإشعارات الفوري — كوادر القسم (علائقي + نصي) عند تحديد قسم
  const deptAudienceIds = dept ? nurses.filter((n) => deptMatch(n)).map((n) => n.id) : []

  switch (distribution) {
    case 'FAVORITES':
      total = breakdown.favorites
      break
    case 'SAME_ORG':
      total = nurses.filter((n) => affIs(n.id, ['WORKING', 'ENDORSED', 'INTERVIEWED', 'EXTERNAL'])).length
      break
    case 'ENDORSED':
      total = nurses.filter((n) => affIs(n.id, ['ENDORSED', 'WORKING'])).length
      break
    case 'INTERVIEWED':
      total = nurses.filter((n) => affIs(n.id, ['INTERVIEWED', 'ENDORSED'])).length
      break
    case 'AUTO_MATCH':
      total = nurses.filter(
        (n) =>
          affIs(n.id, ['WORKING', 'ENDORSED', 'INTERVIEWED', 'EXTERNAL', 'FORMER']) || deptMatch(n)
      ).length
      break
    case 'INVITE_SELECTED':
      // الاستدعاء المحدد: الاختبار الفعلي يتم من قائمة الاختيار — العدد هنا حجم الجمهور المؤهل
      total = nurses.length
      break
    case 'PROGRESSIVE': {
      // مرآة canNurseSeePost: من يرى التكليف في كل مرحلة فعلاً
      const stage0 = nurses.filter(
        (n) => favSet.has(n.id) || affIs(n.id, ['WORKING', 'ENDORSED'])
      ).length
      const stage1 = nurses.filter((n) => affIs(n.id, ['WORKING', 'ENDORSED'])).length
      const stage2 = nurses.filter((n) =>
        affIs(n.id, ['WORKING', 'ENDORSED', 'INTERVIEWED', 'EXTERNAL'])
      ).length
      progressive = { stage0, stage1, stage2, stage3: nurses.length }
      total = stage0
      break
    }
    default: {
      // ALL_MATCHING — الجميع المطابقون للجنس
      total = nurses.length
      break
    }
  }

  // من ستصلهم الإشعارات فعلياً فور النشر — مرآة منطق POST /api/posts:
  // - الاستدعاء المحدد: 0 (إشعارات فردية عبر الاستدعاءات)
  // - النشر التدريجي: جمهور المرحلة الأولى
  // - ALL_MATCHING/AUTO_MATCH مع قسم: كوادر القسم حصراً (توجيه احترافي حسب طلب المستلم)
  // - بلا قسم أو التوزيع الخاص: نفس الجمهور الكامل (السلوك القائم)
  const directNotify =
    distribution === 'INVITE_SELECTED'
      ? 0
      : distribution === 'PROGRESSIVE'
        ? (progressive?.stage0 ?? 0)
        : dept && (distribution === 'ALL_MATCHING' || distribution === 'AUTO_MATCH')
          ? deptAudienceIds.length
          : total

  return {
    distribution,
    total,
    breakdown: { ...breakdown, departmentMatch: nurses.filter((n) => relationalDeptMatch(n.id)).length },
    departmentMatch: nurses.filter((n) => relationalDeptMatch(n.id)).length,
    directNotify,
    departmentName: dept || null,
    progressive,
  }
}

// ---------- جمهور التوزيع ----------

/** الحالات المقبولة ضمن جمهور الارتباط بجهة ما */
const AFFILIATED_AUDIENCE: Array<'WORKING' | 'ENDORSED' | 'INTERVIEWED' | 'EXTERNAL' | 'FORMER'> = [
  'WORKING', 'ENDORSED', 'INTERVIEWED', 'EXTERNAL', 'FORMER',
]

/** هل التوزيع خاص (لا يظهر في القائمة العامة إلا لجمهوره)؟ */
export function isPrivateDistribution(distribution: DistributionMethod | null | undefined): boolean {
  return distribution === 'INVITE_SELECTED' || distribution === 'FAVORITES' ||
    distribution === 'SAME_ORG' || distribution === 'ENDORSED' || distribution === 'INTERVIEWED'
}

export interface PostVisibilityContext {
  nurseId: string
  nurseGender: Gender | null
  /** دور الطالب للرؤية — يجب أن يطابق جمهور التكليف (منظومة الأطباء) */
  role?: 'NURSE' | 'DOCTOR'
}

/**
 * فحص رؤية التكليف للكادر — يُطبق على القائمة وعلى الرابط المباشر وعلى التقديم:
 * مطابقة الجمهور (تمريض/أطباء) + فلترة الجنس + خصوصية طريقة التوزيع + مراحل النشر التدريجي.
 */
export async function canNurseSeePost(post: Post, ctx: PostVisibilityContext): Promise<boolean> {
  // 0) فلتر الجمهور — حتمي: تكليف الأطباء لا يراه الكادر التمريضي والعكس (منظومة الأطباء)
  if (audienceRole(post.audience) !== (ctx.role ?? 'NURSE')) return false

  // 1) فلتر الجنس — حتمي على مستوى المنطق وقاعدة البيانات
  if (!genderMatches(post.gender, ctx.nurseGender)) return false
  if (post.status !== 'OPEN' && post.status !== 'ASSIGNED') return false

  const distribution = post.distribution ?? 'ALL_MATCHING'

  // 2) التوزيع الخاص — الاستدعاء المباشر يراه المستدعى فقط
  if (distribution === 'INVITE_SELECTED') {
    const inv = await db.nurseInvitation.findUnique({
      where: { postId_nurseId: { postId: post.id, nurseId: ctx.nurseId } },
      select: { status: true },
    })
    return !!inv && inv.status !== 'DECLINED' && inv.status !== 'CANCELLED' && inv.status !== 'EXPIRED'
  }

  // 3) النشر التدريجي — الجمهور يتوسع حسب المرحلة الحالية
  if (distribution === 'PROGRESSIVE') {
    return progressiveAudienceContains(post, ctx.nurseId)
  }

  // 4) المفضلة فقط
  if (distribution === 'FAVORITES') {
    const fav = await db.favoriteNurse.findUnique({
      where: { receiverId_nurseId: { receiverId: post.receiverId, nurseId: ctx.nurseId } },
      select: { id: true },
    })
    return !!fav
  }

  // 5) جهة التكليف — حسب الحالة المطلوبة
  if (distribution === 'SAME_ORG' || distribution === 'ENDORSED' || distribution === 'INTERVIEWED') {
    if (!post.hospitalId) return false
    const required = distribution === 'SAME_ORG'
      ? ['WORKING', 'ENDORSED', 'INTERVIEWED', 'EXTERNAL']
      : distribution === 'ENDORSED'
        ? ['ENDORSED', 'WORKING']
        : ['INTERVIEWED', 'ENDORSED']
    const aff = await db.nurseAffiliation.findUnique({
      where: { nurseId_hospitalId: { nurseId: ctx.nurseId, hospitalId: post.hospitalId } },
      select: { status: true },
    })
    return !!aff && (required as string[]).includes(aff.status)
  }

  // 6) AUTO_MATCH — مطابق للجنس + (أقسام/تخصصات عمله توافق المطلوب أو مرتبط بالجهة)
  if (distribution === 'AUTO_MATCH') {
    if (post.hospitalId) {
      const aff = await db.nurseAffiliation.findUnique({
        where: { nurseId_hospitalId: { nurseId: ctx.nurseId, hospitalId: post.hospitalId } },
        select: { status: true },
      })
      if (aff && AFFILIATED_AUDIENCE.includes(aff.status as never)) return true
    }
    if (post.department) {
      if (post.audience === 'DOCTOR') {
        // علائقياً: التخصص ضمن تخصصات عمل الطبيب (كتالوج التخصصات الطبية)
        const ds = await db.doctorSpecialty.findFirst({
          where: {
            doctorId: ctx.nurseId,
            specialty: { name: post.department, isActive: true },
          },
          select: { id: true },
        })
        if (ds) return true
      } else {
        // علائقياً: القسم ضمن أقسام عمل الكادر المصرّح بها (كتالوج الإدارة)
        const wd = await db.workDepartment.findFirst({
          where: {
            nurseId: ctx.nurseId,
            department: { name: post.department, isActive: true },
          },
          select: { id: true },
        })
        if (wd) return true
      }
      // سقوط نصي للكوادر التاريخيين بلا أقسام/تخصصات عمل مصرّح بها
      const nurse = await db.user.findUnique({
        where: { id: ctx.nurseId },
        select: { specialty: true, qualification: true },
      })
      const hay = `${nurse?.specialty ?? ''} ${nurse?.qualification ?? ''}`.trim()
      if (hay && (hay.includes(post.department) || post.department.includes(hay))) return true
    }
    return false
  }

  // ALL_MATCHING — الجميع المطابقون للجنس
  return true
}

/** هل الكادر ضمن جمهور المرحلة الحالية للنشر التدريجي؟ */
async function progressiveAudienceContains(post: Post, nurseId: string): Promise<boolean> {
  const stage = post.progressiveStage ?? 0
  if (post.hospitalId) {
    const required =
      stage === 0 ? ['WORKING', 'ENDORSED'] :
      stage === 1 ? ['WORKING', 'ENDORSED', 'INTERVIEWED', 'EXTERNAL'] :
      stage === 2 ? ['WORKING', 'ENDORSED', 'INTERVIEWED', 'EXTERNAL'] :
        null
    const aff = await db.nurseAffiliation.findUnique({
      where: { nurseId_hospitalId: { nurseId, hospitalId: post.hospitalId } },
      select: { status: true },
    })
    if (aff) {
      if (stage <= 1 && (aff.status === 'WORKING' || aff.status === 'ENDORSED')) return true
      if (stage === 2 && (['WORKING', 'ENDORSED', 'INTERVIEWED', 'EXTERNAL'] as string[]).includes(aff.status)) return true
      if (stage >= 3) return true
      void required
    }
  }
  if (stage === 0) {
    const fav = await db.favoriteNurse.findUnique({
      where: { receiverId_nurseId: { receiverId: post.receiverId, nurseId } },
      select: { id: true },
    })
    if (fav) return true
  }
  // المرحلة الأخيرة: كل المطابقين للجنس
  return stage >= 3
}

// ---------- جمهور الإشعارات حسب القسم (توجيه احترافي) ----------

/**
 * جمهور إشعارات التكليف المُعلن عند تحديد قسم:
 * - departmentNurseIds: كوادر أضافوا القسم ضمن أقسام عملهم (مطابقة علائقية من كتالوج الإدارة)
 *   — يحصلون على إشعار مخصص «أنت من كادر هذا القسم»
 * - extendedNurseIds: مطابقون نصياً (تخصص/مؤهل) أو مرتبطون بالجهة الصحية — إشعار عادي
 * فلترة الجنس إلزامية على الجميع.
 */
export async function getDepartmentAudience(opts: {
  department: string
  gender?: Gender | null
  hospitalId?: string | null
  /** جمهور التكليف — يحدد الجمهور العلائقي (أقسام عمل الكادر أو تخصصات عمل الطبيب) */
  audience?: Audience | null
}): Promise<{ departmentNurseIds: string[]; extendedNurseIds: string[] }> {
  const role = audienceRole(opts.audience)
  const genderWhere = opts.gender && opts.gender !== 'ANY' ? { gender: opts.gender } : {}
  const base = { role, status: 'APPROVED' as const, ...genderWhere }
  const dept = opts.department.trim()

  // 1) جمهور المطلوب — علائقياً من أقسام عمل الكادر أو تخصصات عمل الطبيب
  const deptRows =
    role === 'DOCTOR'
      ? await db.doctorSpecialty.findMany({
          where: { specialty: { name: dept, isActive: true }, doctor: base },
          select: { doctorId: true },
        })
      : await db.workDepartment.findMany({
          where: { department: { name: dept, isActive: true }, nurse: base },
          select: { nurseId: true },
        })
  const departmentNurseIds = Array.from(
    new Set(deptRows.map((r) => 'nurseId' in r ? r.nurseId : (r as { doctorId: string }).doctorId))
  )
  const deptSet = new Set(departmentNurseIds)

  // 2) الجمهور الموسع: مطابقة نصية للكوادر التاريخيين + المرتبطون بالجهة الصحية
  const candidates = await db.user.findMany({
    where: { ...base, id: { notIn: departmentNurseIds } },
    select: { id: true, specialty: true, qualification: true },
  })
  const extended = new Set<string>()
  for (const n of candidates) {
    const hay = `${n.specialty ?? ''} ${n.qualification ?? ''}`.trim()
    if (hay && (hay.includes(dept) || dept.includes(hay))) extended.add(n.id)
  }
  if (opts.hospitalId && candidates.length > 0) {
    const affs = await db.nurseAffiliation.findMany({
      where: {
        hospitalId: opts.hospitalId,
        status: { in: ['WORKING', 'ENDORSED', 'INTERVIEWED', 'EXTERNAL', 'FORMER'] },
        nurseId: { in: candidates.map((c) => c.id) },
      },
      select: { nurseId: true },
    })
    for (const a of affs) extended.add(a.nurseId)
  }

  return {
    departmentNurseIds,
    extendedNurseIds: Array.from(extended).filter((id) => !deptSet.has(id)),
  }
}

// ---------- النشر التدريجي (ترقية كاسحة عند انتهاء مدة المرحلة) ----------

/**
 * ترقية تكليفات النشر التدريجي التي انتهت مدة مرحلتها — تُستدعى بشكل كاسح (lazy)
 * عند قراءة القوائم. تُرسل إشعاراً لجمهور المرحلة الجديدة.
 * تُعيد عدد التكليفات التي تمت ترقيتها.
 */
export async function escalateDueProgressivePosts(): Promise<number> {
  const due = await db.post.findMany({
    where: {
      distribution: 'PROGRESSIVE',
      status: 'OPEN',
      progressiveStage: { lt: 3 },
      progressiveNextAt: { lte: new Date() },
    },
    select: {
      id: true, progressiveStage: true, title: true, progressiveNextAt: true, audience: true,
    },
  })
  if (due.length === 0) return 0

  let escalated = 0
  for (const p of due) {
    const nextStage = p.progressiveStage + 1
    const updated = await db.post.update({
      where: { id: p.id },
      data: {
        progressiveStage: nextStage,
        progressiveNextAt: nextStage >= 3 ? null : new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    })
    escalated++
    const audience = await progressiveAudienceIds(updated)
    await Promise.all(
      audience.map((nurseId) =>
        db.notification.create({
          data: {
            userId: nurseId,
            title: 'تكليف متاح في مرحلتك',
            body: `تم توسيع نشر التكليف (${updated.title}) ليشمل فئتك — راجعه وتقدّم الآن`,
            type: 'POST_CREATED',
            link: audienceAssignmentsLink(p.audience),
          },
        }).catch(() => null)
      )
    )
  }
  return escalated
}

/** معرّفات جمهور المرحلة الحالية لتكليف تدريجي (مطابقة الجمهور والجنس إلزامية) */
export type ProgressivePostRef = Pick<
  Post,
  'id' | 'receiverId' | 'gender' | 'hospitalId' | 'progressiveStage' | 'audience'
>
export async function progressiveAudienceIds(post: ProgressivePostRef): Promise<string[]> {
  const role = audienceRole(post.audience)
  const genderWhere = post.gender === 'ANY'
    ? {}
    : { gender: post.gender }
  const base = { role, status: 'APPROVED' as const, ...genderWhere }
  const stage = post.progressiveStage ?? 0

  if (stage === 0) {
    const favs = await db.favoriteNurse.findMany({
      where: { receiverId: post.receiverId, nurse: { ...base } },
      select: { nurseId: true },
    })
    return favs.map((f) => f.nurseId)
  }

  if (post.hospitalId && stage <= 2) {
    const statuses =
      stage === 1 ? ['WORKING', 'ENDORSED'] : ['WORKING', 'ENDORSED', 'INTERVIEWED', 'EXTERNAL']
    const affs = await db.nurseAffiliation.findMany({
      where: { hospitalId: post.hospitalId, status: { in: statuses as never }, nurse: { ...base } },
      select: { nurseId: true },
    })
    return affs.map((a) => a.nurseId)
  }

  const all = await db.user.findMany({ where: base, select: { id: true } })
  return all.map((u) => u.id)
}

// ---------- المطابقة الذكية والأولويات ----------

export interface MatchedNurse {
  id: string
  name: string
  phone: string
  gender: Gender | null
  specialty: string | null
  qualification: string | null
  yearsOfExperience: number | null
  /** أقسام العمل المصرّح بها من الكادر (من كتالوج الإدارة) */
  workDepartments: string[]
  /** هل يطابق قسم التكليف المطلوب ضمن أقسام عمله؟ */
  departmentMatch: boolean
  /** متوسط التقييم وعدده */
  ratingAverage: number | null
  ratingCount: number
  /** هل هو ضمن مفضلة هذا المستلم؟ */
  isFavorite: boolean
  favoriteCategory: string | null
  /** حالة ارتباطه بالجهة المحددة (إن وُجدت) */
  affiliationStatus: string | null
  /** أولوية المطابقة 0..5 */
  priority: number
  /** متاح الآن (لا تكليف نشط/مستلَم قائم) */
  isAvailable: boolean
  documentsCount: number
}

export interface MatchOptions {
  receiverId: string
  hospitalId?: string | null
  postGender?: Gender | null
  department?: string | null
  /** دور الجمهور — NURSE: كادر تمريضي (افتراضي) | DOCTOR: أطباء (منظومة الأطباء) */
  role?: 'NURSE' | 'DOCTOR'
  /** إظهار غير المطابقين للجنس؟ (لا — فلترة الجنس إلزامية دائماً) */
  favoritesOnly?: boolean
  search?: string
  minExperience?: number | null
  specialty?: string | null
  affiliationStatus?: string | null
  availableOnly?: boolean
}

/**
 * خريطة أقسام عمل الكوادر — أسماء الأقسام النشطة لكل كادر من كتالوج الإدارة
 * تُستخدم في المطابقة العلائقية للقسم (بديل احترافي عن مطابقة النصوص)
 */
export async function getWorkDepartmentsMap(
  nurseIds: string[]
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>()
  if (nurseIds.length === 0) return map
  const rows = await db.workDepartment.findMany({
    where: { nurseId: { in: nurseIds }, department: { isActive: true } },
    select: { nurseId: true, department: { select: { name: true } } },
  })
  for (const row of rows) {
    const list = map.get(row.nurseId) ?? []
    list.push(row.department.name)
    map.set(row.nurseId, list)
  }
  return map
}

/**
 * خريطة تخصصات عمل الأطباء — أسماء التخصصات النشطة لكل طبيب من كتالوج التخصصات الطبية
 * (مرآة getWorkDepartmentsMap — منظومة الأطباء). مفاتيح الواجهة نفسها (workDepartments)
 * لتعمل مكونات الاختيار والمعاينة لجمهور الأطباء دون تعديل.
 */
export async function getSpecialtiesMap(
  doctorIds: string[]
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>()
  if (doctorIds.length === 0) return map
  const rows = await db.doctorSpecialty.findMany({
    where: { doctorId: { in: doctorIds }, specialty: { isActive: true } },
    select: { doctorId: true, specialty: { select: { name: true } } },
  })
  for (const row of rows) {
    const list = map.get(row.doctorId) ?? []
    list.push(row.specialty.name)
    map.set(row.doctorId, list)
  }
  return map
}

/**
 * جلب الكوادر مرتبين حسب أولوية المطابقة الذكية:
 * المفضلون ← العاملون بالجهة ← المعتمدون ← المتقابَل معهم ← الخارجيون المؤهلون ← بقية المطابقين
 * فلترة الجنس إلزامية: لا يظهر في النتيجة أي كادر لا يطابق جنس التكليف المطلوب.
 * مطابقة القسم علائقية أولاً (من أقسام عمل الكادر المصرّح بها) مع سقوط نصي للتاريخي.
 */
export async function findMatchingNurses(opts: MatchOptions): Promise<MatchedNurse[]> {
  const role = opts.role ?? 'NURSE'
  const genderWhere = opts.postGender && opts.postGender !== 'ANY' ? { gender: opts.postGender } : {}

  const [nurses, favorites, busyNurseIds] = await Promise.all([
    db.user.findMany({
      where: {
        role,
        status: 'APPROVED',
        ...genderWhere,
        ...(opts.search
          ? {
              OR: [
                { name: { contains: opts.search } },
                // الجولة 34: البحث بالهاتف أُغلق — كان يسرّب وجود الرقم في المنصة
                // { phone: { contains: opts.search } },
                { specialty: { contains: opts.search } },
              ],
            }
          : {}),
        ...(opts.minExperience != null ? { yearsOfExperience: { gte: opts.minExperience } } : {}),
        ...(opts.specialty ? { specialty: { contains: opts.specialty } } : {}),
      },
      select: {
        id: true, name: true, phone: true, gender: true, specialty: true,
        qualification: true, yearsOfExperience: true,
      },
    }),
    db.favoriteNurse.findMany({
      where: { receiverId: opts.receiverId },
      select: { nurseId: true, category: true },
    }),
    db.assignment.findMany({
      where: { status: { in: ['ACTIVE', 'RECEIVED'] }, nurse: { role } },
      select: { nurseId: true },
    }),
  ])

  const favMap = new Map(favorites.map((f) => [f.nurseId, f.category ?? null]))
  const busySet = new Set(busyNurseIds.map((b) => b.nurseId))

  // ارتباطات الكوادر بالجهة المحددة + متوسطات التقييم + عدد المستندات — دفعة واحدة
  const nurseIds = nurses.map((n) => n.id)
  const [affiliations, ratingAgg, docsCounts] = await Promise.all([
    opts.hospitalId
      ? db.nurseAffiliation.findMany({
          where: { hospitalId: opts.hospitalId, nurseId: { in: nurseIds } },
          select: { nurseId: true, status: true },
        })
      : Promise.resolve([] as Array<{ nurseId: string; status: string }>),
    db.nurseRating.groupBy({
      by: ['nurseId'],
      where: { nurseId: { in: nurseIds } },
      _avg: { overall: true },
      _count: true,
    }),
    db.document.groupBy({
      by: ['userId'],
      where: { userId: { in: nurseIds } },
      _count: true,
    }),
  ])

  const affMap = new Map(affiliations.map((a) => [a.nurseId, a.status]))
  const ratingMap = new Map(ratingAgg.map((r) => [r.nurseId, { avg: r._avg.overall, count: r._count }]))
  const docsMap = new Map(docsCounts.map((d) => [d.userId, d._count]))
  // أقسام/تخصصات عمل الجمهور من كتالوج الإدارة — المطابقة العلائقية حسب الجمهور
  const workDeptsMap =
    role === 'DOCTOR' ? await getSpecialtiesMap(nurseIds) : await getWorkDepartmentsMap(nurseIds)

  const result: MatchedNurse[] = nurses
    .map((n) => {
      const affStatus = affMap.get(n.id) ?? null
      const isFavorite = favMap.has(n.id)
      const nurseWorkDepts = workDeptsMap.get(n.id) ?? []
      // أولوية المطابقة: 5 مفضل ← 4 يعمل حالياً ← 3 معتمد ← 2 متقابَل ← 1 خارجي ← 0 مطابق أساسي
      let priority = 0
      if (isFavorite) priority = 5
      else if (affStatus === 'WORKING') priority = 4
      else if (affStatus === 'ENDORSED') priority = 3
      else if (affStatus === 'INTERVIEWED') priority = 2
      else if (affStatus === 'EXTERNAL') priority = 1

      // تعزيز طفيف للخبرة داخل نفس المستوى (لا يغيّر الترتيب الأساسي للأولويات)
      const rating = ratingMap.get(n.id)
      const dept = opts.department?.trim() ?? ''
      // مطابقة القسم: علائقية من أقسام عمله أولاً ثم السقوط النصي (تخصص/مؤهل)
      const hay = `${n.specialty ?? ''} ${n.qualification ?? ''}`.trim()
      const textMatch = !!dept && !!hay && (hay.includes(dept) || dept.includes(hay))
      const departmentMatch =
        !!dept && (nurseWorkDepts.includes(dept) || (!nurseWorkDepts.length && textMatch))
      return {
        id: n.id,
        name: n.name,
        phone: n.phone,
        gender: n.gender,
        specialty: n.specialty,
        qualification: n.qualification,
        yearsOfExperience: n.yearsOfExperience,
        workDepartments: nurseWorkDepts,
        departmentMatch,
        ratingAverage: rating?.avg ? Number(rating.avg.toFixed(2)) : null,
        ratingCount: rating?.count ?? 0,
        isFavorite,
        favoriteCategory: favMap.get(n.id) ?? null,
        affiliationStatus: affStatus,
        priority,
        isAvailable: !busySet.has(n.id),
        documentsCount: docsMap.get(n.id) ?? 0,
      }
    })
    .filter((n) => {
      if (opts.favoritesOnly && !n.isFavorite) return false
      if (opts.affiliationStatus && n.affiliationStatus !== opts.affiliationStatus) return false
      if (opts.availableOnly && !n.isAvailable) return false
      if (opts.department && opts.department.trim()) {
        // المطابقة الذكية للقسم: أقسام عمله المصرّح بها أو تخصصه/مؤهله يوافق القسم
        // — مع إبقاء المعتمدين/العاملين بالجهة (السلوك التاريخي محفوظ)
        const dept = opts.department.trim()
        const hay = `${n.specialty ?? ''} ${n.qualification ?? ''}`
        const textMatch = hay.includes(dept) || dept.includes(hay.trim())
        if (!n.departmentMatch && !textMatch && !['WORKING', 'ENDORSED'].includes(n.affiliationStatus ?? '')) return false
      }
      return true
    })
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority
      // ضمن نفس الأولوية: مطابقو القسم المصرّح به أولاً — ثم الخبرة ثم التقييم
      if (a.departmentMatch !== b.departmentMatch) return a.departmentMatch ? -1 : 1
      const expDiff = (b.yearsOfExperience ?? 0) - (a.yearsOfExperience ?? 0)
      if (expDiff !== 0) return expDiff
      return (b.ratingAverage ?? 0) - (a.ratingAverage ?? 0)
    })

  return result
}

// ---------- مجتمع كوادر الجهة الصحية (الجولة 38) ----------
/**
 * «كوادر جهتي الصحية» — كل جهة صحية لها مجتمع كوادر خاص بها:
 *  - المعتمد: ارتباط مهني بحالة (يعمل حالياً WORKING / معتمد ENDORSED)
 *    وحسابه معتمد من الإدارة (APPROVED) وهو كادر تمريضي أو طبيب.
 *  - المتاح الآن: من المعتمدين ولا يوجد عليه تكليف سارٍ (ACTIVE/RECEIVED).
 * الإحصاءات تُقرأ من قاعدة البيانات مباشرة في كل طلب — فوري دائماً.
 */

/** حالات الارتباط التي تُعدّ صاحبها «معتمداً» في مجتمع الجهة */
export const ACCREDITED_AFFILIATION_STATUSES = ['WORKING', 'ENDORSED'] as const

/** إحصاءات مجتمع كوادر جهة صحية — الممرضون المعتمدون / الأطباء المعتمدون / المتاحون الآن */
export interface OrgCadreStats {
  accreditedNurses: number
  accreditedDoctors: number
  availableNow: number
}

export const EMPTY_ORG_CADRE_STATS: OrgCadreStats = {
  accreditedNurses: 0,
  accreditedDoctors: 0,
  availableNow: 0,
}

/** معرّفات الكوادر المشغولين حالياً بتكليف سارٍ (ACTIVE/RECEIVED) */
export async function busyStaffIds(staffIds: string[]): Promise<Set<string>> {
  const ids = staffIds.filter(Boolean)
  if (ids.length === 0) return new Set()
  const rows = await db.assignment.findMany({
    where: { nurseId: { in: ids }, status: { in: ['ACTIVE', 'RECEIVED'] } },
    select: { nurseId: true },
    distinct: ['nurseId'],
  })
  return new Set(rows.map((r) => r.nurseId))
}

/** أعضاء مجتمع جهة (المعتمدون) — يُستخدم من الإحصاءات ومن قائمة المجتمع */
export async function orgAccreditedMembers(hospitalId: string) {
  return db.nurseAffiliation.findMany({
    where: {
      hospitalId,
      status: { in: [...ACCREDITED_AFFILIATION_STATUSES] },
      nurse: { status: 'APPROVED', role: { in: ['NURSE', 'DOCTOR'] } },
    },
    select: { nurseId: true, nurse: { select: { role: true } } },
  })
}

function tallyMembers(
  members: { nurseId: string; nurse: { role: string } }[],
  busy: Set<string>
): OrgCadreStats {
  const stats: OrgCadreStats = { ...EMPTY_ORG_CADRE_STATS }
  for (const m of members) {
    if (m.nurse.role === 'DOCTOR') stats.accreditedDoctors++
    else stats.accreditedNurses++
    if (!busy.has(m.nurseId)) stats.availableNow++
  }
  return stats
}

/** إحصاءات مجتمع كوادر جهة صحية واحدة */
export async function computeOrgCadreStats(hospitalId: string): Promise<OrgCadreStats> {
  const members = await orgAccreditedMembers(hospitalId)
  const busy = await busyStaffIds(members.map((m) => m.nurseId))
  return tallyMembers(members, busy)
}

/** إحصاءات مجتمعات كل الجهات الصحية دفعة واحدة (لإدارة الجهات — بلا استعلامات متسلسلة) */
export async function computeAllOrgCadreStats(): Promise<Map<string, OrgCadreStats>> {
  const members = await db.nurseAffiliation.findMany({
    where: {
      status: { in: [...ACCREDITED_AFFILIATION_STATUSES] },
      nurse: { status: 'APPROVED', role: { in: ['NURSE', 'DOCTOR'] } },
    },
    select: { hospitalId: true, nurseId: true, nurse: { select: { role: true } } },
  })
  const busy = await busyStaffIds(members.map((m) => m.nurseId))
  const map = new Map<string, OrgCadreStats>()
  for (const m of members) {
    const s = map.get(m.hospitalId) ?? { ...EMPTY_ORG_CADRE_STATS }
    if (m.nurse.role === 'DOCTOR') s.accreditedDoctors++
    else s.accreditedNurses++
    if (!busy.has(m.nurseId)) s.availableNow++
    map.set(m.hospitalId, s)
  }
  return map
}
