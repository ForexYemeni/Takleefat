'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BadgeCheck,
  Ban,
  Eye,
  FileText,
  MoreHorizontal,
  Search,
  UserX,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiFetcher, apiPatch } from '@/lib/api-client'
import { formatDate, USER_STATUS_LABELS, DOCUMENT_TYPE_LABELS, DOCUMENT_STATUS_LABELS } from '@/lib/utils'
import { StatusBadge } from '@/components/shared/status-badge'
import { EmptyState, DashboardSkeleton } from '@/components/shared/empty-state'
import { DocumentViewer } from '@/components/shared/document-viewer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

export interface AdminUser {
  id: string
  name: string
  phone: string
  role: string
  status: string
  specialty: string | null
  qualification: string | null
  yearsOfExperience: number | null
  rejectNote: string | null
  createdAt: string
  _count: { documents: number; assignments: number }
}

export interface AdminDocument {
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
  user?: { id: string; name: string; phone: string; specialty: string | null; status: string }
}

const STATUS_TABS = [
  { value: 'ALL', label: 'الكل' },
  { value: 'PENDING', label: 'قيد المراجعة' },
  { value: 'APPROVED', label: 'معتمد' },
  { value: 'REJECTED', label: 'مرفوض' },
  { value: 'SUSPENDED', label: 'موقوف' },
] as const

