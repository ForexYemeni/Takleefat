import { NurseReview } from '@/components/admin/nurse-review'

export const metadata = { title: 'الأطباء' }

export default function AdminDoctorsPage() {
  return <NurseReview role="DOCTOR" />
}
