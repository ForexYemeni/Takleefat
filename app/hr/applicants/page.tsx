import Link from 'next/link'
import { HrOpportunityPicker } from '@/components/forsah/hr-opportunity-picker'
import { Button } from '@/components/ui/button'
import { Users } from 'lucide-react'

export const metadata = { title: 'المتقدمون | لوحة الموارد البشرية — تكليفات' }

export default function HrApplicantsPage() {
  return (
    <div className="space-y-4">
      <HrOpportunityPicker label="المتقدمون على فرصي" />
      <p className="rounded-2xl border bg-card p-4 text-xs font-bold leading-relaxed text-muted-foreground">
        اختر فرصة من الأعلى ثم افتح لوحة إدارتها الكاملة لمراجعة المتقدمين وتصفية ملفاتهم ودعوتهم للمقابلات واختيار الموظفين.
      </p>
      <Button variant="outline" className="rounded-xl" asChild>
        <Link href="/hr/opportunities">
          <Users className="size-4" />
          كل الفرص
        </Link>
      </Button>
    </div>
  )
}
