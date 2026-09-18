import { db } from '@/lib/db'

/**
 * خصوصية مستندات الكادر — الجولة 61 | تكليفات | Takleefat
 * ============================================================
 * السياسة المعتمدة من صاحب المنصة (بطلب صريح):
 *  - مستندات الكادر التمريضي والأطباء مخفية عن المستلمين الإداريين
 *    ومشرفي الأطباء نهائياً — تُفتح حصراً بمنح صريح من حساب الإدارة
 *    بعد طلب رسمي بسبب معلن من الطالب.
 *  - الإدارة تقبل أو ترفض الطلب (مع ملاحظة اختيارية) ولها الحق في
 *    سحب المنح في أي وقت — المنح قائم حتى يُسحب، لا مدة انتهاء.
 *  - كل فتح لمحتوى المستندات بمنح إداري يُسجَّل في DocumentAccessLog
 *    (من شاهد ومتى) — شفافية كاملة.
 *  - صورة البروفايل (الأيقونة) استثناء مقصود: يختارها الكادر بنفسه
 *    لتظهر للجميع — إجبارية للذكور واختيارية للإناث.
 *
 * الإخفاء يتم على مستوى الخادم (API) حصراً — لا يُرسل رابط ملف مستند
 * إلى المتصفح قبل تحقق الشرط، حتى لا يتسرب عبر أدوات المطور.
 * (يُقرأ المنح من قاعدة البيانات مباشرة في كل طلب — السحب فوري،
 * بلا أي تخزين مؤقت على الخادم — نفس نمط خصوصية الهاتف.)
 */

/** هل يملك هذا المشاهد صلاحية رؤية مستندات هذا الكادر؟ (منح إداري قائم) */
export async function hasDocumentAccess(
  viewerId: string,
  targetId: string
): Promise<boolean> {
  if (!viewerId || !targetId || viewerId === targetId) return false
  const granted = await db.documentAccessRequest.findFirst({
    where: { requesterId: viewerId, targetId, status: 'APPROVED' },
    select: { id: true },
  })
  return Boolean(granted)
}

/**
 * أحدث طلب رؤية بين طالب وكادر — مصدر حالة الواجهة:
 * NONE (لا طلب) / PENDING / APPROVED / REJECTED / REVOKED
 */
export async function latestDocumentAccessRequest(
  viewerId: string,
  targetId: string
) {
  if (!viewerId || !targetId) return null
  return db.documentAccessRequest.findFirst({
    where: { requesterId: viewerId, targetId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      reason: true,
      reviewNote: true,
      createdAt: true,
      reviewedAt: true,
    },
  })
}

/**
 * تسجيل مشاهدة مستندات (شفافية) — لا تُفشل العملية الأساسية أبداً.
 */
export async function logDocumentAccess(
  requestId: string,
  viewerId: string,
  targetId: string
): Promise<void> {
  try {
    await db.documentAccessLog.create({
      data: { requestId, viewerId, targetId },
    })
  } catch (error) {
    console.error('logDocumentAccess failed:', error)
  }
}

/**
 * هل هذا الـBLOB صورة بروفايل لأي مستخدم؟
 * صور البروفايل تُقدَّم عامة (اختيار صاحبها ظهورها للجميع) —
 * يُفحص هذا في مسار الملفات قبل أي تحقق جلسة.
 */
export async function isProfilePhotoBlob(blobId: string): Promise<boolean> {
  if (!blobId) return false
  const owner = await db.user.findFirst({
    where: { profilePhotoBlobId: blobId },
    select: { id: true },
  })
  return Boolean(owner)
}

/** رابط صورة البروفايل من معرف الـBLOB — null = بلا صورة */
export function profilePhotoUrl(blobId: string | null | undefined): string | null {
  return blobId ? `/api/files/blob/${blobId}` : null
}
