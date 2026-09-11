'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { IdCard, Loader2, MailPlus, Search, Star, Trash2, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { apiDelete, apiFetcher, apiPost } from '@/lib/api-client'
import { GENDER_LABELS } from '@/lib/utils'
import { AFFILIATION_STATUS_LABELS } from '@/lib/network'
import { StatusBadge } from '@/components/shared/status-badge'
import { EmptyState, DashboardSkeleton } from '@/components/shared/empty-state'
import { FavoriteStar } from '@/components/shared/favorite-star'
import { FullProfileDialog } from '@/components/shared/full-profile-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/**
 * المفضلة الخاصة بصاحب التكليف — واعية بالجمهور (منظومة الأطباء):
 * variant="nurse" (المستلم الإداري): الكوادر المفضلة
 * variant="doctor" (مشرف الأطباء): الأطباء المفضلون
 * بحث + تصنيف + بيانات مهنية + حالة الاعتماد والتوفر + استدعاء مباشر لتكليف مفتوح.
 */
const COPY = {
  nurse: {
    title: 'الكوادر المفضلة',
    subtitle: 'قائمتك الخاصة الموثوقة — لا تظهر لأي مستلم إداري آخر — مع استدعاء مباشر',
    emptyTitle: 'قائمة المفضلة فارغة',
    emptyDesc: 'أضف الكوادر الموثوقين عبر نجمة المفضلة ⭐ في أي بطاقة كادر — التقديمات أو نتائج المطابقة أو كوادر جهتي',
    emptyNoResults: 'لا نتائج مطابقة في مفضلتك',
    inviteDesc: 'اختر تكليفاً مفتوحاً من تكليفاتك المُعلنة — يصل للكادر إشعار بالتفاصيل ويجيب بالقبول أو الرفض',
    personLabel: 'بلا تخصص',
  },
  doctor: {
    title: 'الأطباء المفضلون',
    subtitle: 'قائمتك الخاصة الموثوقة — لا تظهر لأي مشرف أطباء آخر — مع استدعاء مباشر',
    emptyTitle: 'قائمة الأطباء المفضلين فارغة',
    emptyDesc: 'أضف الأطباء الموثوقين عبر نجمة المفضلة ⭐ في بطاقات الأطباء — التقديمات أو أطباء جهتي أو قائمة إنشاء التكليف',
    emptyNoResults: 'لا نتائج مطابقة في مفضلتك',
    inviteDesc: 'اختر تكليفاً مفتوحاً من تكليفاتك المُعلنة — يصل للطبيب إشعار بالتفاصيل ويجيب بالقبول أو الرفض',
    personLabel: 'بلا تخصص',
  },
} as const

interface FavoriteNurseRow {
  id: string
  name: string
  phone: string
  gender: string | null
  specialty: string | null
  qualification: string | null
  yearsOfExperience: number | null
  ratingAverage: number | null
  ratingCount: number
  affiliationStatus: string | null
  isAvailable: boolean
  documentsCount: number
  category: string | null
  note: string | null
}

interface OpenPost {
  id: string
  title: string
  facility: string
  department: string | null
  gender: string
  value: number
}

