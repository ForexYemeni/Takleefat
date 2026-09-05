import { AwsClient } from 'aws4fetch'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'

/**
 * طبقة التخزين — تكليفات | Takleefat
 *
 * الإنتاج: تخزين سحابي متوافق مع S3 (Cloudflare R2 / Supabase Storage / AWS S3)
 * ويُحفظ رابط الملف فقط في قاعدة البيانات.
 *
 * التطوير المحلي فقط: محرك "local" يحفظ الملفات في مجلد db/uploads
 * (غير مناسب لبيئة Vercel Serverless — انظر README).
 */

export const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const

export const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf']

export interface UploadResult {
  url: string
  key: string
  fileName: string
  fileSize: number
  mimeType: string
}

export function isCloudStorageConfigured(): boolean {
  return Boolean(
    process.env.STORAGE_ENDPOINT &&
      process.env.STORAGE_BUCKET &&
      process.env.STORAGE_ACCESS_KEY &&
      process.env.STORAGE_SECRET_KEY
  )
}

export function getStorageDriver(): 's3' | 'local' {
  return isCloudStorageConfigured() ? 's3' : 'local'
}

export function validateFile(file: File): string | null {
  if (!file || file.size === 0) return 'الملف مطلوب'
  if (file.size > MAX_FILE_SIZE) return 'حجم الملف يتجاوز 5 ميجابايت'
  if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
    return 'نوع الملف غير مدعوم (الصور JPG/PNG/WEBP أو PDF فقط)'
  }
  return null
}

function buildStorageKey(userId: string, fileName: string): string {
  const ext = path.extname(fileName).toLowerCase() || '.bin'
  return `documents/${userId}/${Date.now()}-${randomUUID()}${ext}`
}

async function uploadToS3(file: File, key: string): Promise<string> {
  const endpoint = process.env.STORAGE_ENDPOINT!.replace(/\/$/, '')
  const bucket = process.env.STORAGE_BUCKET!
  const region = process.env.STORAGE_REGION || 'auto'

  const client = new AwsClient({
    accessKeyId: process.env.STORAGE_ACCESS_KEY!,
    secretAccessKey: process.env.STORAGE_SECRET_KEY!,
    region,
  })

  const buffer = Buffer.from(await file.arrayBuffer())
  const url = `${endpoint}/${bucket}/${key}`

  const response = await client.fetch(url, {
    method: 'PUT',
    body: new Uint8Array(buffer),
    headers: {
      'Content-Type': file.type,
      'Content-Length': String(buffer.length),
    },
  })

  if (!response.ok) {
    throw new Error(`فشل رفع الملف إلى التخزين السحابي (${response.status})`)
  }

  // رابط الملف العام
  const publicUrl = process.env.STORAGE_PUBLIC_URL?.replace(/\/$/, '')
  return publicUrl ? `${publicUrl}/${key}` : url
}

async function uploadToLocal(file: File, key: string): Promise<string> {
  const uploadsDir = path.join(process.cwd(), 'db', 'uploads', path.dirname(key))
  await mkdir(uploadsDir, { recursive: true })

  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(path.join(process.cwd(), 'db', 'uploads', key), buffer)

  return `/api/files/${key}`
}

export async function uploadFile(file: File, userId: string): Promise<UploadResult> {
  const error = validateFile(file)
  if (error) throw new Error(error)

  const key = buildStorageKey(userId, file.name)
  const driver = getStorageDriver()

  const url = driver === 's3' ? await uploadToS3(file, key) : await uploadToLocal(file, key)

  return {
    url,
    key,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type,
  }
}

export function getLocalFilePath(key: string): string | null {
  // منع Path Traversal
  if (key.includes('..') || key.startsWith('/')) return null
  return path.join(process.cwd(), 'db', 'uploads', key)
}
