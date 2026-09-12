import { OrganizationsManager } from '@/components/admin/organizations-manager'
import { ReceiverOrgRequests } from '@/components/admin/receiver-org-requests'

export const metadata = { title: 'الجهات الصحية' }

export default function AdminOrganizationsPage() {
  return (
    <div className="space-y-4">
      {/* الجولة 44: طلبات ربط جهات صحية بمسؤوليها — قرار الإدارة */}
      <ReceiverOrgRequests />
      <OrganizationsManager />
    </div>
  )
}
