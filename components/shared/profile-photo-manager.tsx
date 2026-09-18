'use client'

import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, Loader2, RefreshCcw, Trash2, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { apiFetcher } from '@/lib/api-client'
import { ACCEPTED_IMAGE_TYPES, MAX_UPLOAD_BYTES, compressImage } from '@/lib/compress-image'
import { StaffAvatar } from '@/components/shared/staff-avatar'
import { cn, isProfilePhotoRequired } from '@/lib/utils'

/**
 * إدارة صورة البروفايل (الأيقونة) — الجولة 61 | تكليفات | Takleefat
 * =================================================================
 * بطاقة في الملف الشخصي للكادر (الممرض/الطبيب):
 *  - رفع صورة جديدة أو استبدال الحالية (ضغط من جهة العميل قبل الرفع).
 *  - الإزالة متاحة للإناث اختياراً — أما الذكور فالصورة إجبارية
 *    (قرار صاحب المنصة) فيُسمح لهن بالاستبدال فقط.
 *  - توضّح أين تظهر الصورة: المستلمون الإداريون، مشرفو الأطباء،
 *    الإدارة، البطاقة المهنية العامة، والتقديمات.
 */

interface MyProfileLite {
  name: string
  role: string
  status: string
  gender: string | null
  profilePhotoBlobId: string | null
}

export function ProfilePhotoManager() {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)

  const { data } = useQuery({
    queryKey: ['my-profile'],
    queryFn: () => apiFetcher<{ user: MyProfileLite }>('/api/me/profile'),
  })

  const user = data?.user
  const photoUrl = user?.profilePhotoBlobId
    ? `/api/files/blob/${user.profilePhotoBlobId}`
    : null
  const required = isProfilePhotoRequired(user?.role, user?.gender)

  const pickFile = () => fileInputRef.current?.click()

  const onFileSelected = async (file: File | undefined) => {
    if (!file) return
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      toast.error('صيغة الصورة غير مدعومة — استخدم JPG أو PNG أو WEBP')
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error('حجم الصورة يتجاوز 8 ميجابايت')
      return
    }
    setUploading(true)
    try {
      // ضغط من جهة العميل قبل الرفع — نفس نظام مستندات الكادر تماماً
      const { file: compressed } = await compressImage(file)
      const form = new FormData()
      form.append('file', compressed)
      const res = await fetch('/api/me/profile-photo', { method: 'POST', body: form })
      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(payload?.error ?? 'تعذر رفع الصورة — حاول مرة أخرى')
      }
      toast.success(payload?.message ?? 'تم تحديث صورة البروفايل بنجاح')
      await queryClient.invalidateQueries({ queryKey: ['my-profile'] })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removePhoto = async () => {
    setRemoving(true)
    try {
      const res = await fetch('/api/me/profile-photo', { method: 'DELETE' })
      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(payload?.error ?? 'تعذر إزالة الصورة')
      }
      toast.success(payload?.message ?? 'تمت إزالة صورة البروفايل')
      await queryClient.invalidateQueries({ queryKey: ['my-profile'] })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setRemoving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Camera className="size-5 text-primary" />
          صورة البروفايل
          {required && !photoUrl && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
              إجبارية لك — أكملها الآن
            </span>
          )}
        </CardTitle>
        <CardDescription>
          صورتك تظهر للمستلمين الإداريين ومشرفي الأطباء والإدارة، وفي بطاقتك
          المهنية العامة وعند التقديم على التكليفات.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-5">
          {/* المعاينة */}
          <div className="relative">
            {photoUrl ? (
              <StaffAvatar
                name={user?.name ?? 'كادر'}
                photoUrl={photoUrl}
                className="size-24 rounded-3xl border-2 border-primary/20 text-3xl"
              />
            ) : (
              <StaffAvatar
                name={user?.name ?? 'كادر'}
                photoUrl={null}
                className={cn(
                  'size-24 rounded-3xl border-2 border-dashed text-3xl',
                  required
                    ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300'
                    : 'border-border bg-secondary text-muted-foreground'
                )}
              />
            )}
            {uploading && (
              <span className="absolute inset-0 flex items-center justify-center rounded-3xl bg-background/70">
                <Loader2 className="size-6 animate-spin text-primary" />
              </span>
            )}
          </div>

          {/* الأزرار والشرح */}
          <div className="min-w-0 flex-1 space-y-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              {required ? (
                <>
                  الصورة <span className="font-extrabold text-amber-700 dark:text-amber-300">إجبارية للكادر الذكور</span>{' '}
                  واختيارية للإناث لمن ترغب — استخدم صورة واضحة مهنية تُظهر ملامحك.
                </>
              ) : (
                <>
                  الصورة <span className="font-extrabold">اختيارية</span> — لمن ترغب من الإناث
                  والكادر. صورة مهنية واضحة تعزز ثقة الجهات الصحية بملفك.
                </>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => onFileSelected(e.target.files?.[0])}
              />
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                disabled={uploading}
                onClick={pickFile}
              >
                {uploading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : photoUrl ? (
                  <RefreshCcw className="size-4" />
                ) : (
                  <Camera className="size-4" />
                )}
                {photoUrl ? 'استبدال الصورة' : 'رفع صورة'}
              </Button>
              {photoUrl && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-red-600 hover:text-red-700"
                  disabled={removing || required}
                  title={
                    required
                      ? 'الصورة إجبارية للكادر الذكور — استبدلها بصورة أخرى بدلاً من إزالتها'
                      : undefined
                  }
                  onClick={removePhoto}
                >
                  {removing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  إزالة
                </Button>
              )}
            </div>
            {!photoUrl && (
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <UserRound className="size-3.5" />
                حتى ترفع صورتك تظهر الصورة الرمزية بالحرف الأول من اسمك في كل الواجهات.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
