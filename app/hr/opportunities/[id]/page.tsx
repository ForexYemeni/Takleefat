import { HrOpportunityDetail } from '@/components/forsah/hr-opportunity-detail'

export const metadata = { title: 'إدارة الفرصة | لوحة الموارد البشرية — تكليفات' }

export default async function HrOpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <HrOpportunityDetail id={id} />
}
