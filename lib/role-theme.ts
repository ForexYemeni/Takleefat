/**
 * نظام الهوية اللونية حسب الدور — الجولة 58
 * =====================================================
 * هوية تكليفات الأساسية ثابتة (كحلي عميق + أزرق ملكي + سماوي + بنفسجي)
 * ويُضاف فوقها لون تمييز (Accent) يتغير حسب دور المستخدم — يُستخدم حصراً في:
 * التنقل النشط، الأزرار الرئيسية، الشارات، التقدم، الأيقونات، الإبرازات، حلقات التركيز.
 * الخلفيات الأساسية تبقى كحلية/محايدة حتى تبقى للمنصة هوية واحدة.
 *
 * الألوان مختارة بدرجات تضمن تباين النص الأبيض فوقها (WCAG ≥ 4.5:1)
 */

export type RoleKey = 'ADMIN' | 'NURSE' | 'RECEIVER' | 'DOCTOR' | 'DOCTOR_SUPERVISOR'

export interface RoleTheme {
  /** لون التمييز الأساسي — أزرار/تنقل نشط/أيقونات */
  accent: string
  /** لون أعمق للنصوص فوق خلفيات فاتحة وحالات التركيز */
  accentStrong: string
  /** لون التوهج/النبض (أفتح درجة) */
  accentGlow: string
  /** خلفية شفافة ناعمة للشارات والبطاقات النشطة */
  accentSoft: string
  /** اسم الدور بالعربية */
  label: string
}

export const ROLE_THEME: Record<RoleKey, RoleTheme> = {
  // الكادر التمريضي — تركوازي طبي (رعاية واهتمام)
  NURSE: {
    accent: '#0D9488',
    accentStrong: '#0F766E',
    accentGlow: '#14B8A6',
    accentSoft: 'rgba(20, 184, 166, 0.12)',
    label: 'الكادر التمريضي',
  },
  // الطبيب — أخضر طبي زمردي (اعتماد ومهنية)
  DOCTOR: {
    accent: '#059669',
    accentStrong: '#047857',
    accentGlow: '#10B981',
    accentSoft: 'rgba(16, 185, 129, 0.12)',
    label: 'الطبيب',
  },
  // المستلم الإداري — أزرق ملكي طبي (هوية تكليفات: عمليات وثقة واحترافية)
  RECEIVER: {
    accent: '#2563EB',
    accentStrong: '#1D4ED8',
    accentGlow: '#3B82F6',
    accentSoft: 'rgba(37, 99, 235, 0.10)',
    label: 'المستلم الإداري',
  },
  // مشرف الأطباء — نيلي (إشراف ورقابة ومتابعة)
  DOCTOR_SUPERVISOR: {
    accent: '#4F46E5',
    accentStrong: '#4338CA',
    accentGlow: '#6366F1',
    accentSoft: 'rgba(99, 102, 241, 0.12)',
    label: 'مشرف الأطباء',
  },
  // الإدارة — سماوي كهربائي (نظام وتحكم وتقنية)
  ADMIN: {
    accent: '#0891B2',
    accentStrong: '#0E7490',
    accentGlow: '#22D3EE',
    accentSoft: 'rgba(34, 211, 238, 0.13)',
    label: 'مدير النظام',
  },
}

// =====================================================
// محرك التوافق الذكي (Smart Match) — مشترك بين صفحة التكليف
// ولوحة «تكلي AI» في شريط التنقل — حساب نقي في العميل،
// مصدر البيانات نفسه المستخدم في قيود التقديم الحالية.
// =====================================================

export interface MatchInput {
  audience: 'NURSE' | 'DOCTOR'
  post: {
    department: string | null
    startDate: string | Date
    endTime?: string | Date | null
  }
  me: {
    status?: string
    yearsOfExperience?: number | null
  } | null
  /** أسماء أقسام عمل الكادر (NURSE) أو تخصصات الطبيب (DOCTOR) */
  myTags: string[]
  /** حالة مستندات الكادر: approved / pending / none */
  documentsState: 'approved' | 'pending' | 'none'
  /** هل يتقاطع وقت التكليف مع تكليف سارٍ للكادر؟ */
  timeConflict: boolean
}

export interface MatchResult {
  /** النسبة النهائية 0..100 — أو null إن لم تكفِ البيانات */
  score: number | null
  reasons: { ok: boolean; text: string }[]
  /** هل البيانات كافية لعرض النتيجة؟ (الملف فارغ كلياً → لا نعرض شيئاً) */
  enough: boolean
}

export function computeMatchScore(input: MatchInput): MatchResult {
  const { audience, post, me, myTags, documentsState, timeConflict } = input
  const reasons: { ok: boolean; text: string }[] = []

  // البيانات الكافية = ملف فيه على الأقل مؤهل أو تخصص/تخصصات مسجلة
  const enough =
    !!me && (audience === 'DOCTOR' ? myTags.length > 0 : !!me.yearsOfExperience || myTags.length > 0)
  if (!enough) return { score: null, reasons, enough: false }

  let score = 0

  // 1) الحساب المعتمد — 15
  const approved = me?.status === 'APPROVED'
  score += approved ? 15 : 0
  reasons.push({
    ok: approved,
    text: approved ? 'حسابك معتمد لدى الإدارة' : 'حسابك قيد مراجعة الإدارة',
  })

  // 2) المستندات — 25
  const docsOk = documentsState === 'approved'
  const docsPending = documentsState === 'pending'
  score += docsOk ? 25 : docsPending ? 15 : 0
  reasons.push({
    ok: docsOk,
    text: docsOk
      ? 'مستنداتك مكتملة ومعتمدة'
      : docsPending
        ? 'مستنداتك مرفوعة وبانتظار المراجعة'
        : 'مستنداتك غير مرفوعة بعد',
  })

  // 3) مطابقة قسم العمل (كادر) أو تسجيل التخصصات (طبيب) — 25
  const deptMatch = !!post.department && myTags.includes(post.department)
  if (audience === 'NURSE') {
    score += deptMatch ? 25 : 0
    reasons.push({
      ok: deptMatch,
      text: deptMatch
        ? `قسم عملك يشمل «${post.department}»`
        : post.department
          ? `القسم «${post.department}» ليس ضمن أقسام عملك`
          : 'التكليف بلا قسم محدد — متاح لكل الأقسام',
    })
  } else {
    const hasTags = myTags.length > 0
    score += hasTags ? 25 : 0
    reasons.push({
      ok: hasTags,
      text: hasTags ? 'تخصصاتك الطبية مسجلة في ملفك' : 'لم تسجل تخصصاتك الطبية بعد',
    })
  }

  // 4) الخبرة الموثقة — 15
  const exp = (me?.yearsOfExperience ?? 0) > 0
  score += exp ? 15 : 0
  reasons.push({
    ok: exp,
    text: exp ? `خبرتك موثقة (${me?.yearsOfExperience} سنوات)` : 'أضف سنوات خبرتك لرفع توافقك',
  })

  // 5) التوفر — 20 (لا تعارض مع تكليف سارٍ)
  score += timeConflict ? 0 : 20
  reasons.push({
    ok: !timeConflict,
    text: timeConflict
      ? 'وقت التكليف يتعارض مع تكليف سارٍ لك'
      : 'أنت متاح خلال فترة هذا التكليف',
  })

  return { score: Math.min(100, score), reasons, enough: true }
}
