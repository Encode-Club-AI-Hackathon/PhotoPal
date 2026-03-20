import { NextRequest, NextResponse } from 'next/server'
import { searchNearbyBusinesses } from '@/lib/google-maps'
import { db } from '@/db'
import { businesses } from '@/db/schema'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const lat = parseFloat(searchParams.get('lat') ?? '')
    const lng = parseFloat(searchParams.get('lng') ?? '')
    const radius = parseInt(searchParams.get('radius') ?? '5000', 10)
    const keyword = searchParams.get('keyword') ?? undefined

    if (isNaN(lat) || isNaN(lng)) {
      return NextResponse.json(
        { error: 'lat and lng query params are required' },
        { status: 400 },
      )
    }

    const data = await searchNearbyBusinesses(lat, lng, radius, keyword)
    const results = data.results ?? []

    // Upsert businesses into DB
    for (const place of results) {
      if (!place.place_id) continue
      await db
        .insert(businesses)
        .values({
          googlePlaceId: place.place_id,
          name: place.name,
          address: place.vicinity,
          latitude: String(place.geometry?.location?.lat ?? ''),
          longitude: String(place.geometry?.location?.lng ?? ''),
          category: place.types?.[0] ?? null,
          rating: place.rating ? String(place.rating) : null,
        })
        .onConflictDoNothing()
    }

    return NextResponse.json({ results })
  } catch (err) {
    console.error('[GET /api/businesses/search]', err)
    return NextResponse.json(
      { error: 'Failed to search businesses' },
      { status: 500 },
    )
  }
}
