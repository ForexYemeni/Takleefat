'use client'

import { ShieldCheck } from 'lucide-react'
import { DocumentAccessManager } from '@/components/admin/document-access-manager'

/**
 * طلبات رؤية المستندات — حساب الإدارة | الجولة 61
 * طابور القرار + سجل المنح والمرفوضات والمسحوبات.
 */
export default function AdminDocumentAccessPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold">
          <ShieldCheck className="size-6 text-primary" />
          طلبات رؤية المستندات
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          كل طلب من المستلمين الإداريين ومشرفي الأطباء لرؤية مستندات الكادر يمر
          عبر قرارك أنت — قبول أو رفض بسبب معلن، مع حق سحب أي منح في أي وقت.
        </p>
      </div>

      <DocumentAccessManager />
    </div>
  )
}
