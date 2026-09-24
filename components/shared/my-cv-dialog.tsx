'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileUser, Loader2 } from 'lucide-react'
import { apiFetcher } from '@/lib/api-client'
import { ProfessionalCv, type CvData } from '@/components/shared/professional-cv'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/**
 * زر + حوار «سيرتي الذاتية» — الجولة 74 (إضافي بحت كلياً)
 * ==========================================================
 * «تظهر للمستخدم السيرة الذاتية الخاصة به بشكل احترافي جداً في بطاقته
 *  المهنية» — يُعرض في صفحتي البطاقة المهنية (/nurse/card و /doctor/card)
 * ويجلب السيرة من /api/me/cv (البيانات الحية حصراً) ويقترح الطباعة PDF.
 */
export function MyCvDialog({ approved }: { approved: boolean }) {
  const [open, setOpen] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['my-cv'],
    queryFn: () => apiFetcher<{ cv: CvData }>('/api/me/cv'),
    enabled: open,
  })

  const cv = data?.cv

  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2" variant={approved ? 'default' : 'outline'}>
        <FileUser className="size-4" />
        سيرتي الذاتية الكاملة
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader className="sr-only">
            <DialogTitle>سيرتي الذاتية</DialogTitle>
            <DialogDescription>السيرة الذاتية الكاملة لبياناتك المهنية الحية</DialogDescription>
          </DialogHeader>

          {isLoading && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
              <Loader2 className="size-7 animate-spin text-primary" />
              <p className="text-sm font-bold">جارٍ تجهيز سيرتك الذاتية...</p>
            </div>
          )}

          {!isLoading && (error || !cv) && (
            <p className="py-12 text-center text-sm font-bold text-muted-foreground">
              تعذر تحميل السيرة الذاتية — أعد المحاولة
            </p>
          )}

          {!isLoading && cv && <ProfessionalCv cv={cv} printLabel="طباعة السيرة / حفظ PDF" />}
        </DialogContent>
      </Dialog>
    </>
  )
}
