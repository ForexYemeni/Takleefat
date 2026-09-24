import { ProfileEditReview, ProfileEditReviewHeader } from '@/components/shared/profile-edit-review'

/**
 * طلبات تعديل الملفات المهنية — الموارد البشرية (الجولة 74)
 * شاشة المراجعة نفسها المتاحة للإدارة — الاعتماد يطبّق القيم فوراً.
 */
export const metadata = { title: 'طلبات تعديل الملفات | فرصة — تكليفات' }

export default function HrProfileEditsPage() {
  return (
    <div className="space-y-4">
      <ProfileEditReviewHeader subtitle="طلبات الكادر والأطباء لتعديل تخصصهم أو مؤهلهم العلمي أو سنوات خبرتهم — راجعها واعتمدها ليُطبَّق التعديل فوراً" />
      <ProfileEditReview />
    </div>
  )
}
