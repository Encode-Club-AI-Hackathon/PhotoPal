export const GOOGLE_MAPS_API_KEY =
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ''

export const GOOGLE_PLACES_API_KEY =
  process.env.GOOGLE_PLACES_API_KEY ?? ''

export async function searchNearbyBusinesses(
  lat: number,
  lng: number,
  radius: number,
  keyword?: string,
) {
  const url = new URL(
    'https://maps.googleapis.com/maps/api/place/nearbysearch/json',
  )
  url.searchParams.set('location', `${lat},${lng}`)
  url.searchParams.set('radius', String(radius))
  url.searchParams.set('type', 'establishment')
  if (keyword) url.searchParams.set('keyword', keyword)
  url.searchParams.set('key', GOOGLE_PLACES_API_KEY)

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Places API error: ${res.statusText}`)
  return res.json()
}

export async function getPlaceDetails(placeId: string) {
  const url = new URL(
    'https://maps.googleapis.com/maps/api/place/details/json',
  )
  url.searchParams.set('place_id', placeId)
  url.searchParams.set(
    'fields',
    'name,formatted_address,geometry,website,formatted_phone_number,rating,types',
  )
  url.searchParams.set('key', GOOGLE_PLACES_API_KEY)

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Places details API error: ${res.statusText}`)
  return res.json()
}
