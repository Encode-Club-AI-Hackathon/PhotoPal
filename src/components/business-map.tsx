'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Search, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const DEFAULT_LAT = 37.7749
const DEFAULT_LNG = -122.4194

interface Business {
  place_id: string
  name: string
  vicinity: string
  rating?: number
  geometry: { location: { lat: number; lng: number } }
}

export function BusinessMap() {
  const mapRef = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<google.maps.Map | null>(null)
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [radius, setRadius] = useState('5000')
  const [lat, setLat] = useState(String(DEFAULT_LAT))
  const [lng, setLng] = useState(String(DEFAULT_LNG))

  // Dynamically load Google Maps JS API
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!apiKey || typeof window === 'undefined') return
    if (document.getElementById('gmap-script')) return

    const script = document.createElement('script')
    script.id = 'gmap-script'
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`
    script.async = true
    script.onload = initMap
    document.head.appendChild(script)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function initMap() {
    if (!mapRef.current || !window.google) return
    const m = new window.google.maps.Map(mapRef.current, {
      center: { lat: DEFAULT_LAT, lng: DEFAULT_LNG },
      zoom: 13,
    })
    setMap(m)

    // Try to use user's location
    navigator.geolocation?.getCurrentPosition((pos) => {
      const userLat = pos.coords.latitude
      const userLng = pos.coords.longitude
      setLat(String(userLat))
      setLng(String(userLng))
      m.setCenter({ lat: userLat, lng: userLng })
    })
  }

  async function handleSearch() {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ lat, lng, radius })
      if (keyword) params.set('keyword', keyword)
      const res = await fetch(`/api/businesses/search?${params}`)
      const data = await res.json()
      const results: Business[] = data.results ?? []
      setBusinesses(results)

      if (map) {
        results.forEach((biz) => {
          new window.google.maps.Marker({
            position: biz.geometry.location,
            map,
            title: biz.name,
          })
        })
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Controls */}
      <div className="flex flex-wrap gap-4 rounded-lg border bg-card p-4">
        <div className="flex flex-1 flex-col gap-1 min-w-[160px]">
          <Label>Keyword</Label>
          <Input
            placeholder="restaurant, hotel…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1 w-28">
          <Label>Radius (m)</Label>
          <Input
            type="number"
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
          />
        </div>
        <div className="flex items-end">
          <Button onClick={handleSearch} disabled={isLoading} className="gap-2">
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Search
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Map */}
        <div className="lg:col-span-2">
          <div
            ref={mapRef}
            className="h-[500px] w-full rounded-lg border bg-muted"
          />
          {!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY && (
            <p className="mt-2 text-sm text-muted-foreground">
              Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable the map.
            </p>
          )}
        </div>

        {/* Results sidebar */}
        <div className="flex flex-col gap-3 overflow-y-auto max-h-[500px]">
          {businesses.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
              <MapPin className="h-8 w-8 opacity-40" />
              <p className="text-sm">Search to see nearby businesses</p>
            </div>
          )}
          {businesses.map((biz) => (
            <div
              key={biz.place_id}
              className="rounded-lg border bg-card p-3 text-sm"
            >
              <p className="font-medium">{biz.name}</p>
              <p className="text-muted-foreground">{biz.vicinity}</p>
              {biz.rating && (
                <p className="mt-1 text-xs">⭐ {biz.rating}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
