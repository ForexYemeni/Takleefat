import { db } from '@/lib/db'

/**
 * كتالوج المؤهلات العلمية — الجولة 32
 * ------------------------------------------------------------------
 * المؤهلات العلمية أصبحت كتالوجاً مستقلاً تُديره الإدارة (إضافة / تعديل
 * اسم / تعطيل / حذف) بدل القوائم الثابتة، مع تهيئة تلقائية Once بالخيارات
 * التاريخية (3 للكادر التمريضي + 4 للأطباء) حتى لا تنكسر بيانات الحسابات
 * القائمة ولا نماذج التسجيل عند أول تشغيل.
 *
 * مبدأ صارم: التهيئة التلقائية تعكس الخيارات التاريخية فقط ولا تُكرر
 * الإدخال إن وُجد — كل إضافة/تعديل بعدها بيد الإدارة حصراً.
 */

/** الخيارات التاريخية للكادر التمريضي — تُزرع تلقائياً عند أول استخدام */
export const LEGACY_NURSE_QUALIFICATIONS = [
  'أورديلي سنة',
  'دبلوم ثلاث سنوات',
  'بكالوريوس أربع سنوات',
] as const

/** الخيارات التاريخية للأطباء — تُزرع تلقائياً عند أول استخدام */
export const LEGACY_DOCTOR_QUALIFICATIONS = [
  'بكالوريوس طب وجراحة',
  'ماجستير',
  'دكتوراه',
  'شهادة زمالة',
] as const

/**
 * تهيئة الكتالوج بالخيارات التاريخية — تُستدعى من نقاط القراءة فقط.
 * فحص لكل جمهور على حدة حتى لا تُعاد الزراعة بعد حذف الإدارة لأي مؤهل
 * (زرعت مرة واحدة لكل جمهور، وبعد الحذف لا عودة).
 */
export async function ensureQualificationDefaults(): Promise<void> {
  try {
    const [nurseCount, doctorCount] = await Promise.all([
      db.qualification.count({ where: { audience: 'NURSE' } }),
      db.qualification.count({ where: { audience: 'DOCTOR' } }),
    ])

    if (nurseCount === 0) {
      for (const name of LEGACY_NURSE_QUALIFICATIONS) {
        // upsert بدل createMany(skipDuplicates) — skipDuplicates غير مدعوم في SQLite
        await db.qualification.upsert({
          where: { name },
          update: {},
          create: { name, audience: 'NURSE' },
        })
      }
    }

    if (doctorCount === 0) {
      for (const name of LEGACY_DOCTOR_QUALIFICATIONS) {
        await db.qualification.upsert({
          where: { name },
          update: {},
          create: { name, audience: 'DOCTOR' },
        })
      }
    }
  } catch {
    // جدول غير جاهز بعد (قاعدة قديمة قبل الترقية) — لا نعطّل الخدمة
  }
}

/**
 * هل المؤهل صالح للاستخدام لدور معين؟
 * يُقبل: مؤهل نشط من الكتالوج لنفس الجمهور، أو أي مؤهل تاريخي (حماية
 * للحسابات القديمة المسجلة قبل الكتالوج — تظل بياناتها صالحة).
 */
export async function isValidQualification(
  name: string,
  audience: 'NURSE' | 'DOCTOR'
): Promise<boolean> {
  const trimmed = name.trim()
  if (!trimmed) return false

  const legacy =
    audience === 'DOCTOR' ? LEGACY_DOCTOR_QUALIFICATIONS : LEGACY_NURSE_QUALIFICATIONS
  if ((legacy as readonly string[]).includes(trimmed)) return true

  const row = await db.qualification.findUnique({ where: { name: trimmed } })
  return !!row && row.isActive && row.audience === audience
}

/** رسالة خطأ موحدة حسب الجمهور — تُستخدم في كل نقاط التحقق */
export function qualificationErrorMessage(audience: 'NURSE' | 'DOCTOR'): string {
  return audience === 'DOCTOR'
    ? 'مؤهل الطبيب يجب أن يكون من كتالوج المؤهلات العلمية المُدار من حساب الإدارة (أو من الخيارات المعتمدة: بكالوريوس طب وجراحة / ماجستير / دكتوراه / شهادة زمالة)'
    : 'مؤهل الكادر يجب أن يكون من كتالوج المؤهلات العلمية المُدار من حساب الإدارة (أو من الخيارات المعتمدة: أورديلي سنة / دبلوم ثلاث سنوات / بكالوريوس أربع سنوات)'
}
