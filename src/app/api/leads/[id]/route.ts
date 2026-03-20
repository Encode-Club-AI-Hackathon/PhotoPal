import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { leads, businesses } from '@/db/schema'
import { eq } from 'drizzle-orm'

interface RouteParams {
  params: { id: string }
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const rows = await db
      .select({ lead: leads, business: businesses })
      .from(leads)
      .leftJoin(businesses, eq(leads.businessId, businesses.id))
      .where(eq(leads.id, params.id))
      .limit(1)

    if (!rows.length) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    return NextResponse.json(rows[0])
  } catch (err) {
    console.error('[GET /api/leads/[id]]', err)
    return NextResponse.json({ error: 'Failed to fetch lead' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const body = await req.json()
    const { status, denialReason, emailSubject, emailBody } = body

    const allowed = ['pending', 'approved', 'denied', 'sent']
    if (status && !allowed.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const [updated] = await db
      .update(leads)
      .set({
        ...(status && { status }),
        ...(denialReason !== undefined && { denialReason }),
        ...(emailSubject !== undefined && { emailSubject }),
        ...(emailBody !== undefined && { emailBody }),
        updatedAt: new Date(),
      })
      .where(eq(leads.id, params.id))
      .returning()

    if (!updated) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    return NextResponse.json(updated)
  } catch (err) {
    console.error('[PATCH /api/leads/[id]]', err)
    return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 })
  }
}
