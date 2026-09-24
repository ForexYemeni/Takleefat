import { ProfileEditReview, ProfileEditReviewHeader } from '@/components/shared/profile-edit-review'

/**
 * طلبات تعديل الملفات المهنية — الإدارة (الجولة 74)
 * المراجعة والاعتماد يطبّقان القيم مباشرة على حسابات الكادر والأطباء.
 */
export const metadata = { title: 'طلبات تعديل الملفات | تكليفات' }

export default function AdminProfileEditsPage() {
  return (
    <div className="space-y-4">
      <ProfileEditReviewHeader subtitle="طلبات الكادر والأطباء لتعديل تخصصهم أو مؤهلهم العلمي أو سنوات خبرتهم — راجعها واعتمدها ليُطبَّق التعديل فوراً" />
      <ProfileEditReview />
    </div>
  )
}
