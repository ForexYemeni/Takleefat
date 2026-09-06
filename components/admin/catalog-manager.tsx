'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  ExternalLink,
  Hospital as HospitalIcon,
  ListPlus,
  Loader2,
  MapPin,
  MapPinned,
  Stethoscope,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetcher, apiPost, apiPatch, apiDelete } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'

/**
 * إدارة قوائم الإدارة: الجهات الصحية (مع الموقع الجغرافي الحقيقي من الخريطة)
 * والأقسام الطبية. تظهر القوائم النشطة للمستلم الإداري عند إنشاء التكليف.
 */

// تحميل الخريطة على العميل فقط (Leaflet لا يعمل على الخادم)
const MapPicker = dynamic(
  () => import('@/components/shared/map-picker').then((m) => m.MapPicker),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-72 items-center justify-center rounded-xl border bg-muted">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    ),
  }
)

interface Hospital {
  id: string
  name: string
  location: string | null
  lat: number | null
  lng: number | null
  isActive: boolean
}

interface Department {
  id: string
  name: string
  isActive: boolean
}

interface MapPoint {
  lat: number
  lng: number
}

export function HospitalManager() {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [point, setPoint] = useState<MapPoint | null>(null)
  const [mapOpen, setMapOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Hospital | null>(null)

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
      apiPost<{ message: string }>('/api/admin/hospitals', {
        name,
        location,
        ...(point ? { lat: point.lat, lng: point.lng } : {}),
      }),
    onSuccess: (res) => {
      toast.success(res.message)
      setName('')
      setLocation('')
      setPoint(null)
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
      setPendingDelete(null)
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const handleMapSelect = (p: MapPoint, label?: string) => {
    setPoint(p)
    // عبّء وصف الموقع تلقائياً من نتيجة البحث إن كان الحقل فارغاً أو مُولَّداً سابقاً من الخريطة
    if (label) setLocation(label)
  }

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
          <Label htmlFor="h-loc" className="flex items-center gap-1.5">
            <MapPin className="size-3.5" />
            الموقع الفعلي (وصف + إحداثيات من الخريطة)
          </Label>
          <Input
            id="h-loc"
            placeholder="مثال: صنعاء — شارع حدة"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          {point && (
            <p className="text-[11px] font-semibold text-emerald-600" dir="ltr">
              {point.lat.toFixed(5)}° , {point.lng.toFixed(5)}°
            </p>
          )}
        </div>
        <div className="flex items-end gap-2">
          <Button
            type="button"
            variant="secondary"
            className="gap-2"
            onClick={() => setMapOpen(true)}
            title="تحديد الموقع الجغرافي على الخريطة"
          >
            <MapPinned className="size-4" />
            الخريطة
            {point && <span className="size-2 rounded-full bg-emerald-500" />}
          </Button>
          <Button
            className="gap-2"
            disabled={!name.trim() || addMutation.isPending}
            onClick={() => addMutation.mutate()}
          >
            {addMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ListPlus className="size-4" />
            )}
            إضافة
          </Button>
        </div>
      </div>

      <Separator />

      {hospitals.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
          لا توجد جهات صحية بعد — أضف أول مستشفى مع موقعه الجغرافي ليظهر في قوائم إنشاء التكليف
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
                <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                  {h.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="size-3" />
                      {h.location}
                    </span>
                  )}
                  {h.lat != null && h.lng != null && (
                    <a
                      href={`https://www.google.com/maps?q=${h.lat},${h.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-0.5 font-semibold text-teal-600 hover:underline"
                      dir="ltr"
                    >
                      <ExternalLink className="size-3" />
                      {h.lat.toFixed(4)}, {h.lng.toFixed(4)}
                    </a>
                  )}
                </p>
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
                onClick={() => setPendingDelete(h)}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* نافذة الخريطة التفاعلية */}
      <Dialog open={mapOpen} onOpenChange={setMapOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPinned className="size-5 text-primary" />
              تحديد الموقع الجغرافي للجهة الصحية
            </DialogTitle>
            <DialogDescription>
              ابحث عن المستشفى بالاسم أو انقر مباشرة على موقعه في الخريطة — ثم اضغط «تأكيد الموقع»
              ليُحفظ مع الجهة ويُعبأ تلقائياً في التكليفات
            </DialogDescription>
          </DialogHeader>
          <MapPicker
            value={point}
            onSelect={handleMapSelect}
          />
          <DialogFooter className="gap-2 sm:justify-start">
            <Button onClick={() => setMapOpen(false)} className="gap-2">
              <Check className="size-4" />
              تأكيد الموقع
            </Button>
            <Button variant="ghost" onClick={() => setMapOpen(false)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* بطاقة تأكيد الحذف الاحترافية */}
      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(v) => !v && setPendingDelete(null)}
        tone="danger"
        title="حذف الجهة الصحية"
        description={
          pendingDelete
            ? `سيتم حذف «${pendingDelete.name}» نهائياً من قوائم الإدارة ولن تظهر عند إنشاء التكليفات الجديدة. التكليفات السابقة لن تتأثر.`
            : ''
        }
        confirmLabel="نعم، احذف الجهة"
        processing={deleteMutation.isPending}
        onConfirm={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
      />
    </div>
  )
}

export function DepartmentManager() {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [pendingDelete, setPendingDelete] = useState<Department | null>(null)

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
      setPendingDelete(null)
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
                onClick={() => setPendingDelete(d)}
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
        title="حذف القسم الطبي"
        description={
          pendingDelete
            ? `سيتم حذف قسم «${pendingDelete.name}» نهائياً ولن يظهر في قوائم إنشاء التكليفات. التكليفات السابقة لن تتأثر.`
            : ''
        }
        confirmLabel="نعم، احذف القسم"
        processing={deleteMutation.isPending}
        onConfirm={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
      />
    </div>
  )
}
