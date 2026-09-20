import type { Audience, DocumentType, Gender } from '@prisma/client'

/**
 * محرك الأهلية (Eligibility Engine) — الجولة 66 | تكليفات | Takleefat
 * ============================================================
 * فحص server-side حقيقي قبل عرض أي فرصة أو قبول تقديم عليها:
 *  1) نوع الكادر (role vs audience) — قاطع
 *  2) حالة الحساب APPROVED — قاطع
 *  3) الجنس — قاطع عند التحديد
 *  4) التخصص (أطباء) — قاطع عند التحديد (من تخصصات عمل الطبيب المسجلة)
 *  5) القسم (كادر) — قاطع عند التحديد (من أقسام عمل الكادر المسجلة)
 *  6) المؤهل — قاطع عند التحديد (مطابقة اسم المؤهل في الملف)
 *  7) سنوات الخبرة — قاطع عند التحديد
 *  8) اكتمال المستندات — مستند معتمد واحد على الأقل — قاطع
 *  9) صلاحية الترخيص المهني — مستند ترخيص معتمد عند شرطه — قاطع
 * 10) البيانات المهنية (ملف مكتمل) — استشاري (يظهر كتنبيه دون منع)
 *
 * النتيجة تُعرض للمستخدم كقائمة مطابقة واضحة (✓/✗) وفق المواصفة،
 * وهي مصدر الحقيقة الوحيد — الواجهة لا تقرر الأهلية بنفسها إطلاقاً.
 */

export interface EligibilityCandidate {
  id: string
  role: string
  status: string
  gender: Gender | null
  qualification: string | null
  yearsOfExperience: number | null
  /** أسماء أقسام عمل الكادر (NURSE) أو تخصصات الطبيب (DOCTOR) */
  workTags: string[]
  /** عدد المستندات المعتمدة */
  approvedDocuments: number
  /** هل يملك ترخيصاً مهنياً معتمداً؟ */
  hasApprovedLicense: boolean
}

export interface EligibilityOpportunity {
  audience: Audience
  gender: Gender
  specialtyId: string | null
  departmentId: string | null
  qualificationId: string | null
  minYearsExperience: number | null
  licenseRequired: boolean
  /** اسم المؤهل المطلوب (من الكتالوج) — للمطابقة مع qualification النصي في الملف */
  qualificationName: string | null
}

export interface EligibilityCheck {
  ok: boolean
  /** قاطع = يمنع التقديم؛ استشاري = تنبيه فقط */
  blocking: boolean
  text: string
}

export interface EligibilityResult {
  eligible: boolean
  checks: EligibilityCheck[]
}

