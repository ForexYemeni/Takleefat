'use client'

import { BadgeCheck, FileClock, FileWarning } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

/**
 * شارة الاعتماد المهني — الجولة 39
 * =====================================================================
 * فصل مستويي الاعتماد في المنصة:
 *  - اعتماد الجهة (إضافة لمجتمع كوادر الجهة): يمنحه المستلم الإداري
 *    للكادر التمريضي ومشرف الأطباء للأطباء في جهته حصراً.
 *  - الاعتماد المهني (كطبيب/ككادر طبي): من حساب الإدارة حصراً بعد رفع
 *    المستندات والموافقة عليها — لا يمنحه اعتماد الجهة إطلاقاً.
 *
 * هذه الشارة تُظهر الاعتماد المهني حصراً:
 *  - «معتمد من الإدارة»: لديه مستندات معتمدة من حساب الإدارة.
 *  - «مستنداته بانتظار اعتماد الإدارة»: رفع مستندات ولم تعتمدها الإدارة بعد.
 *  - «لم يرفع مستنداته»: لا مستندات له بعد.
 */
export function ProfessionalAccreditationBadge({
  approvedDocuments = 0,
  documentsCount = 0,
  size = 'default',
}: {
  /** عدد المستندات المعتمدة من حساب الإدارة */
  approvedDocuments?: number
  /** إجمالي المستندات المرفوعة */
  documentsCount?: number
  size?: 'default' | 'sm'
}) {
  const cls = size === 'sm' ? 'gap-1 text-[10px] px-1.5 py-0' : 'gap-1 text-[11px]'
  if (approvedDocuments > 0) {
    return (
      <Badge className={`${cls} bg-emerald-600 text-white`} title="رُفعت مستنداته واعتُمدت من حساب الإدارة">
        <BadgeCheck className="size-3" />
        معتمد من الإدارة
      </Badge>
    )
  }
  if (documentsCount > 0) {
    return (
      <Badge
        variant="outline"
        className={`${cls} border-amber-300 text-amber-700 dark:border-amber-900 dark:text-amber-300`}
        title="رفع مستنداته — بانتظار مراجعتها والموافقة عليها من حساب الإدارة"
      >
        <FileClock className="size-3" />
        مستنداته بانتظار اعتماد الإدارة
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      className={`${cls} text-muted-foreground`}
      title="الاعتماد المهني يتطلب رفع المستندات والموافقة عليها من حساب الإدارة"
    >
      <FileWarning className="size-3" />
      لم يرفع مستنداته
    </Badge>
  )
}