export function FavoritesManager({ variant = 'nurse' }: { variant?: 'nurse' | 'doctor' }) {
  const copy = COPY[variant]
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [inviteNurse, setInviteNurse] = useState<FavoriteNurseRow | null>(null)
  const [inviteMessage, setInviteMessage] = useState('')
  const [selectedPost, setSelectedPost] = useState<string>('')
  // السيرة الذاتية الكاملة — لمن مُنحه حساب الإدارة الإذن (الجولة 32)
  const [profileUserId, setProfileUserId] = useState<string | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['favorites', search],
    queryFn: () => apiFetcher<{ favorites: FavoriteNurseRow[]; total: number; fullProfileAccess?: boolean }>(
      `/api/receiver/favorites${search ? `?search=${encodeURIComponent(search)}` : ''}`
    ),
  })

  /** إذن رؤية البيانات الكاملة — يفتحه حساب الإدارة حصراً */
  const fullProfileAccess = data?.fullProfileAccess ?? false

  const { data: postsData } = useQuery({
    queryKey: ['receiver-posts-open'],
    queryFn: () => apiFetcher<{ posts: OpenPost[] }>('/api/posts?status=OPEN'),
    enabled: !!inviteNurse,
  })

  const removeMutation = useMutation({
    mutationFn: (nurseId: string) => apiDelete<{ message: string }>(`/api/receiver/favorites?nurseId=${nurseId}`),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['favorites'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const inviteMutation = useMutation({
    mutationFn: () =>
      apiPost<{ message: string }>(`/api/posts/${selectedPost}/invite`, {
        nurseIds: [inviteNurse!.id],
        message: inviteMessage,
      }),
    onSuccess: (res) => {
      toast.success(res.message)
      setInviteNurse(null)
      setInviteMessage('')
      setSelectedPost('')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const favorites = data?.favorites ?? []
  const openPosts = (postsData?.posts ?? []).filter((p) => p.gender === 'ANY' || p.gender === favorites.find((f) => f.id === inviteNurse?.id)?.gender)

  if (isLoading) return <DashboardSkeleton />

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold">
            <Star className="size-6 fill-amber-400 text-amber-400" />
            {copy.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {copy.subtitle}
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="بحث داخل المفضلة..." className="ps-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {favorites.length === 0 ? (
        <EmptyState
          icon={Star}
          title={search ? copy.emptyNoResults : copy.emptyTitle}
          description={copy.emptyDesc}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {favorites.map((n) => (
            <div key={n.id} className="rounded-2xl border bg-card p-4">
              <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <UserRound className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-extrabold">{n.name}</p>
                    <span className="text-xs text-muted-foreground" dir="ltr">{n.phone}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {n.specialty ?? copy.personLabel}
                    {n.yearsOfExperience != null ? ` — ${n.yearsOfExperience} سنة خبرة` : ''}
                    {n.gender ? ` — ${GENDER_LABELS[n.gender]}` : ''}
                  </p>
                </div>
                <FavoriteStar nurseId={n.id} isFavorite size="sm" />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {n.affiliationStatus && (
                  <Badge variant="outline" className="gap-1">
                    حالة الارتباط بجهتك: {AFFILIATION_STATUS_LABELS[n.affiliationStatus] ?? n.affiliationStatus}
                  </Badge>
                )}
                <StatusBadge status={n.isAvailable ? 'ACTIVE' : 'PENDING'} labels={{ ACTIVE: 'متاح الآن', PENDING: 'مشغول حالياً' }} />
                {n.ratingAverage != null && (
                  <Badge variant="secondary" className="text-amber-600">★ {n.ratingAverage} ({n.ratingCount})</Badge>
                )}
                {n.category && <Badge variant="secondary">تصنيف: {n.category}</Badge>}
                {!n.isAvailable && <Badge variant="outline">مشغول بتكليف قائم</Badge>}
              </div>

              <div className="mt-3 flex items-center gap-2">
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    setInviteNurse(n)
                    setSelectedPost('')
                    setInviteMessage('')
                  }}
                >
                  <MailPlus className="size-4" />
                  استدعاء مباشر
                </Button>
                {fullProfileAccess && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-emerald-700 dark:text-emerald-400"
                    onClick={() => {
                      setProfileUserId(n.id)
                      setProfileOpen(true)
                    }}
                  >
                    <IdCard className="size-3.5" />
                    السيرة الذاتية
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-red-600 hover:text-red-600"
                  disabled={removeMutation.isPending}
                  onClick={() => removeMutation.mutate(n.id)}
                >
                  <Trash2 className="size-3.5" />
                  إزالة
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------- حوار الاستدعاء المباشر ---------- */}
      <Dialog open={!!inviteNurse} onOpenChange={(v) => !v && setInviteNurse(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MailPlus className="size-4 text-primary" />
              استدعاء {inviteNurse?.name}
            </DialogTitle>
            <DialogDescription>
              {copy.inviteDesc}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>التكليف المفتوح</Label>
              {openPosts.length === 0 ? (
                <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
                  لا توجد تكليفات مفتوحة في حسابك — أنشئ تكليفاً أولاً ثم استدعِ الكوادر
                </p>
              ) : (
                <Select value={selectedPost || undefined} onValueChange={setSelectedPost}>
                  <SelectTrigger><SelectValue placeholder="اختر التكليف" /></SelectTrigger>
                  <SelectContent>
                    {openPosts.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.title} — {p.facility}{p.department ? ` (${p.department})` : ''} — {p.value} ريال
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-msg">رسالة للاستدعاء (اختياري)</Label>
              <Textarea
                id="invite-msg"
                rows={3}
                placeholder="مثال: نحتاج حضورك لوردية العناية المركزة — التفاصيل في التكليف"
                value={inviteMessage}
                onChange={(e) => setInviteMessage(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteNurse(null)}>إلغاء</Button>
            <Button
              disabled={!selectedPost || inviteMutation.isPending}
              onClick={() => inviteMutation.mutate()}
              className="gap-2"
            >
              {inviteMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <MailPlus className="size-4" />}
              إرسال الاستدعاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- السيرة الذاتية الكاملة — لمن مُنح الإذن من الإدارة (الجولة 32) ---------- */}
      <FullProfileDialog
        userId={profileUserId}
        open={profileOpen}
        onOpenChange={setProfileOpen}
      />
    </div>
  )
}
