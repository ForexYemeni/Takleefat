'use client'

import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, FileText, FileUp, Trash2, UploadCloud } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetcher, apiDelete } from '@/lib/api-client'
import { formatDateTime, formatFileSize, DOCUMENT_STATUS_LABELS, DOCUMENT_TYPE_LABELS } from '@/lib/utils'
import { StatusBadge } from '@/components/shared/status-badge'
import { EmptyState, DashboardSkeleton } from '@/components/shared/empty-state'
import { DocumentViewer } from '@/components/shared/document-viewer'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'

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
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [docType, setDocType] = useState<string>('ID_CARD')
  const [isDragOver, setIsDragOver] = useState(false)
  const [viewDoc, setViewDoc] = useState<MyDocument | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['my-documents'],
    queryFn: () => apiFetcher<{ documents: MyDocument[] }>('/api/me/documents'),
  })

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', docType)
      const response = await fetch('/api/upload', { method: 'POST', body: formData })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'فشل رفع الملف')
      return result as { message: string }
    },
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['my-documents'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    onError: (e: Error) => toast.error(e.message),
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

  const handleFile = (file: File | undefined) => {
    if (!file) return
    uploadMutation.mutate(file)
  }

  const documents = data?.documents ?? []

  if (isLoading) return <DashboardSkeleton />

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">مستنداتي</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          رفع المستندات الرسمية: البطاقة الشخصية، صورة المزاولة، وشهادات الخبرة
        </p>
      </div>

      {/* منطقة الرفع */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">رفع مستند جديد</CardTitle>
          <CardDescription>
            الصور (JPG / PNG / WEBP) أو PDF — بحد أقصى 5 ميجابايت. يُخزَّن الملف في تخزين سحابي آمن.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 sm:w-72">
            <Label>نوع المستند</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {DOCUMENT_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div
            role="button"
            tabIndex={0}
            aria-label="رفع ملف"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragOver(true)
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setIsDragOver(false)
              handleFile(e.dataTransfer.files?.[0])
            }}
            className={`flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
              isDragOver ? 'border-primary bg-accent' : 'hover:border-primary/50 hover:bg-accent/50'
            }`}
          >
            <span className="rounded-full bg-secondary p-4">
              <UploadCloud className="size-7 text-primary" />
            </span>
            <div>
              <p className="font-bold">
                {uploadMutation.isPending ? 'جارٍ رفع الملف...' : 'اضغط لاختيار ملف أو اسحبه هنا'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                سيُرسل المستند إلى إدارة المنصة للمراجعة والاعتماد
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.pdf"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
              disabled={uploadMutation.isPending}
            />
          </div>
        </CardContent>
      </Card>

      {/* قائمة المستندات */}
      {documents.length === 0 ? (
        <EmptyState
          icon={FileUp}
          title="لم ترفع أي مستندات بعد"
          description="ابدأ برفع البطاقة الشخصية وصورة المزاولة لاعتماد حسابك."
        />
      ) : (
        <div className="grid gap-3">
          {documents.map((doc) => (
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
