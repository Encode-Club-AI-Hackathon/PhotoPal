import { Suspense } from 'react'
import { db } from '@/db'
import { leads, businesses } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { LeadCard } from '@/components/lead-card'

export const dynamic = 'force-dynamic'
import { Skeleton } from '@/components/ui/skeleton'

async function LeadsList() {
  const rows = await db
    .select({
      lead: leads,
      business: businesses,
    })
    .from(leads)
    .leftJoin(businesses, eq(leads.businessId, businesses.id))
    .orderBy(leads.createdAt)

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <p className="text-lg font-medium">No leads yet</p>
        <p className="text-sm text-muted-foreground">
          Complete onboarding to start generating leads.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      {rows.map(({ lead, business }) => (
        <LeadCard key={lead.id} lead={lead} business={business} />
      ))}
    </div>
  )
}

export default function LeadsPage() {
  return (
    <div className="container py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Leads</h1>
        <p className="text-muted-foreground">
          Approve or deny AI-generated outreach emails for nearby businesses.
        </p>
      </div>
      <Suspense fallback={<LeadsLoading />}>
        <LeadsList />
      </Suspense>
    </div>
  )
}

function LeadsLoading() {
  return (
    <div className="grid gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-40 w-full rounded-lg" />
      ))}
    </div>
  )
}
