'use client'

import { useQuery } from '@tanstack/react-query'
import { apiFetcher } from '@/lib/api-client'
import { isPromoActive } from '@/lib/utils'

/**
 * تلميحات قفل بيانات الاتصال — الجولة 46
 * =====================================================================
 * الوحدة الآمنة للمتصفح والخادم معاً (بلا أي اعتماد على قاعدة البيانات):
 * النص المعروض عند قفل بيانات الاتصال يجب أن يطابق نمط الرسوم الفعلي —
 * فقد كان النص الثابت «يُفتح بعد سداد نسبة الإدارة» يظهر حتى في التكليفات
 * المُنشأة ضمن «عرض بدون رسوم إدارة» — وهو بلاغ صاحب المنصة الحرفي:
 *   «بيانات الاتصال يُفتح بعد سداد نسبة الإدارة رغم انه عرض بدون رسوم»
 *
 * القواعد:
 *  - أثناء العرض النشط (promoActive): التكليفات الجديدة بلا أي رسوم —
 *    الاتصال يُفتح تلقائياً بعد اعتماد الكادر وبدء التكليف بلا أي سداد.
 *  - نمط «رسوم التقديم» (APPLICATION): المطلوب سداد رسوم التقديم.
 *  - نمط «حصة الإدارة» (ADMIN): النص التاريخي — سداد نسبة الإدارة.
 */

export { PHONE_LOCKED_HINT, RECEIVER_CONTACT_LOCKED_HINT } from '@/lib/phone-privacy'

/** حقول الإعدادات اللازمة لتحديد التلميح المناسب فقط */
export interface FeeHintSettings {
  feeMode?: 'APPLICATION' | 'ADMIN'
  applicationFee?: number
  promoActive?: boolean
  promoUntil?: string | null
}

/**
 * النص المناسب لقفل بيانات الاتصال حسب نمط الرسوم الحالي —
 * يُستخدم في الواجهات (شارات القفل وتلميحاتها) ليطابق دائماً واقع الرسوم.
 */
export function contactLockHint(settings?: FeeHintSettings | null): string {
  // أثناء العرض بدون رسوم: لا يوجد أي مبلغ يُسدَّد أصلاً — تلميح السداد مضلل
  if (settings && isPromoActive(settings as Parameters<typeof isPromoActive>[0])) {
    return 'هذا التكليف ضمن عرض بدون رسوم إدارة — تُفتح بيانات الاتصال تلقائياً بعد اعتماد الكادر وبدء سير التكليف، وتُغلق تلقائياً بعد إنهائه'
  }
  if (settings?.feeMode === 'APPLICATION') {
    return 'يُفتح رقم التواصل بعد سداد رسوم التقديم وبدء سير التكليف، ويُغلق تلقائياً بعد إنهائه'
  }
  return 'يُفتح رقم التواصل بعد سداد نسبة الإدارة أثناء سير التكليف، ويُغلق تلقائياً بعد إنهائه'
}

/**
 * خطوات الفتح المناسبة حسب نمط الرسوم — تُعرض في تلميح الشارة المقفلة
 */
export function contactUnlockSteps(settings?: FeeHintSettings | null): string[] {
  if (settings && isPromoActive(settings as Parameters<typeof isPromoActive>[0])) {
    return [
      'اعتمد تكليفاً فعلياً مع الكادر',
      'بيانات الاتصال تُفتح مباشرة أثناء سير التكليف — بلا أي سداد (عرض بدون رسوم)',
      'تُغلق تلقائياً بعد إنهاء التكليف أو إلغائه',
    ]
  }
  return [
    'اعتمد تكليفاً فعلياً مع الكادر',
    settings?.feeMode === 'APPLICATION'
      ? 'سدد رسوم التقديم وتؤكدها الإدارة'
      : 'سدد نسبة الإدارة وتؤكدها الإدارة',
    'يُفتح الرقم أثناء سير التكليف ويُغلق تلقائياً بعد إنهائه',
  ]
}

/**
 * هوك الواجهة: يقرأ إعدادات المنصة مرة واحدة (كاش مشترك مع بانر العرض)
 * ويُرجع التلميح المناسب لنمط الرسوم الحالي.
 */
export function useContactLockHint(): string {
  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiFetcher<{ settings: FeeHintSettings }>('/api/settings'),
    staleTime: 60 * 1000,
  })
  return contactLockHint(data?.settings)
}
