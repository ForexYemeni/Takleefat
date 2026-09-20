import { OpportunitiesBrowser } from '@/components/forsah/opportunities-browser'

/**
 * «فرصة — فرص العمل الصحية» للكادر التمريضي — الجولة 66 (ميزة «فرصة»)
 * الفرص المؤهلة حصراً (Eligibility Engine من الخادم) + فرصي
 */
export const metadata = { title: 'فرصة — فرص العمل الصحية | تكليفات' }

export default function NurseOpportunitiesPage() {
  return <OpportunitiesBrowser basePath="/nurse/opportunities" />
}
