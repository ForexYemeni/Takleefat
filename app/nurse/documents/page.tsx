'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, FileText, FileUp, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetcher, apiDelete } from '@/lib/api-client'
import { formatDateTime, formatFileSize, DOCUMENT_STATUS_LABELS } from '@/lib/utils'
import { StatusBadge } from '@/components/shared/status-badge'
import { EmptyState, DashboardSkeleton } from '@/components/shared/empty-state'
import { DocumentViewer } from '@/components/shared/document-viewer'
import { DocumentUploadWizard } from '@/components/shared/document-upload-wizard'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface MyDocument {
  id: string
  type: string
  title: string
  fileUrl: string
  fileName: string
  fileSize: number | null
  mimeType: string | null
  status: string
  reviewNote: string | null
  createdAt: string
}

const DOC_TYPES = ['ID_CARD', 'PRACTICE_LICENSE', 'EXPERIENCE_CERT', 'OTHER'] as const

export default function NurseDocumentsPage() {
  const queryClient = useQueryClient()
  const [viewDoc, setViewDoc] = useState<MyDocument | null>(null)
  const [filterType, setFilterType] = useState<string>('ALL')

  const { data, isLoading } = useQuery({
    queryKey: ['my-documents'],
    queryFn: () => apiFetcher<{ documents: MyDocument[] }>('/api/me/documents'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete<{ message: string }>(`/api/me/documents/${id}`),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['my-documents'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const documents = data?.documents ?? []
  const filtered =
    filterType === 'ALL' ? documents : documents.filter((d) => d.type === filterType)

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['my-documents'] })
    queryClient.invalidateQueries({ queryKey: ['stats'] })
  }

  if (isLoading) return <DashboardSkeleton />

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">مستنداتي</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          رفع المستندات الرسمية في مسار واحد متسلسل: البطاقة الشخصية ← صورة المزاولة ← شهادة الخبرة
        </p>
      </div>

      {/* الجولة 44: المعالج المتسلسل — رفع واحد تلقائي الانتقال بين الخطوات */}
      <DocumentUploadWizard documents={documents} onChanged={invalidate} />

      {/* فلتر القائمة */}
      {documents.length > 0 && (
        <div className="flex items-center gap-2 sm:w-64">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger aria-label="تصفية المستندات">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">كل المستندات ({documents.length})</SelectItem>
              {DOC_TYPES.map((type) => {
                const count = documents.filter((d) => d.type === type).length
                if (count === 0) return null
                return (
                  <SelectItem key={type} value={type}>
                    {type === 'ID_CARD'
                      ? 'البطاقة الشخصية'
                      : type === 'PRACTICE_LICENSE'
                        ? 'صورة المزاولة'
                        : type === 'EXPERIENCE_CERT'
                          ? 'شهادة الخبرة'
                          : 'مستندات أخرى'}{' '}
                    ({count})
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* قائمة المستندات */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={FileUp}
          title="لم ترفع أي مستندات بعد"
          description="ابدأ من المعالج أعلاه — ارفع البطاقة الشخصية وسننتقل بك تلقائياً للمستند التالي."
        />
      ) : (
        <div className="grid gap-3">
          {filtered.map((doc) => (
            <div
              key={doc.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4"
            >
              <span className="rounded-xl bg-secondary p-3">
                <FileText className="size-5 text-muted-foreground" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold">{doc.title}</p>
                  <StatusBadge status={doc.status} labels={DOCUMENT_STATUS_LABELS} />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {doc.fileName} • {formatFileSize(doc.fileSize)} • {formatDateTime(doc.createdAt)}
                </p>
                {doc.reviewNote && (
                  <p className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700">
                    سبب الرفض: {doc.reviewNote}
                  </p>
                )}
              </div>
              <div className="flex gap-1.5">
                {doc.status === 'APPROVED' && <CheckCircle2 className="size-5 self-center text-emerald-600" />}
                <Button variant="outline" size="sm" onClick={() => setViewDoc(doc)}>
                  عرض
                </Button>
                {doc.status !== 'APPROVED' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="حذف المستند"
                    onClick={() => deleteMutation.mutate(doc.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <DocumentViewer
        document={viewDoc}
        open={!!viewDoc}
        onOpenChange={(open) => !open && setViewDoc(null)}
      />
    </div>
  )
}
