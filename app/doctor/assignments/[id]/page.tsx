'use client'

import { Suspense } from 'react'
import { AssignmentExperience } from '@/components/shared/assignment-experience'
import { DashboardSkeleton } from '@/components/shared/empty-state'

/**
 * صفحة التكليف — الجيل الجديد (الجولة 58)
 * الأطباء: /doctor/assignments/[id]
 * التجربة الموحدة فوق /api/posts/[id] الحالي — صفر تغيير على القيود والمنطق
 */
export default function DoctorAssignmentDetailPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <AssignmentExperience audience="DOCTOR" />
    </Suspense>
  )
}
