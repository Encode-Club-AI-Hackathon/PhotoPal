import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { businesses, leads, photographerProfiles } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { openai } from '@/lib/openai'

interface RouteParams {
  params: { id: string }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const body = await req.json()
    const { userId } = body

    // Load business
    const bizRows = await db
      .select()
      .from(businesses)
      .where(eq(businesses.id, params.id))
      .limit(1)

    if (!bizRows.length) {
      return NextResponse.json(
        { error: 'Business not found' },
        { status: 404 },
      )
    }
    const business = bizRows[0]

    // Load photographer profile
    const profileRows = userId
      ? await db
          .select()
          .from(photographerProfiles)
          .where(eq(photographerProfiles.userId, userId))
          .limit(1)
      : []
    const profile = profileRows[0] ?? null

    // Ask OpenAI to score fit and draft email
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are a sales assistant helping a photographer find business clients.
Given a photographer profile and a business, return a JSON object with:
- fitScore: number 0-100 (how well they match)
- fitReason: string (1-2 sentences explaining the score)
- emailSubject: string (cold outreach email subject line)
- emailBody: string (personalised cold outreach email, 150-200 words, professional tone)`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            photographer: {
              name: profile?.name,
              bio: profile?.bio,
              specialties: profile?.specialties,
              style: profile?.style,
              priceRange: profile?.priceRange,
              location: profile?.location,
            },
            business: {
              name: business.name,
              category: business.category,
              address: business.address,
              website: business.website,
              description: business.description,
              socialMedia: business.socialMedia,
            },
          }),
        },
      ],
    })

    const raw = completion.choices[0].message.content ?? '{}'
    const result = JSON.parse(raw)

    // Save analysis back to business
    await db
      .update(businesses)
      .set({ description: result.fitReason })
      .where(eq(businesses.id, params.id))

    // Create lead
    if (userId) {
      const [lead] = await db
        .insert(leads)
        .values({
          userId,
          businessId: params.id,
          fitScore: result.fitScore,
          fitReason: result.fitReason,
          emailSubject: result.emailSubject,
          emailBody: result.emailBody,
          status: 'pending',
        })
        .returning()

      return NextResponse.json({ ...result, lead })
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[POST /api/businesses/[id]/analyze]', err)
    return NextResponse.json(
      { error: 'Failed to analyse business' },
      { status: 500 },
    )
  }
}
