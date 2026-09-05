'use client'

import { ExternalLink, FileText } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface ViewableDocument {
  fileUrl: string
  fileName: string
  title: string
  mimeType?: string | null
}

/**
 * عارض المستندات — صورة مباشرة أو رابط لملف PDF
 */
export function DocumentViewer({
  document,
  open,
  onOpenChange,
}: {
  document: ViewableDocument | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!document) return null

  const isImage = document.mimeType?.startsWith('image/') ?? /\.(jpe?g|png|webp)$/i.test(document.fileUrl)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{document.title}</DialogTitle>
          <DialogDescription className="flex items-center justify-between gap-2">
            <span className="truncate">{document.fileName}</span>
            <a
              href={document.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-center gap-1 font-semibold text-primary hover:underline"
            >
              فتح في نافذة جديدة
              <ExternalLink className="size-3.5" />
            </a>
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-64 items-center justify-center rounded-xl border bg-secondary/40 p-2">
          {isImage ? (
            <img
              src={document.fileUrl}
              alt={document.title}
              className="max-h-[60vh] w-auto max-w-full rounded-lg object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <FileText className="size-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                هذا المستند بصيغة PDF — اضغط «فتح في نافذة جديدة» لعرضه
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
