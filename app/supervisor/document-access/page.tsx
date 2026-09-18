'use client'

import { KeyRound } from 'lucide-react'
import { DocumentAccessRequestsList } from '@/components/shared/document-access-requests-list'

/**
 * طلبات المستندات — لوحة مشرف الأطباء | الجولة 61
 * طلبات هذا الحساب وحالتها فقط — تُرسل الطلبات الجديدة من سيرة الطبيب.
 */
export default function SupervisorDocumentAccessPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold">
          <KeyRound className="size-6 text-primary" />
          طلبات رؤية المستندات
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          بموجب سياسة الخصوصية، مستندات الأطباء لا تُفتح إلا بموافقة إدارة المنصة
          — تابع هنا طلباتك وحالتها وقرارات الإدارة.
        </p>
      </div>

      <DocumentAccessRequestsList />
    </div>
  )
}
