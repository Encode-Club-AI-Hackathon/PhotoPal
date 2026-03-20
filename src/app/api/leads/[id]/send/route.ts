import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { leads } from '@/db/schema'
import { eq } from 'drizzle-orm'

interface RouteParams {
  params: { id: string }
}

export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const rows = await db
      .select()
      .from(leads)
      .where(eq(leads.id, params.id))
      .limit(1)

    if (!rows.length) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    const lead = rows[0]

    if (lead.status !== 'approved') {
      return NextResponse.json(
        { error: 'Lead must be approved before sending' },
        { status: 400 },
      )
    }

    // In production, integrate with an email provider (e.g. Resend, SendGrid).
    // For now we mark it as sent.
    const [updated] = await db
      .update(leads)
      .set({ status: 'sent', sentAt: new Date(), updatedAt: new Date() })
      .where(eq(leads.id, params.id))
      .returning()

    return NextResponse.json({ success: true, lead: updated })
  } catch (err) {
    console.error('[POST /api/leads/[id]/send]', err)
    return NextResponse.json(
      { error: 'Failed to send email' },
      { status: 500 },
    )
  }
}
