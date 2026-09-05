'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Eye, FileCheck2, FileText, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetcher, apiPatch } from '@/lib/api-client'
import { formatDateTime, DOCUMENT_STATUS_LABELS, DOCUMENT_TYPE_LABELS, formatFileSize } from '@/lib/utils'
import { StatusBadge } from '@/components/shared/status-badge'
import { EmptyState, DashboardSkeleton } from '@/components/shared/empty-state'
import { DocumentViewer } from '@/components/shared/document-viewer'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface AdminDoc {
  id: string
  userId: string
  type: string
  title: string
  fileUrl: string
  fileName: string
  fileSize: number | null
  mimeType: string | null
  status: string
  reviewNote: string | null
  createdAt: string
  user: { id: string; name: string; phone: string; specialty: string | null; status: string }
}

export default function AdminDocumentsPage() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('PENDING')
  const [viewDoc, setViewDoc] = useState<AdminDoc | null>(null)
  const [rejectDoc, setRejectDoc] = useState<AdminDoc | null>(null)
  const [rejectNote, setRejectNote] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-documents', status],
    queryFn: () => apiFetcher<{ documents: AdminDoc[] }>(`/api/admin/documents?status=${status}`),
  })

  const reviewMutation = useMutation({
    mutationFn: ({ id, newStatus, note }: { id: string; newStatus: string; note?: string }) =>
      apiPatch<{ message: string }>(`/api/admin/documents/${id}`, {
        status: newStatus,
        reviewNote: note ?? '',
      }),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['admin-documents'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      setViewDoc(null)
      setRejectDoc(null)
      setRejectNote('')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const documents = data?.documents ?? []

  if (isLoading) return <DashboardSkeleton />

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">مراجعة المستندات</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          اعتماد أو رفض مستندات الكادر التمريضي: صور المزاولة والبطاقات وشهادات الخبرة
        </p>
      </div>

      <Tabs value={status} onValueChange={setStatus}>
        <TabsList className="h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="PENDING">قيد المراجعة</TabsTrigger>
          <TabsTrigger value="APPROVED">معتمد</TabsTrigger>
          <TabsTrigger value="REJECTED">مرفوض</TabsTrigger>
          <TabsTrigger value="ALL">الكل</TabsTrigger>
        </TabsList>
      </Tabs>

      {documents.length === 0 ? (
        <EmptyState
          icon={FileCheck2}
          title="لا توجد مستندات"
          description="لا توجد مستندات ضمن هذا التصنيف حالياً."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {documents.map((doc) => (
            <div key={doc.id} className="rounded-2xl border bg-card p-4">
              <div className="flex items-start gap-3">
                <span className="rounded-xl bg-secondary p-3">
                  <FileText className="size-5 text-muted-foreground" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold">{doc.title}</p>
                    <StatusBadge status={doc.status} labels={DOCUMENT_STATUS_LABELS} />
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {doc.user.name} — {doc.user.specialty ?? 'بدون تخصص'}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {doc.fileName} • {formatFileSize(doc.fileSize)} • {formatDateTime(doc.createdAt)}
                  </p>
                  {doc.reviewNote && (
                    <p className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700">
                      سبب الرفض: {doc.reviewNote}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setViewDoc(doc)}>
                      <Eye className="size-3.5" />
                      عرض
                    </Button>
                    {doc.status !== 'APPROVED' && (
                      <Button
                        size="sm"
                        className="gap-1.5"
                        disabled={reviewMutation.isPending}
                        onClick={() => reviewMutation.mutate({ id: doc.id, newStatus: 'APPROVED' })}
                      >
                        <CheckCircle2 className="size-3.5" />
                        اعتماد
                      </Button>
                    )}
                    {doc.status !== 'REJECTED' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={() => setRejectDoc(doc)}
                      >
                        <XCircle className="size-3.5" />
                        رفض
                      </Button>
                    )}
                  </div>
                </div>
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

      {/* حوار رفض المستند */}
      <Dialog open={!!rejectDoc} onOpenChange={(open) => !open && setRejectDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>رفض المستند</DialogTitle>
            <DialogDescription>
              سيتم إشعار {rejectDoc?.user.name} بسبب رفض المستند «{rejectDoc?.title}».
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="doc-reject-note">سبب الرفض</Label>
            <Textarea
              id="doc-reject-note"
              rows={3}
              placeholder="مثال: الصورة غير واضحة — يرجى رفع صورة أوضح"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDoc(null)}>
              إلغاء
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectNote.trim() || reviewMutation.isPending}
              onClick={() =>
                rejectDoc && reviewMutation.mutate({ id: rejectDoc.id, newStatus: 'REJECTED', note: rejectNote })
              }
            >
              تأكيد الرفض
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
