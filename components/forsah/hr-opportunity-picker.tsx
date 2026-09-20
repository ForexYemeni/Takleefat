'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Briefcase, Inbox } from 'lucide-react'
import { apiFetcher } from '@/lib/api-client'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ForsahBadge } from '@/components/forsah/opportunity-visuals'
import { cn } from '@/lib/utils'

/**
 * مختار الفرصة + مساحة عمل موحدة — يقود صفحات المتقدمين/المقابلات/المالية
 * من فرص HR نفسه (كل البيانات عبر مسارات الخادم المحمية).
 */
export function HrOpportunityPicker({ label }: { label: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['forsah-opportunities-picker'],
    queryFn: () => apiFetcher<{ opportunities: Array<{ id: string; number: number; title: string; status: string; _count: { applications: number } }> }>('/api/opportunities?take=50'),
  })

  const opportunities = data?.opportunities ?? []
  const selected = opportunities.find((o) => o.id === selectedId) ?? null

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-black">{label}</h1>
      </div>

      {isLoading ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-40 shrink-0 rounded-xl" />)}
        </div>
      ) : opportunities.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed px-6 py-12 text-center">
          <Briefcase className="size-8 text-violet-500" />
          <p className="text-sm font-black">لا توجد فرص بعد</p>
          <Button size="sm" className="rounded-xl bg-violet-600 text-white hover:bg-violet-700" asChild>
            <Link href="/hr/opportunities">أنشئ أول فرصة</Link>
          </Button>
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="اختر الفرصة">
          {opportunities.map((o) => (
            <button
              key={o.id}
              role="tab"
              aria-selected={selectedId === o.id}
              onClick={() => setSelectedId(o.id)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-black transition-colors',
                selectedId === o.id
                  ? 'border-violet-400 bg-violet-100 text-violet-800 dark:border-violet-700 dark:bg-violet-950/50 dark:text-violet-200'
                  : 'bg-card text-muted-foreground hover:bg-accent'
              )}
            >
              <span>فرصة {o.number}</span>
              <span className="max-w-32 truncate">{o.title}</span>
              <Badge variant="secondary" className="px-1.5 text-[10px]">{o._count.applications}</Badge>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-black">{selected.title}</p>
              <ForsahBadge status={selected.status} className="mt-1" />
            </div>
            <Button size="sm" className="rounded-xl bg-violet-600 text-white hover:bg-violet-700" asChild>
              <Link href={`/hr/opportunities/${selected.id}`}>
                <Inbox className="size-4" />
                فتح لوحة الإدارة الكاملة
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
