'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Hospital as HospitalIcon, ListPlus, MapPin, Stethoscope, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetcher, apiPost, apiPatch, apiDelete } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

/**
 * إدارة قوائم الإدارة: الجهات الصحية (مع الموقع الفعلي) والأقسام الطبية.
 * تظهر القوائم النشطة للمستلم الإداري عند إنشاء التكليف.
 */

interface Hospital {
  id: string
  name: string
  location: string | null
  isActive: boolean
}

interface Department {
  id: string
  name: string
  isActive: boolean
}

export function HospitalManager() {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')

  const { data } = useQuery({
    queryKey: ['admin-hospitals'],
    queryFn: () => apiFetcher<{ hospitals: Hospital[] }>('/api/admin/hospitals'),
  })
  const hospitals = data?.hospitals ?? []

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-hospitals'] })
    queryClient.invalidateQueries({ queryKey: ['hospitals'] })
  }

  const addMutation = useMutation({
    mutationFn: () =>
      apiPost<{ message: string }>('/api/admin/hospitals', { name, location }),
    onSuccess: (res) => {
      toast.success(res.message)
      setName('')
      setLocation('')
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiPatch<{ message: string }>(`/api/admin/hospitals/${id}`, { isActive }),
    onSuccess: (res) => {
      toast.success(res.message)
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete<{ message: string }>(`/api/admin/hospitals/${id}`),
    onSuccess: (res) => {
      toast.success(res.message)
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="h-name">اسم المستشفى / الجهة</Label>
          <Input
            id="h-name"
            placeholder="مثال: مستشفى الملكية"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="h-loc">الموقع الفعلي</Label>
          <Input
            id="h-loc"
            placeholder="مثال: صنعاء — شارع حدة"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
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

      {hospitals.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
          لا توجد جهات صحية بعد — أضف أول مستشفى ليظهر في قوائم إنشاء التكليف
        </p>
      ) : (
        <div className="grid gap-2">
          {hospitals.map((h) => (
            <div
              key={h.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border p-3"
            >
              <span className="rounded-lg bg-secondary p-2">
                <HospitalIcon className="size-4 text-muted-foreground" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{h.name}</p>
                {h.location && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3" />
                    {h.location}
                  </p>
                )}
              </div>
              <Badge
                variant={h.isActive ? 'secondary' : 'outline'}
                className={h.isActive ? 'bg-emerald-50 text-emerald-700' : 'text-muted-foreground'}
              >
                {h.isActive ? 'ظاهر في القوائم' : 'مخفي'}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                aria-label={h.isActive ? 'إخفاء' : 'إظهار'}
                onClick={() => toggleMutation.mutate({ id: h.id, isActive: !h.isActive })}
                disabled={toggleMutation.isPending}
              >
                {h.isActive ? (
                  <X className="size-4 text-amber-600" />
                ) : (
                  <Check className="size-4 text-emerald-600" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="حذف الجهة"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => deleteMutation.mutate(h.id)}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function DepartmentManager() {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')

  const { data } = useQuery({
    queryKey: ['admin-departments'],
    queryFn: () => apiFetcher<{ departments: Department[] }>('/api/admin/departments'),
  })
  const departments = data?.departments ?? []

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-departments'] })
    queryClient.invalidateQueries({ queryKey: ['departments'] })
  }

  const addMutation = useMutation({
    mutationFn: () => apiPost<{ message: string }>('/api/admin/departments', { name }),
    onSuccess: (res) => {
      toast.success(res.message)
      setName('')
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiPatch<{ message: string }>(`/api/admin/departments/${id}`, { isActive }),
    onSuccess: (res) => {
      toast.success(res.message)
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete<{ message: string }>(`/api/admin/departments/${id}`),
    onSuccess: (res) => {
      toast.success(res.message)
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="d-name">اسم القسم الطبي</Label>
          <Input
            id="d-name"
            placeholder="مثال: عناية، طوارئ، رقود، حضانة، قبالة، مختبر"
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

      {departments.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
          لا توجد أقسام بعد — أضف الأقسام: عناية، طوارئ، رقود، حضانة، قبالة، مختبر...
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {departments.map((d) => (
            <span
              key={d.id}
              className="flex items-center gap-1.5 rounded-full border bg-card py-1.5 pe-1.5 ps-3 text-sm"
            >
              <Stethoscope className="size-3.5 text-muted-foreground" />
              <span className={d.isActive ? 'font-bold' : 'font-bold text-muted-foreground line-through'}>
                {d.name}
              </span>
              <button
                type="button"
                aria-label={d.isActive ? `إخفاء ${d.name}` : `إظهار ${d.name}`}
                onClick={() => toggleMutation.mutate({ id: d.id, isActive: !d.isActive })}
                disabled={toggleMutation.isPending}
                className="rounded-full p-1 text-amber-600 hover:bg-amber-50"
              >
                {d.isActive ? <X className="size-3.5" /> : <Check className="size-3.5 text-emerald-600" />}
              </button>
              <button
                type="button"
                aria-label={`حذف ${d.name}`}
                onClick={() => deleteMutation.mutate(d.id)}
                disabled={deleteMutation.isPending}
                className="rounded-full p-1 text-muted-foreground hover:bg-red-50 hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
