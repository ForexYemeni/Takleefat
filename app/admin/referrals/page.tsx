import type { Metadata } from 'next'
import { ReferralsAdmin } from '@/components/admin/referrals-admin'

export const metadata: Metadata = {
  title: 'إدارة الإحالات | تكليفات',
  description: 'إدارة برنامج إحالة تكليفات — الإعدادات والمراجعة والتقارير وسجل العمليات',
}

/**
 * «إدارة الإحالات» — الجولة 75 (برنامج إحالة تكليفات — إضافي بحت)
 * قسم جديد ضمن لوحة الإدارة — لا يحذف ولا يعدل أي قسم قائم.
 */
export default function AdminReferralsPage() {
  return <ReferralsAdmin />
}
