'use client'

/**
 * ضغط الصور من جهة العميل قبل الرفع — تكليفات | Takleefat
 *
 * الهدف: صور المستندات (البطاقة، المزاولة) تُرفع بجودة عالية وضغط ذكي:
 * - تصغير الأبعاد إلى حد أقصى 1600px (يكفي لقراءة نصوص البطاقة بوضوح)
 * - إعادة ترميز JPEG بجودة 0.85 تدريجياً حتى الوصول للحجم المستهدف
 * - الحفاظ على نسبة الأبعاد الأصلية بدون قص
 */

export const MAX_IMAGE_DIMENSION = 1600
export const TARGET_SIZE_BYTES = 400 * 1024 // 400KB الهدف بعد الضغط
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024 // 8MB حد الملف الأصلي قبل الضغط

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

export interface CompressResult {
  file: File
  originalSize: number
  compressedSize: number
}

function loadImageBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file)
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('تعذر قراءة الصورة — تأكد من أن الملف صورة سليمة'))
    }
    img.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('فشل ضغط الصورة'))),
      'image/jpeg',
      quality
    )
  })
}

/**
 * ضغط صورة إلى JPEG عالي الجودة بحجم صغير مناسب للرفع
 */
export async function compressImage(file: File): Promise<CompressResult> {
  if (!file.type.startsWith('image/')) {
    throw new Error('يُسمح بالصور فقط (JPG / PNG / WEBP) — لا يمكن رفع ملفات أخرى')
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('حجم الصورة كبير جداً — الحد الأقصى 8 ميجابايت')
  }

  const bitmap = await loadImageBitmap(file)
  const srcWidth = 'width' in bitmap ? bitmap.width : 0
  const srcHeight = 'height' in bitmap ? bitmap.height : 0
  if (!srcWidth || !srcHeight) {
    throw new Error('تعذر قراءة أبعاد الصورة')
  }

  // حساب الأبعاد الجديدة مع الحفاظ على النسبة
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(srcWidth, srcHeight))
  const width = Math.round(srcWidth * scale)
  const height = Math.round(srcHeight * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('فشل معالجة الصورة في المتصفح')

  // خلفية بيضاء للصور الشفافة (PNG) حتى لا تتحول لسواد في JPEG
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, width, height)
  if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close()

  // ضغط تدريجي: نبدأ بجودة عالية ونخفض حتى الوصول للحجم المستهدف
  let quality = 0.85
  let blob = await canvasToBlob(canvas, quality)
  while (blob.size > TARGET_SIZE_BYTES && quality > 0.5) {
    quality -= 0.1
    blob = await canvasToBlob(canvas, quality)
  }

  const compressed = new File([blob], buildJpegName(file.name), { type: 'image/jpeg' })
  return { file: compressed, originalSize: file.size, compressedSize: compressed.size }
}

function buildJpegName(originalName: string): string {
  const base = originalName.replace(/\.[^.]+$/, '').trim() || 'document'
  return `${base.replace(/[^\p{L}\p{N}\s_-]/gu, '').slice(0, 60) || 'document'}.jpg`
}