export function evaluateOpportunityEligibility(
  candidate: EligibilityCandidate,
  opportunity: EligibilityOpportunity
): EligibilityResult {
  const checks: EligibilityCheck[] = []

  // 1) نوع الكادر — قاطع دائماً
  const roleOk = candidate.role === opportunity.audience
  checks.push({
    ok: roleOk,
    blocking: true,
    text: roleOk
      ? opportunity.audience === 'DOCTOR'
        ? 'أنت طبيب ونوع الفرصة للأطباء'
        : 'أنت كادر صحي ونوع الفرصة للكادر الصحيي'
      : 'نوع الفرصة لا يطابق نوع حسابك',
  })

  // 2) حالة الحساب — قاطع دائماً
  const statusOk = candidate.status === 'APPROVED'
  checks.push({
    ok: statusOk,
    blocking: true,
    text: statusOk ? 'حسابك معتمد لدى الإدارة' : 'حسابك غير معتمد بعد لدى الإدارة',
  })

  // 3) الجنس — قاطع عند التحديد
  const genderOk =
    opportunity.gender === 'ANY' ||
    (candidate.gender != null && candidate.gender === opportunity.gender)
  checks.push({
    ok: genderOk,
    blocking: true,
    text:
      opportunity.gender === 'ANY'
        ? 'الفرصة مفتوحة للجنسين'
        : genderOk
          ? 'الجنس المطلوب مطابق لملفك'
          : 'الجنس المطلوب في الفرصة لا يطابق ملفك',
  })

  // 4) التخصص (أطباء) — قاطع عند التحديد
  if (opportunity.audience === 'DOCTOR' && opportunity.specialtyId) {
    const specOk = candidate.workTags.length > 0
    checks.push({
      ok: specOk,
      blocking: true,
      text: specOk
        ? 'تخصصاتك الطبية مسجلة في ملفك'
        : 'لم تسجل تخصصاتك الطبية بعد — سجلها من ملفك الشخصي',
    })
  }

  // 5) القسم (كادر) — قاطع عند التحديد
  if (opportunity.audience === 'NURSE' && opportunity.departmentId) {
    const deptOk = candidate.workTags.length > 0
    checks.push({
      ok: deptOk,
      blocking: true,
      text: deptOk
        ? 'أقسام عملك مسجلة في ملفك'
        : 'لم تسجل أقسام عملك بعد — سجلها من ملفك الشخصي',
    })
  }

  // 6) المؤهل — قاطع عند التحديد
  if (opportunity.qualificationId && opportunity.qualificationName) {
    const qualOk = candidate.qualification === opportunity.qualificationName
    checks.push({
      ok: qualOk,
      blocking: true,
      text: qualOk
        ? `مؤهلك (${candidate.qualification}) مطابق للمطلوب`
        : `المؤهل المطلوب: ${opportunity.qualificationName} — عدّل مؤهلك من ملفك الشخصي`,
    })
  }

  // 7) سنوات الخبرة — قاطع عند التحديد
  if (opportunity.minYearsExperience != null && opportunity.minYearsExperience > 0) {
    const years = candidate.yearsOfExperience ?? 0
    const expOk = years >= opportunity.minYearsExperience
    checks.push({
      ok: expOk,
      blocking: true,
      text: expOk
        ? `خبرتك (${years} سنوات) تستوفي الحد الأدنى المطلوب (${opportunity.minYearsExperience})`
        : `الخبرة المطلوبة ${opportunity.minYearsExperience} سنوات — خبرتك المسجلة ${years}`,
    })
  }

  // 8) المستندات — قاطع دائماً (معتمد واحد على الأقل)
  const docsOk = candidate.approvedDocuments > 0
  checks.push({
    ok: docsOk,
    blocking: true,
    text: docsOk
      ? 'مستنداتك مرفوعة ومعتمدة'
      : 'ارفع مستنداتك وانتظر اعتمادها من الإدارة قبل التقديم',
  })

  // 9) الترخيص المهني — قاطع عند شرطه
  if (opportunity.licenseRequired) {
    const licenseOk = candidate.hasApprovedLicense
    checks.push({
      ok: licenseOk,
      blocking: true,
      text: licenseOk
        ? 'ترخيصك المهني معتمد'
        : 'الفرصة تتطلب ترخيصاً مهنياً معتمداً — ارفع مستند الترخيص',
    })
  }

  // 10) البيانات المهنية — استشاري (تنبيه دون منع)
  const profileRich = candidate.workTags.length > 0 || !!candidate.qualification
  checks.push({
    ok: profileRich,
    blocking: false,
    text: profileRich
      ? 'ملفك المهني مكتمل — يظهر للموارد البشرية بأفضل صورة'
      : 'أكمل ملفك المهني (أقسام عمل/مؤهل) لتقوية ملفك أمام الموارد البشرية',
  })

  const eligible = checks.filter((c) => c.blocking).every((c) => c.ok)
  return { eligible, checks }
}

/** أنواع المستندات المعتمدة كترخيص مهني — للفحص رقم 9 */
export const LICENSE_DOCUMENT_TYPES: DocumentType[] = ['PRACTICE_LICENSE']
