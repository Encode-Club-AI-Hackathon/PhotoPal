import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { leads, businesses } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'

export async function GET() {
  try {
    const rows = await db
      .select({
        lead: leads,
        business: businesses,
      })
      .from(leads)
      .leftJoin(businesses, eq(leads.businessId, businesses.id))
      .orderBy(desc(leads.createdAt))

    return NextResponse.json(rows)
  } catch (err) {
    console.error('[GET /api/leads]', err)
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId, businessId, fitScore, fitReason, emailSubject, emailBody } =
      body

    if (!userId || !businessId) {
      return NextResponse.json(
        { error: 'userId and businessId are required' },
        { status: 400 },
      )
    }

    const [lead] = await db
      .insert(leads)
      .values({
        userId,
        businessId,
        fitScore,
        fitReason,
        emailSubject,
        emailBody,
        status: 'pending',
      })
      .returning()

    return NextResponse.json(lead, { status: 201 })
  } catch (err) {
    console.error('[POST /api/leads]', err)
    return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 })
  }
}
