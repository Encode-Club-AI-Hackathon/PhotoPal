import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { photographerProfiles, users } from '@/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json(
        { error: 'userId query param required' },
        { status: 400 },
      )
    }

    const rows = await db
      .select()
      .from(photographerProfiles)
      .where(eq(photographerProfiles.userId, userId))
      .limit(1)

    return NextResponse.json(rows[0] ?? null)
  } catch (err) {
    console.error('[GET /api/profile]', err)
    return NextResponse.json(
      { error: 'Failed to fetch profile' },
      { status: 500 },
    )
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      civicUserId,
      name,
      bio,
      location,
      latitude,
      longitude,
      style,
      specialties,
      equipment,
      priceRange,
      yearsExperience,
      portfolioUrl,
    } = body

    if (!civicUserId) {
      return NextResponse.json(
        { error: 'civicUserId is required' },
        { status: 400 },
      )
    }

    // Upsert user
    const [user] = await db
      .insert(users)
      .values({ civicUserId })
      .onConflictDoUpdate({
        target: users.civicUserId,
        set: { updatedAt: new Date() },
      })
      .returning()

    // Upsert photographer profile
    const existing = await db
      .select()
      .from(photographerProfiles)
      .where(eq(photographerProfiles.userId, user.id))
      .limit(1)

    let profile
    if (existing.length) {
      ;[profile] = await db
        .update(photographerProfiles)
        .set({
          name,
          bio,
          location,
          latitude,
          longitude,
          style,
          specialties,
          equipment,
          priceRange,
          yearsExperience,
          portfolioUrl,
          updatedAt: new Date(),
        })
        .where(eq(photographerProfiles.userId, user.id))
        .returning()
    } else {
      ;[profile] = await db
        .insert(photographerProfiles)
        .values({
          userId: user.id,
          name,
          bio,
          location,
          latitude,
          longitude,
          style,
          specialties,
          equipment,
          priceRange,
          yearsExperience,
          portfolioUrl,
        })
        .returning()
    }

    return NextResponse.json(profile)
  } catch (err) {
    console.error('[PUT /api/profile]', err)
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 },
    )
  }
}
