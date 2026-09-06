'use client'

import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  BriefcaseMedical,
  CalendarDays,
  Clock,
  Coins,
  MapPin,
  Stethoscope,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetcher, apiPost } from '@/lib/api-client'
import { POST_GENDER_LABELS } from '@/lib/utils'
import {
  createPostSchema,
  type CreatePostInput,
  type CreatePostFormValues,
} from '@/lib/validations/post'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/**
 * نافذة إنشاء تكليف مُعلن — تُستخدم في حساب المستلم الإداري وحساب الإدارة:
 * الجهة الصحية من قوائم الإدارة (الموقع يُعبأ تلقائياً) + القسم من قوائم الإدارة
 * + قيمة التكليف + عدد الساعات + الجنس المطلوب — بلا تاريخ انتهاء.
 */

interface HospitalOption {
  id: string
  name: string
  location: string | null
  lat: number | null
  lng: number | null
}

interface DepartmentOption {
  id: string
  name: string
  isActive: boolean
}

interface CreatePostDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (post: { id: string; title: string; number: number }) => void
}

export function CreatePostDialog({ open, onOpenChange, onCreated }: CreatePostDialogProps) {
  const form = useForm<CreatePostFormValues, unknown, CreatePostInput>({
    resolver: zodResolver(createPostSchema),
    defaultValues: {
      title: '',
      description: '',
      hospitalId: '',
      department: '',
      location: '',
      startDate: '',
      nursesNeeded: '1',
      hours: '',
      gender: 'ANY',
      value: '',
    },
  })

  const { data: hospitalsData } = useQuery({
    queryKey: ['hospitals'],
    queryFn: () => apiFetcher<{ hospitals: HospitalOption[] }>('/api/hospitals'),
    enabled: open,
  })
  const { data: departmentsData } = useQuery({
    queryKey: ['departments'],
    queryFn: () => apiFetcher<{ departments: DepartmentOption[] }>('/api/departments'),
    enabled: open,
  })

  const hospitals = hospitalsData?.hospitals ?? []
  const departments = (departmentsData?.departments ?? []).filter((d) => d.isActive)

  const selectedHospitalId = form.watch('hospitalId')
  const selectedHospital = hospitals.find((h) => h.id === selectedHospitalId)

  const submitMutation = async (values: CreatePostInput) => {
    try {
      const res = await apiPost<{ message: string; post: { id: string; title: string; number: number } }>(
        '/api/posts',
        values
      )
      toast.success(`${res.message} (${res.post.title})`)
      onOpenChange(false)
      form.reset()
      onCreated?.(res.post)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>إضافة تكليف مُعلن</DialogTitle>
          <DialogDescription>
            يُنشر التكليف للكادر التمريضي للتقديم — العنوان يُولَّد تلقائياً «التكليف رقم N»
            والموقع يُعبأ تلقائياً من الجهة الصحية المختارة
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(submitMutation)} className="space-y-4" noValidate>
          {/* الجهة الصحية من قوائم الإدارة */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <BriefcaseMedical className="size-3.5" />
              الجهة الصحية (من قوائم الإدارة)
            </Label>
            <Select
              value={selectedHospitalId || undefined}
              onValueChange={(v) => form.setValue('hospitalId', v, { shouldValidate: true })}
            >
              <SelectTrigger>
                <SelectValue placeholder="اختر الجهة الصحية" />
              </SelectTrigger>
              <SelectContent>
                {hospitals.map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.hospitalId && (
              <p className="text-xs text-destructive">{form.formState.errors.hospitalId.message}</p>
            )}
            {/* الموقع يُعبأ تلقائياً 100% من الجهة المختارة */}
            {selectedHospital?.location && (
              <p className="flex items-center gap-1.5 rounded-lg bg-secondary/70 px-3 py-2 text-xs font-semibold">
                <MapPin className="size-3.5 text-primary" />
                الموقع (تلقائي): {selectedHospital.location}
                {selectedHospital.lat != null && selectedHospital.lng != null && (
                  <a
                    href={`https://www.google.com/maps?q=${selectedHospital.lat},${selectedHospital.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="ms-auto font-bold text-teal-600 hover:underline"
                  >
                    عرض على الخريطة
                  </a>
                )}
              </p>
            )}
          </div>

          {/* القسم من قوائم الإدارة */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Stethoscope className="size-3.5" />
                القسم (من قوائم الإدارة)
              </Label>
              <Select
                value={form.watch('department') || undefined}
                onValueChange={(v) => form.setValue('department', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر القسم" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.name}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <CalendarDays className="size-3.5" />
                تاريخ البدء
              </Label>
              <Input type="date" {...form.register('startDate')} />
              {form.formState.errors.startDate && (
                <p className="text-xs text-destructive">{form.formState.errors.startDate.message}</p>
              )}
            </div>
          </div>

          {/* المبلغ + الساعات + الكادر + الجنس */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cp-value" className="flex items-center gap-1.5">
                <Coins className="size-3.5" />
                قيمة التكليف (ريال يمني)
              </Label>
              <Input id="cp-value" type="number" min={1} placeholder="مثال: 120000" {...form.register('value')} />
              {form.formState.errors.value && (
                <p className="text-xs text-destructive">{form.formState.errors.value.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cp-hours" className="flex items-center gap-1.5">
                <Clock className="size-3.5" />
                عدد الساعات
              </Label>
              <Input id="cp-hours" type="number" min={1} placeholder="مثال: 8" {...form.register('hours')} />
              {form.formState.errors.hours && (
                <p className="text-xs text-destructive">{form.formState.errors.hours.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Users className="size-3.5" />
                عدد الكادر المطلوب
              </Label>
              <Input type="number" min={1} max={50} {...form.register('nursesNeeded')} />
              {form.formState.errors.nursesNeeded && (
                <p className="text-xs text-destructive">{form.formState.errors.nursesNeeded.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>الجنس المطلوب</Label>
              <Select
                value={form.watch('gender') || 'ANY'}
                onValueChange={(v) => form.setValue('gender', v as 'MALE' | 'FEMALE' | 'ANY')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['ANY', 'MALE', 'FEMALE'] as const).map((g) => (
                    <SelectItem key={g} value={g}>
                      {POST_GENDER_LABELS[g]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cp-desc">وصف التكليف (اختياري)</Label>
            <Textarea
              id="cp-desc"
              rows={3}
              placeholder="تفاصيل الوردية والمهام المطلوبة..."
              {...form.register('description')}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'جارٍ النشر...' : 'نشر التكليف'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
