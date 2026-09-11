'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, HeartPulse, ListPlus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetcher, apiPost, apiPatch, apiDelete } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'

/**
 * إدارة كتالوج التخصصات الطبية — منظومة الأطباء
 * التخصصات تُختار عند إنشاء تكليف أطباء ويصرح بها الطبيب ضمن تخصصات عمله.
 */

interface Specialty {
  id: string
  name: string
  isActive: boolean
  _count?: { doctors: number }
}

export function SpecialtyManager() {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [pendingDelete, setPendingDelete] = useState<Specialty | null>(null)

  const { data } = useQuery({
    queryKey: ['admin-specialties'],
    queryFn: () => apiFetcher<{ specialties: Specialty[] }>('/api/admin/specialties'),
  })
  const specialties = data?.specialties ?? []

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-specialties'] })
    queryClient.invalidateQueries({ queryKey: ['specialties'] })
  }

  const addMutation = useMutation({
    mutationFn: () => apiPost<{ message: string }>('/api/admin/specialties', { name }),
    onSuccess: (res) => {
      toast.success(res.message)
      setName('')
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiPatch<{ message: string }>(`/api/admin/specialties/${id}`, { isActive }),
    onSuccess: (res) => {
      toast.success(res.message)
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete<{ message: string }>(`/api/admin/specialties/${id}`),
    onSuccess: (res) => {
      toast.success(res.message)
      setPendingDelete(null)
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="sp-name">اسم التخصص الطبي</Label>
          <Input
            id="sp-name"
            placeholder="مثال: باطنية، جراحة عامة، أطفال، نساء وولادة، قلبية"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="flex items-end">
          <Button
            className="gap-2"
            disabled={!name.trim() || addMutation.isPending}
            onClick={() => addMutation.mutate()}
          >
            <ListPlus className="size-4" />
            إضافة
          </Button>
        </div>
      </div>

      <Separator />

      {specialties.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
          لا توجد تخصصات بعد — أضف التخصصات: باطنية، جراحة عامة، أطفال، نساء وولادة، قلبية...
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {specialties.map((s) => (
            <span
              key={s.id}
              className="flex items-center gap-1.5 rounded-full border bg-card py-1.5 pe-1.5 ps-3 text-sm"
            >
              <HeartPulse className="size-3.5 text-muted-foreground" />
              <span className={s.isActive ? 'font-bold' : 'font-bold text-muted-foreground line-through'}>
                {s.name}
              </span>
              {(s._count?.doctors ?? 0) > 0 && (
                <Badge
                  variant="secondary"
                  className="bg-sky-50 px-1.5 text-[10px] font-bold text-sky-700"
                  title="عدد الأطباء المرتبطين بهذا التخصص ضمن تخصصات عملهم"
                >
                  {s._count!.doctors} طبيب
                </Badge>
              )}
              <button
                type="button"
                aria-label={s.isActive ? `إخفاء ${s.name}` : `إظهار ${s.name}`}
                onClick={() => toggleMutation.mutate({ id: s.id, isActive: !s.isActive })}
                disabled={toggleMutation.isPending}
                className="rounded-full p-1 text-amber-600 hover:bg-amber-50"
              >
                {s.isActive ? <X className="size-3.5" /> : <Check className="size-3.5 text-emerald-600" />}
              </button>
              <button
                type="button"
                aria-label={`حذف ${s.name}`}
                onClick={() => setPendingDelete(s)}
                disabled={deleteMutation.isPending}
                className="rounded-full p-1 text-muted-foreground hover:bg-red-50 hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(v) => !v && setPendingDelete(null)}
        tone="danger"
        title="حذف التخصص الطبي"
        description={
          pendingDelete
            ? `سيتم حذف تخصص «${pendingDelete.name}» نهائياً ولن يظهر في قوائم تكليفات الأطباء. التكليفات السابقة لن تتأثر.`
            : ''
        }
        confirmLabel="نعم، احذف التخصص"
        processing={deleteMutation.isPending}
        onConfirm={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
      />
    </div>
  )
}