export function NurseReview() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<string>('ALL')
  const [search, setSearch] = useState('')
  const [detailsUser, setDetailsUser] = useState<AdminUser | null>(null)
  const [rejectUser, setRejectUser] = useState<AdminUser | null>(null)
  const [rejectNote, setRejectNote] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', 'NURSE'],
    queryFn: () => apiFetcher<{ users: AdminUser[] }>('/api/admin/users?role=NURSE'),
  })

  const users = (data?.users ?? []).filter((u) => {
    const matchesStatus = status === 'ALL' || u.status === status
    const matchesSearch =
      !search || u.name.includes(search) || u.phone.includes(search)
    return matchesStatus && matchesSearch
  })

  const reviewMutation = useMutation({
    mutationFn: ({ id, newStatus, note }: { id: string; newStatus: string; note?: string }) =>
      apiPatch<{ message: string }>(`/api/admin/users/${id}`, {
        status: newStatus,
        rejectNote: note ?? '',
      }),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      setRejectUser(null)
      setRejectNote('')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const approve = (user: AdminUser) => {
    reviewMutation.mutate({ id: user.id, newStatus: 'APPROVED' })
  }

  const suspend = (user: AdminUser) => {
    reviewMutation.mutate({ id: user.id, newStatus: 'SUSPENDED' })
  }

  if (isLoading) return <DashboardSkeleton />

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-extrabold">الكادر التمريضي</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            مراجعة واعتماد حسابات الكوادر التمريضية في منصة تكليفات
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="بحث بالاسم أو الهاتف..."
            className="ps-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Tabs value={status} onValueChange={setStatus}>
        <TabsList className="h-auto flex-wrap justify-start gap-1">
          {STATUS_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5">
              {tab.label}
              {tab.value !== 'ALL' && (
                <span className="text-xs text-muted-foreground">
                  {(data?.users ?? []).filter((u) => u.status === String(tab.value)).length}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="لا توجد حسابات مطابقة"
          description="لم يتم العثور على حسابات كادر تمريضي ضمن هذا التصنيف."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/60 hover:bg-secondary/60">
                  <TableHead>الاسم</TableHead>
                  <TableHead className="hidden md:table-cell">الهاتف</TableHead>
                  <TableHead className="hidden lg:table-cell">التخصص</TableHead>
                  <TableHead className="hidden lg:table-cell">الخبرة</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="hidden md:table-cell">تاريخ التسجيل</TableHead>
                  <TableHead className="text-start">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <p className="font-bold">{user.name}</p>
                      <p className="text-xs text-muted-foreground md:hidden">{user.phone}</p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell" dir="ltr">
                      <span className="text-start">{user.phone}</span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">{user.specialty ?? '—'}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {user.yearsOfExperience != null ? `${user.yearsOfExperience} سنة` : '—'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={user.status} labels={USER_STATUS_LABELS} />
                      {user.status === 'REJECTED' && user.rejectNote && (
                        <p className="mt-1 max-w-40 truncate text-[11px] text-muted-foreground">
                          {user.rejectNote}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {formatDate(user.createdAt)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="إجراءات الحساب">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => setDetailsUser(user)} className="gap-2">
                            <Eye className="size-4" />
                            عرض التفاصيل
                          </DropdownMenuItem>
                          {user.status !== 'APPROVED' && (
                            <DropdownMenuItem
                              onClick={() => approve(user)}
                              className="gap-2 text-emerald-700 focus:text-emerald-700"
                            >
                              <BadgeCheck className="size-4" />
                              اعتماد الحساب
                            </DropdownMenuItem>
                          )}
                          {user.status !== 'REJECTED' && user.status !== 'APPROVED' && (
                            <DropdownMenuItem
                              onClick={() => setRejectUser(user)}
                              className="gap-2 text-red-600 focus:text-red-600"
                            >
                              <UserX className="size-4" />
                              رفض الحساب
                            </DropdownMenuItem>
                          )}
                          {user.status === 'APPROVED' && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => suspend(user)}
                                className="gap-2 text-red-600 focus:text-red-600"
                              >
                                <Ban className="size-4" />
                                إيقاف الحساب
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* تفاصيل الكادر + مستنداته */}
      <Dialog open={!!detailsUser} onOpenChange={(open) => !open && setDetailsUser(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>بيانات الكادر التمريضي</DialogTitle>
            <DialogDescription>
              بيانات الحساب والمستندات المرفوعة في منصة تكليفات
            </DialogDescription>
          </DialogHeader>
          {detailsUser && <NurseDetails userId={detailsUser.id} />}
        </DialogContent>
      </Dialog>

      {/* رفض الحساب */}
      <Dialog open={!!rejectUser} onOpenChange={(open) => !open && setRejectUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>رفض الحساب</DialogTitle>
            <DialogDescription>
              سيتم إشعار {rejectUser?.name} بسبب الرفض. يجب توضيح السبب.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rejectNote">سبب الرفض</Label>
            <Textarea
              id="rejectNote"
              placeholder="مثال: صورة المزاولة غير واضحة، يرجى رفع نسخة أوضح"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectUser(null)}>
              إلغاء
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectNote.trim() || reviewMutation.isPending}
              onClick={() =>
                rejectUser &&
                reviewMutation.mutate({ id: rejectUser.id, newStatus: 'REJECTED', note: rejectNote })
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

/**
 * تفاصيل الكادر التمريضي + مستنداته داخل الحوار
 */
function NurseDetails({ userId }: { userId: string }) {
  const [viewerDoc, setViewerDoc] = useState<AdminDocument | null>(null)

  const { data: docsData } = useQuery({
    queryKey: ['admin-documents', 'user', userId],
    queryFn: () => apiFetcher<{ documents: AdminDocument[] }>(`/api/admin/documents`),
    select: (res) => ({
      documents: res.documents.filter((d) => d.userId === userId),
    }),
  })

  return (
    <div className="space-y-4">
      {docsData?.documents.length ? (
        <div className="space-y-2">
          <p className="text-sm font-bold">المستندات المرفوعة</p>
          {docsData.documents.map((doc) => (
            <button
              key={doc.id}
              onClick={() => setViewerDoc(doc)}
              className="flex w-full items-center gap-3 rounded-xl border p-3 text-start transition-colors hover:bg-accent"
            >
              <span className="rounded-lg bg-secondary p-2">
                <FileText className="size-4" />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-semibold">{doc.title}</span>
                <span className="block text-xs text-muted-foreground">{doc.fileName}</span>
              </span>
              <StatusBadge status={doc.status} labels={DOCUMENT_STATUS_LABELS} />
            </button>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          لا توجد مستندات مرفوعة لهذا الحساب بعد
        </p>
      )}

      <DocumentViewer
        document={viewerDoc}
        open={!!viewerDoc}
        onOpenChange={(open) => !open && setViewerDoc(null)}
      />
    </div>
  )
}
