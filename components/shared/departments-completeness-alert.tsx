'use client'

import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, ChevronDown, Sparkles } from 'lucide-react'
import { apiFetcher } from '@/lib/api-client'
import { Button } from '@/components/ui/button'

/**
 * تنبيه إكمال أقسام العمل / تخصصات العمل — الجولة 50
 * =====================================================
 * تنبيه احترافي في أعلى الملف الشخصي يشجّع الكادر التمريضي والطبيب على
 * إكمال أقسام عملهم (أو تخصصات الطبيب) — لأن الجولة 49 جعلت وصول التكليف
 * حصرياً لمن أضاف القسم/التخصص ضمن أقسام عمله من الملف الشخصي:
 * - بلا أقسام: تنبيه فاخر بعبارة تشجيعية + زر يانتقال سلس لبطاقة أقسام العمل مع وميض تمييز
 * - بعد الإضافة: شريط نجاح هادئ يؤكد أن التكليفات ستصل فور نشرها
 * يشارك مفاتيح React-Query مع مدير الأقسام نفسه — أي تحديث فوري بلا طلبات مكررة.
 */

interface CatalogItem {
  id: string
  name: string
}

type CompletenessPayload = {
  departments?: CatalogItem[]
  allDepartments?: CatalogItem[]
  specialties?: CatalogItem[]
  allSpecialties?: CatalogItem[]
}

type Kind = 'nurse' | 'doctor'

const CONFIG: Record<
  Kind,
  {
    endpoint: string
    queryKey: string[]
    mineKey: 'departments' | 'specialties'
    catalogKey: 'allDepartments' | 'allSpecialties'
    unitsLabel: string
    unit: string
    dual: string
    plural: string
    missing: string
    targetPhrase: string
    itemsHint: string
    cta: string
    successTail: string
  }
> = {
  nurse: {
    endpoint: '/api/me/work-departments',
    queryKey: ['my-work-departments'],
    mineKey: 'departments',
    catalogKey: 'allDepartments',
    unitsLabel: 'أقسام العمل',
    unit: 'قسم',
    dual: 'قسمان',
    plural: 'أقسام',
    missing: 'لم تُضف أي قسم عمل بعد',
    targetPhrase:
      'تكليفات الأقسام تصل حصراً للكوادر التي أضافت قسمها ضمن أقسام عملها في ملفها الشخصي',
    itemsHint: 'رقود، طوارئ، عناية، مختبر وغيرها',
    cta: 'أضف أقسام عملك الآن',
    successTail: 'ستصلك تكليفات أقسامك فور نشرها مع إشعار فوري مباشر',
  },
  doctor: {
    endpoint: '/api/me/work-specialties',
    queryKey: ['my-work-specialties'],
    mineKey: 'specialties',
    catalogKey: 'allSpecialties',
    unitsLabel: 'تخصصات العمل',
    unit: 'تخصص',
    dual: 'تخصصان',
    plural: 'تخصصات',
    missing: 'لم تُضف أي تخصص عمل بعد',
    targetPhrase:
      'تكليفات الأطباء تصل حصراً لمن أضاف تخصصه ضمن تخصصات عمله في ملفه الشخصي',
    itemsHint: 'باطنية، جراحة، أطفال، نساء وولادة وغيرها',
    cta: 'أضف تخصصاتك الآن',
    successTail: 'ستصلك تكليفات تخصصاتك فور نشرها مع إشعار فوري مباشر',
  },
}

/** صياغة عدد عربية سليمة: قسم واحد / قسمان / 3 أقسام / 11 قسم */
function arabicCount(n: number, c: { unit: string; dual: string; plural: string }): string {
  if (n === 1) return `${c.unit} واحد`
  if (n === 2) return c.dual
  if (n <= 10) return `${n} ${c.plural}`
  return `${n} ${c.unit}`
}

/** تمرير سلس نحو بطاقة أقسام العمل + وميض تمييز قصير يوجّه عين الكادر فوراً */
function scrollToManager() {
  const el = document.getElementById('departments-section')
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.remove('dept-flash')
  // إعادة تشغيل الأنيميشن حتى لو ضُغط الزر مرتين متتاليتين
  void el.offsetWidth
  el.classList.add('dept-flash')
  window.setTimeout(() => el.classList.remove('dept-flash'), 2400)
}

export function DepartmentsCompletenessAlert({ kind }: { kind: Kind }) {
  const cfg = CONFIG[kind]

  const { data, isLoading } = useQuery({
    queryKey: cfg.queryKey,
    queryFn: () => apiFetcher<CompletenessPayload>(cfg.endpoint),
  })

  // بلا وميض تحميل — لا تنبيه قبل وصول البيانات
  if (isLoading || !data) return null

  const mine = data[cfg.mineKey] ?? []
  const catalog = data[cfg.catalogKey] ?? []
  // كتالوج فارغ: لا يوجد ما يُكمل — مدير الأقسام يعرض ملاحظته الخاصة
  if (catalog.length === 0) return null

  if (mine.length === 0) {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="departments-completeness-alert"
        className="relative overflow-hidden rounded-2xl border border-amber-300/70 bg-gradient-to-l from-amber-50 via-orange-50 to-amber-100/60 p-4 shadow-sm dark:border-amber-800/60 dark:from-amber-950/40 dark:via-orange-950/30 dark:to-amber-950/40"
      >
        <div className="absolute -right-6 -top-6 size-24 rounded-full bg-amber-400/20 blur-xl" />
        <div className="relative flex flex-wrap items-start gap-3">
          <span className="shrink-0 rounded-xl bg-amber-500/15 p-2.5">
            <Sparkles className="size-5 text-amber-600 dark:text-amber-400" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-extrabold text-amber-900 dark:text-amber-200">
              أكمِل ملفك المهني — أضف {cfg.unitsLabel}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-amber-800/90 dark:text-amber-200/80">
              {cfg.missing}. {cfg.targetPhrase} ({cfg.itemsHint}) — أضفها الآن ليصلك إشعار فوري
              بكل تكليف في تخصصك، ويتصدّر ملفك نتائج المطابقة أمام الجهات الصحية.
            </p>
            <Button
              type="button"
              size="sm"
              onClick={scrollToManager}
              aria-label={cfg.cta}
              className="mt-3 gap-1.5 bg-amber-600 text-white hover:bg-amber-700"
            >
              <ChevronDown className="size-4" strokeWidth={2.5} />
              {cfg.cta}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="departments-completeness-success"
      className="flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
    >
      <CheckCircle2 className="size-4 shrink-0" />
      <span>
        ممتاز — {cfg.unitsLabel} مكتملة ({arabicCount(mine.length, cfg)}). {cfg.successTail}.
      </span>
    </div>
  )
}

/** تنبيه إكمال أقسام العمل — الملف الشخصي للكادر التمريضي */
export function NurseDepartmentsAlert() {
  return <DepartmentsCompletenessAlert kind="nurse" />
}

/** تنبيه إكمال تخصصات العمل — الملف الشخصي للطبيب */
export function DoctorDepartmentsAlert() {
  return <DepartmentsCompletenessAlert kind="doctor" />
}
