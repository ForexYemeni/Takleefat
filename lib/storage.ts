import { db } from '@/lib/db'

/**
 * طبقة التخزين — تكليفات | Takleefat
 *
 * تخزين صور المستندات داخل قاعدة البيانات (PostgreSQL/Neon) كـ BLOB:
 * - يعمل على Vercel Serverless بدون تخزين سحابي خارجي
 * - الصور مضغوطة من جهة العميل قبل الرفع (≈ 100-400 كيلوبايت)
 * - تُقدَّم عبر /api/files/blob/{id} مع التحقق من الصلاحيات
 * - يمكن ترقيتها لاحقاً إلى S3/R2 دون تغيير الواجهات
 */

export const MAX_FILE_SIZE = 8 * 1024 * 1024 // 8MB قبل الضغط

/** يُسمح بالصور فقط — البطاقة والمزاولة يجب أن تكون صوراً واضحة */
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export interface StoredFile {
  id: string
  url: string
  fileName: string
  fileSize: number
  mimeType: string
}

export function validateImageFile(file: File): string | null {
  if (!file || file.size === 0) return 'الصورة مطلوبة'
  if (file.size > MAX_FILE_SIZE) return 'حجم الصورة يتجاوز 8 ميجابايت'
  if (!file.type.startsWith('image/')) {
    return 'يُسمح بالصور فقط (JPG / PNG / WEBP) — لا يمكن رفع PDF أو ملفات أخرى'
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return 'صيغة الصورة غير مدعومة — استخدم JPG أو PNG أو WEBP'
  }
  return null
}

/**
 * حفظ الصورة داخل قاعدة البيانات وإرجاع رابط تقديمها
 */
export async function saveImageToDb(file: File): Promise<StoredFile> {
  const error = validateImageFile(file)
  if (error) throw new Error(error)

  const buffer = Buffer.from(await file.arrayBuffer())
  const blob = await db.fileBlob.create({
    data: {
      data: buffer,
      mimeType: file.type === 'image/jpg' ? 'image/jpeg' : file.type,
      size: buffer.length,
    },
    select: { id: true },
  })

  return {
    id: blob.id,
    url: `/api/files/blob/${blob.id}`,
    fileName: file.name,
    fileSize: buffer.length,
    mimeType: file.type === 'image/jpg' ? 'image/jpeg' : file.type,
  }
}
