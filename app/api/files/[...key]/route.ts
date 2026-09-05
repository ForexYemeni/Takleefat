import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { getLocalFilePath } from '@/lib/storage'

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
}

/**
 * GET /api/files/[...key]
 * تقديم الملفات المحلية (بيئة التطوير فقط) مع التحقق من الصلاحيات:
 * - المدير: يمكنه الوصول لجميع الملفات
 * - الكادر التمريضي: ملفاته الخاصة فقط
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return new NextResponse('غير مصرح', { status: 401 })
  }

  const { key: keyParts } = await params
  const key = keyParts.join('/')

  // التحقق من ملكية الملف (المستند مسجل في قاعدة البيانات باسم المجلد = userId)
  if (session.user.role !== 'ADMIN') {
    const owns = await db.document.findFirst({
      where: { fileUrl: { contains: key }, OR: [{ userId: session.user.id }, { userId: keyParts[1] }] },
      select: { id: true },
    })
    if (!owns && !key.startsWith(`documents/${session.user.id}`)) {
      return new NextResponse('ليست لديك صلاحية للوصول إلى هذا الملف', { status: 403 })
    }
  }

  const filePath = getLocalFilePath(key)
  if (!filePath) {
    return new NextResponse('مسار غير صحيح', { status: 400 })
  }

  try {
    const buffer = await readFile(filePath)
    const ext = key.split('.').pop()?.toLowerCase() ?? ''
    const mime = MIME_MAP[ext] ?? 'application/octet-stream'

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': mime,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch {
    return new NextResponse('الملف غير موجود', { status: 404 })
  }
}
