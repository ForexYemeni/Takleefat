import { Suspense } from 'react'
import { HrOpportunitiesManager } from '@/components/forsah/hr-opportunities-manager'

export const metadata = { title: 'الفرص | لوحة الموارد البشرية — تكليفات' }

export default function HrOpportunitiesPage() {
  // Suspense: المعالج يقرأ useSearchParams (?new=1 من الزر المركزي)
  return (
    <Suspense>
      <HrOpportunitiesManager />
    </Suspense>
  )
}
