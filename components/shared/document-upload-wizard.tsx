'use client'

import { useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  CircleDashed,
  FileBadge2,
  FileText,
  GraduationCap,
  IdCard,
  ImagePlus,
  Loader2,
  Lock,
  PartyPopper,
  UploadCloud,
} from 'lucide-react'
import { toast } from 'sonner'
import { compressImage } from '@/lib/compress-image'
import { formatFileSize } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/**
 * معالج رفع المستندات المتسلسل — الجولة 44
 * =====================================================
 * «يرفع البطاقة الشخصية ثم ينتقل تلقائياً لرفع المزاولة ثم تلقائياً لرفع
 * شهادة الخبرة ويتم رفعهم مرة واحدة بدلاً من رفع كل مستند لوحده»:
 *  - خطوات مرقّمة: البطاقة ← المزاولة ← شهادة الخبرة (+ مستند آخر اختياري)
 *  - كل خطوة: مكتملة (علامة خضراء + حالة المراجعة + إمكانية إعادة الرفع) /
 *    الحالية (منطقة سحب وإفلات جاهزة) / قادمة (مقفلة حتى انتهاء الحالية)
 *  - بعد نجاح كل رفع ينتقل تلقائياً للخطوة التالية فوراً — بلا أي نقر إضافي
 *  - إعادة الرفع تستبدل النسخة غير المعتمدة تلقائياً (المعتمدة تبقى كما هي)
 *  - عند اكتمال الثلاثة: حالة احتفالية «اكتمل رفع مستنداتك — بانتظار مراجعة الإدارة»
 * الضغط التلقائي للصور من جهة العميل كما هو (جودة عالية بحجم صغير).
 */

export interface WizardDocument {
  id: string
  type: string
  title: string
  status: string
  fileName: string
  fileSize: number | null
}

interface WizardStep {
  type: 'ID_CARD' | 'PRACTICE_LICENSE' | 'EXPERIENCE_CERT' | 'OTHER'
  title: string
  desc: string
  icon: React.ComponentType<{ className?: string }>
  optional?: boolean
}

const STEPS: WizardStep[] = [
  {
    type: 'ID_CARD',
    title: 'البطاقة الشخصية',
    desc: 'صورة واضحة للبطاقة الشخصية (الوجه كاملاً)',
    icon: IdCard,
  },
  {
    type: 'PRACTICE_LICENSE',
    title: 'صورة المزاولة',
    desc: 'رخصة المزاولة المهنية السارية',
    icon: FileBadge2,
  },
  {
    type: 'EXPERIENCE_CERT',
    title: 'شهادة الخبرة',
    desc: 'شهادة الخبرة أو سجل الخدمة السابقة',
    icon: GraduationCap,
  },
  {
    type: 'OTHER',
    title: 'مستند آخر (اختياري)',
    desc: 'أي مستند داعم إضافي ترغب برفعه',
    icon: FileText,
    optional: true,
  },
]

/** الخطوات الإجبارية الثلاث — تُحتسب في شريط التقدم */
const MANDATORY_TYPES = ['ID_CARD', 'PRACTICE_LICENSE', 'EXPERIENCE_CERT'] as const

