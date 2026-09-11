import { FavoritesManager } from '@/components/receiver/favorites-manager'

export const metadata = { title: 'الأطباء المفضلون' }

export default function SupervisorFavoritesPage() {
  return <FavoritesManager variant="doctor" />
}
