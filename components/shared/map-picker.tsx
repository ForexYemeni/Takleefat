'use client'

import { useEffect, useRef, useState } from 'react'
import type { Map as LeafletMap, Marker } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Crosshair, Loader2, MapPin, Search } from 'lucide-react'

/**
 * منتقي الموقع الجغرافي الحقيقي — تكليفات | Takleefat
 * خريطة OpenStreetMap تفاعلية (Leaflet) — نقر لتحديد الموقع بدقة
 * + بحث بالاسم عبر Nominatim + تحديد موقعك الحالي.
 * لا يحتاج أي مفتاح API.
 */

export interface MapPoint {
  lat: number
  lng: number
}

const YEMEN_CENTER: MapPoint = { lat: 15.5527, lng: 48.5164 }

interface MapPickerProps {
  /** الإحداثيات المحددة حالياً (من القاعدة) — لعرضها كبداية */
  value?: MapPoint | null
  /** يُستدعى عند تأكيد اختيار نقطة من الخريطة أو البحث */
  onSelect: (point: MapPoint, label?: string) => void
  className?: string
}

export function MapPicker({ value, onSelect, className }: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const [ready, setReady] = useState(false)
  const [search, setSearch] = useState('')
  const [searching, setSearching] = useState(false)
  const [locating, setLocating] = useState(false)

  // ---------- تهيئة الخريطة ----------
  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const L = (await import('leaflet')).default
      if (cancelled || !containerRef.current || mapRef.current) return

      const center = value ?? YEMEN_CENTER
      const map = L.map(containerRef.current, {
        center: [center.lat, center.lng],
        zoom: value ? 16 : 6.5,
        zoomControl: true,
      })

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(map)

      // دبوس مخصص بعلامة نابضة (بدل أيقونة الصورة الافتراضية التي تتعطل مع الحزم)
      const pin = L.divIcon({
        className: 'takleefat-pin',
        html: `<span style="display:block;width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:linear-gradient(135deg,#0d9488,#0f766e);box-shadow:0 4px 10px rgba(13,148,136,.45);border:2.5px solid #fff"></span>`,
        iconSize: [26, 26],
        iconAnchor: [13, 26],
      })

      if (value) {
        markerRef.current = L.marker([value.lat, value.lng], { icon: pin }).addTo(map)
      }

      map.on('click', (e) => {
        const { lat, lng } = e.latlng
        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng])
        } else {
          markerRef.current = L.marker([lat, lng], { icon: pin }).addTo(map)
        }
        onSelect({ lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) })
      })

      mapRef.current = map
      setReady(true)
      // إعادة الحساب بعد التركيب داخل نافذة/حاوية متغيرة القياس
      setTimeout(() => map.invalidateSize(), 150)
    })()

    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      markerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------- بحث بالاسم (Nominatim — مجاني بلا مفاتيح) ----------
  const handleSearch = async () => {
    const q = search.trim()
    if (!q || searching) return
    setSearching(true)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
        { headers: { 'Accept-Language': 'ar,en' } }
      )
      const results = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>
      if (results.length > 0 && mapRef.current) {
        const L = (await import('leaflet')).default
        const lat = Number(results[0].lat)
        const lng = Number(results[0].lon)
        mapRef.current.setView([lat, lng], 16)
        const pin = L.divIcon({
          className: 'takleefat-pin',
          html: `<span style="display:block;width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:linear-gradient(135deg,#0d9488,#0f766e);box-shadow:0 4px 10px rgba(13,148,136,.45);border:2.5px solid #fff"></span>`,
          iconSize: [26, 26],
          iconAnchor: [13, 26],
        })
        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng])
        } else {
          markerRef.current = L.marker([lat, lng], { icon: pin }).addTo(mapRef.current)
        }
        onSelect({ lat, lng }, results[0].display_name)
      }
    } catch {
      // تجاهل أخطاء الشبكة — يمكن للمستخدم النقر يدوياً
    } finally {
      setSearching(false)
    }
  }

  // ---------- موقعي الحالي ----------
  const handleLocate = () => {
    if (!navigator.geolocation || locating) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const lat = Number(coords.latitude.toFixed(6))
        const lng = Number(coords.longitude.toFixed(6))
        mapRef.current?.setView([lat, lng], 17)
        const L = (await import('leaflet')).default
        const pin = L.divIcon({
          className: 'takleefat-pin',
          html: `<span style="display:block;width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:linear-gradient(135deg,#0d9488,#0f766e);box-shadow:0 4px 10px rgba(13,148,136,.45);border:2.5px solid #fff"></span>`,
          iconSize: [26, 26],
          iconAnchor: [13, 26],
        })
        if (mapRef.current) {
          if (markerRef.current) {
            markerRef.current.setLatLng([lat, lng])
          } else {
            markerRef.current = L.marker([lat, lng], { icon: pin }).addTo(mapRef.current)
          }
        }
        onSelect({ lat, lng })
        setLocating(false)
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  return (
    <div className={className}>
      <div className="mb-2 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            dir="rtl"
            placeholder="ابحث عن المدينة أو المستشفى أو الحي..."
            className="ps-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleSearch()
              }
            }}
          />
        </div>
        <Button type="button" variant="secondary" disabled={searching || !search.trim()} onClick={handleSearch} className="gap-1.5">
          {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          بحث
        </Button>
        <Button type="button" variant="secondary" disabled={locating} onClick={handleLocate} className="gap-1.5" title="موقعي الحالي">
          {locating ? <Loader2 className="size-4 animate-spin" /> : <Crosshair className="size-4" />}
        </Button>
      </div>

      <div className="relative h-72 overflow-hidden rounded-xl border md:h-80">
        <div ref={containerRef} className="absolute inset-0 z-0" dir="ltr" />
        {!ready && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}
        <p className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/60 to-transparent px-3 pb-2 pt-6 text-center text-[11px] font-medium text-white">
          انقر على الخريطة لتحديد موقع الجهة الصحية بدقة
        </p>
      </div>

      {value && (
        <p className="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-secondary/70 px-3 py-1.5 text-center text-xs font-semibold text-secondary-foreground">
          <MapPin className="size-3.5" />
          الإحداثيات المحددة: {value.lat.toFixed(5)}° , {value.lng.toFixed(5)}°
        </p>
      )}
    </div>
  )
}