export function DocumentUploadWizard({
  documents,
  onChanged,
}: {
  documents: WizardDocument[]
  /** يُستدعى بعد كل تغيير (رفع أو استبدال) — لإبطال استعلامات القائمة */
  onChanged: () => void
}) {
  const [busyType, setBusyType] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState<string | null>(null)
  const [reUploadType, setReUploadType] = useState<string | null>(null)
  const [lastNote, setLastNote] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const activeInputType = useRef<string>('ID_CARD')

  // خريطة: نوع الخطوة ← أحدث مستند من هذا النوع
  const docByType = useMemo(() => {
    const map = new Map<string, WizardDocument>()
    for (const t of STEPS) {
      const found = documents
        .filter((d) => d.type === t.type)
        .sort((a, b) => (a.id < b.id ? 1 : -1))[0]
      if (found) map.set(t.type, found)
    }
    return map
  }, [documents])

  // الخطوة الحالية = أول خطوة إجبارية بلا مستند — إن اكتملت فلا خطوة حالية
  const currentType = MANDATORY_TYPES.find((t) => !docByType.has(t)) ?? null
  const doneCount = MANDATORY_TYPES.filter((t) => docByType.has(t)).length
  const allDone = doneCount === MANDATORY_TYPES.length

  const upload = async (file: File, type: string) => {
    setBusyType(type)
    try {
      // ضغط الصورة من جهة العميل — جودة عالية بحجم صغير (≈ 100-400 كيلوبايت)
      const { file: compressed, originalSize, compressedSize } = await compressImage(file)
      setLastNote(
        originalSize !== compressedSize
          ? `تم ضغط الصورة تلقائياً: ${formatFileSize(originalSize)} ← ${formatFileSize(compressedSize)} مع الحفاظ على الجودة`
          : null
      )

      const formData = new FormData()
      formData.append('file', compressed)
      formData.append('type', type)
      const response = await fetch('/api/upload', { method: 'POST', body: formData })

      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.includes('application/json')) {
        throw new Error(
          response.status === 413
            ? 'حجم الصورة كبير جداً للخادم — جرّب صورة أصغر'
            : `تعذر رفع الصورة (رمز ${response.status}) — تأكد من اتصالك وأعد المحاولة`
        )
      }
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'فشل رفع الصورة')

      // الاستبدال التلقائي: النسخ السابقة غير المعتمدة من نفس النوع تُحذف — المعتمدة تبقى
      const stale = documents.filter(
        (d) => d.type === type && d.status !== 'APPROVED'
      )
      for (const s of stale) {
        try {
          await fetch(`/api/me/documents/${s.id}`, { method: 'DELETE' })
        } catch {
          // الحذف لا يُفشل الرفع
        }
      }

      toast.success(
        type === 'OTHER'
          ? 'تم رفع المستند بنجاح'
          : `تم رفع ${STEPS.find((s) => s.type === type)?.title} بنجاح${!allDone ? ' — انتقلنا للخطوة التالية' : ''}`
      )
      setReUploadType(null)
      onChanged()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusyType(null)
    }
  }

  const openPicker = (type: string) => {
    activeInputType.current = type
    inputRef.current?.click()
  }

  const handleFile = (file: File | undefined) => {
    if (!file) return
    upload(file, activeInputType.current)
  }

  /** منطقة الرفع — تُستخدم في الخطوة الحالية وفي إعادة الرفع */
  const DropZone = ({ type }: { type: string }) => {
    const step = STEPS.find((s) => s.type === type)!
    const busy = busyType === type
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={`رفع ${step.title}`}
        onClick={() => !busy && openPicker(type)}
        onKeyDown={(e) => e.key === 'Enter' && !busy && openPicker(type)}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragOver(type)
        }}
        onDragLeave={() => setIsDragOver(null)}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragOver(null)
          handleFile(e.dataTransfer.files?.[0])
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-5 text-center transition-colors',
          isDragOver === type ? 'border-primary bg-accent' : 'hover:border-primary/50 hover:bg-accent/50'
        )}
      >
        {busy ? (
          <Loader2 className="size-6 animate-spin text-primary" />
        ) : (
          <UploadCloud className="size-6 text-primary" />
        )}
        <p className="text-sm font-bold">
          {busy ? 'جارٍ ضغط الصورة ورفعها...' : 'اضغط لاختيار صورة أو اسحبها هنا'}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {step.desc} — تُضغط تلقائياً قبل الرفع
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
      {/* رأس المعالج + شريط التقدم */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-extrabold">
            <ArrowLeft className="size-4 text-primary" />
            رفع المستندات — خطوات متسلسلة
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            ارفع البطاقة ثم ننتقل تلقائياً للمزاولة ثم لشهادة الخبرة — كل ذلك في مسار واحد
          </p>
        </div>
        <Badge
          variant={allDone ? 'default' : 'secondary'}
          className={cn('gap-1 tabular-nums', allDone && 'bg-emerald-500 text-white')}
        >
          <CheckCircle2 className="size-3" />
          {doneCount} من {MANDATORY_TYPES.length}
        </Badge>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-to-l from-emerald-500 to-teal-500 transition-all"
          style={{ width: `${(doneCount / MANDATORY_TYPES.length) * 100}%` }}
        />
      </div>

      {/* الخطوات */}
      <div className="grid gap-2">
        {STEPS.map((step, i) => {
          const doc = docByType.get(step.type)
          const isCurrent = currentType === step.type
          const isReUploading = reUploadType === step.type
          const isLocked = !step.optional && !isCurrent && !doc
          const Icon = step.icon

          // الخطوة الاختيارية: صف رفع دائم مدمج في الأسفل
          if (step.optional) {
            return (
              <div key={step.type} className="rounded-2xl border border-dashed p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-lg bg-secondary p-2 text-muted-foreground">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold">{step.title}</p>
                    <p className="text-[11px] text-muted-foreground">{step.desc}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 text-[11px]"
                    disabled={busyType != null}
                    onClick={() => openPicker(step.type)}
                  >
                    <ImagePlus className="size-3.5" />
                    رفع
                  </Button>
                </div>
                {doc && (
                  <p className="mt-2 flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                    <CheckCircle2 className="size-3.5" />
                    مرفوع: {doc.title}
                  </p>
                )}
              </div>
            )
          }

          return (
            <div
              key={step.type}
              className={cn(
                'rounded-2xl border p-3 transition-colors',
                isCurrent && 'border-primary/50 bg-primary/[0.03]',
                doc && !isReUploading && 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20',
                isLocked && 'opacity-60'
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                {/* رقم/حالة الخطوة */}
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold',
                    doc
                      ? 'bg-emerald-500 text-white'
                      : isCurrent
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                  )}
                >
                  {doc ? <CheckCircle2 className="size-4" /> : isLocked ? <Lock className="size-3.5" /> : i + 1}
                </span>
                <span className="rounded-lg bg-secondary p-1.5 text-primary">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-xs font-extrabold">
                    {step.title}
                    {isCurrent && !doc && (
                      <Badge variant="secondary" className="text-[9px]">
                        الخطوة الحالية
                      </Badge>
                    )}
                    {isLocked && (
                      <span className="flex items-center gap-0.5 text-[9px] font-bold text-muted-foreground">
                        <CircleDashed className="size-3" />
                        بانتظار الخطوة السابقة
                      </span>
                    )}
                  </p>
                  {doc ? (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      مرفوع{doc.status === 'APPROVED' ? ' ومعتمد من الإدارة ✓' : ' — بانتظار مراجعة الإدارة'}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{step.desc}</p>
                  )}
                </div>
                {doc && !isReUploading && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-[10px] text-muted-foreground"
                    disabled={busyType != null}
                    onClick={() => setReUploadType(step.type)}
                  >
                    <ImagePlus className="size-3" />
                    إعادة الرفع
                  </Button>
                )}
                {doc && !isReUploading && (
                  <span className="shrink-0 text-[10px] font-bold text-muted-foreground tabular-nums">
                    {doc.status === 'APPROVED' ? 'معتمد' : doc.status === 'REJECTED' ? 'مرفوض — أعد الرفع' : 'قيد المراجعة'}
                  </span>
                )}
              </div>

              {/* منطقة الرفع — للخطوة الحالية أو عند إعادة الرفع */}
              {(isCurrent || isReUploading) && (
                <div className="mt-2.5">
                  <DropZone type={step.type} />
                  {isReUploading && (
                    <div className="mt-1.5 flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[10px]"
                        onClick={() => setReUploadType(null)}
                      >
                        تراجع
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* حالة الاكتمال الاحتفالية */}
      {allDone && (
        <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-xs font-extrabold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          <PartyPopper className="size-4 shrink-0" />
          اكتمل رفع مستنداتك الثلاثة — بانتظار مراجعة الإدارة واعتمادها
        </p>
      )}
      {lastNote && (
        <p className="flex items-center gap-2 rounded-xl bg-secondary/60 px-3 py-2 text-[11px] font-bold text-muted-foreground">
          <ImagePlus className="size-3.5 shrink-0" />
          {lastNote}
        </p>
      )}

      {/* منتقي الملفات المخفي — الوحيد في المعالج */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0])
          e.target.value = ''
        }}
        disabled={busyType != null}
      />
    </div>
  )
}
