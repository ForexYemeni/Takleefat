import { db } from '@/lib/db'
import type { Gender, Post, DistributionMethod } from '@prisma/client'

/**
 * شبكة الكوادر الصحية المعتمدة | Verified Healthcare Workforce Network
 * مكتبة المطابقة الذكية وخصوصية التوزيع والنشر التدريجي — تُستخدم من كل واجهات API
 */

// ---------- تسميات الحالات ----------

export const AFFILIATION_STATUS_LABELS: Record<string, string> = {
  WORKING: 'يعمل حالياً',
  FORMER: 'عمل سابقاً',
  INTERVIEWED: 'تمت مقابلته',
  ENDORSED: 'معتمد',
  PENDING: 'قيد المراجعة',
  EXTERNAL: 'خارجي مؤهل',
  UNENDORSED: 'غير معتمد',
  SUSPENDED: 'موقوف',
}

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
    select: { id: true, name: true, city: true, status: true },
  })
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
}

/**
 * فحص رؤية التكليف للكادر — يُطبق على القائمة وعلى الرابط المباشر وعلى التقديم:
 * فلترة الجنس إلزامية دائماً + خصوصية طريقة التوزيع + مراحل النشر التدريجي.
 */
export async function canNurseSeePost(post: Post, ctx: PostVisibilityContext): Promise<boolean> {
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

  // 6) AUTO_MATCH — مطابق للجنس + (تخصص يوافق القسم أو مرتبط بالجهة)
  if (distribution === 'AUTO_MATCH') {
    if (post.hospitalId) {
      const aff = await db.nurseAffiliation.findUnique({
        where: { nurseId_hospitalId: { nurseId: ctx.nurseId, hospitalId: post.hospitalId } },
        select: { status: true },
      })
      if (aff && AFFILIATED_AUDIENCE.includes(aff.status as never)) return true
    }
    if (post.department) {
      const nurse = await db.user.findUnique({
        where: { id: ctx.nurseId },
        select: { specialty: true, qualification: true },
      })
      const hay = `${nurse?.specialty ?? ''} ${nurse?.qualification ?? ''}`
      if (hay && post.department && (hay.includes(post.department) || post.department.includes(hay.trim()))) return true
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
    select: { id: true, progressiveStage: true, title: true, progressiveNextAt: true },
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
            link: '/nurse/assignments',
          },
        }).catch(() => null)
      )
    )
  }
  return escalated
}

/** معرّفات جمهور المرحلة الحالية لتكليف تدريجي (مطابقة الجنس إلزامية) */
export type ProgressivePostRef = Pick<Post, 'id' | 'receiverId' | 'gender' | 'hospitalId' | 'progressiveStage'>
export async function progressiveAudienceIds(post: ProgressivePostRef): Promise<string[]> {
  const genderWhere = post.gender === 'ANY'
    ? {}
    : { gender: post.gender }
  const base = { role: 'NURSE' as const, status: 'APPROVED' as const, ...genderWhere }
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
  /** إظهار غير المطابقين للجنس؟ (لا — فلترة الجنس إلزامية دائماً) */
  favoritesOnly?: boolean
  search?: string
  minExperience?: number | null
  specialty?: string | null
  affiliationStatus?: string | null
  availableOnly?: boolean
}

/**
 * جلب الكوادر مرتبين حسب أولوية المطابقة الذكية:
 * المفضلون ← العاملون بالجهة ← المعتمدون ← المتقابَل معهم ← الخارجيون المؤهلون ← بقية المطابقين
 * فلترة الجنس إلزامية: لا يظهر في النتيجة أي كادر لا يطابق جنس التكليف المطلوب.
 */
export async function findMatchingNurses(opts: MatchOptions): Promise<MatchedNurse[]> {
  const genderWhere = opts.postGender && opts.postGender !== 'ANY' ? { gender: opts.postGender } : {}

  const [nurses, favorites, busyNurseIds] = await Promise.all([
    db.user.findMany({
      where: {
        role: 'NURSE',
        status: 'APPROVED',
        ...genderWhere,
        ...(opts.search
          ? {
              OR: [
                { name: { contains: opts.search } },
                { phone: { contains: opts.search } },
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
      where: { status: { in: ['ACTIVE', 'RECEIVED'] }, nurse: { role: 'NURSE' } },
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

  const result: MatchedNurse[] = nurses
    .map((n) => {
      const affStatus = affMap.get(n.id) ?? null
      const isFavorite = favMap.has(n.id)
      // أولوية المطابقة: 5 مفضل ← 4 يعمل حالياً ← 3 معتمد ← 2 متقابَل ← 1 خارجي ← 0 مطابق أساسي
      let priority = 0
      if (isFavorite) priority = 5
      else if (affStatus === 'WORKING') priority = 4
      else if (affStatus === 'ENDORSED') priority = 3
      else if (affStatus === 'INTERVIEWED') priority = 2
      else if (affStatus === 'EXTERNAL') priority = 1

      // تعزيز طفيف للخبرة داخل نفس المستوى (لا يغيّر الترتيب الأساسي للأولويات)
      const rating = ratingMap.get(n.id)
      return {
        id: n.id,
        name: n.name,
        phone: n.phone,
        gender: n.gender,
        specialty: n.specialty,
        qualification: n.qualification,
        yearsOfExperience: n.yearsOfExperience,
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
        // المطابقة الذكية للقسم: التخصص أو المؤهل يوافق القسم — مع إبقاء المعتمدين/العاملين بالجهة
        const hay = `${n.specialty ?? ''} ${n.qualification ?? ''}`
        const dept = opts.department.trim()
        const deptMatch = hay.includes(dept) || dept.includes(hay.trim())
        if (!deptMatch && !['WORKING', 'ENDORSED'].includes(n.affiliationStatus ?? '')) return false
      }
      return true
    })
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority
      const expDiff = (b.yearsOfExperience ?? 0) - (a.yearsOfExperience ?? 0)
      if (expDiff !== 0) return expDiff
      return (b.ratingAverage ?? 0) - (a.ratingAverage ?? 0)
    })

  return result
}
