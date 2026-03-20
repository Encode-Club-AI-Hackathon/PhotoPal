import { notFound } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/db'
import { leads, businesses } from '@/db/schema'
import { eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, Globe, Phone, MapPin, Star } from 'lucide-react'
import { EmailPreview } from '@/components/email-preview'
import { FitScoreBadge, StatusBadge } from '@/components/lead-card'

interface Props {
  params: { id: string }
}

export default async function LeadDetailPage({ params }: Props) {
  const rows = await db
    .select({ lead: leads, business: businesses })
    .from(leads)
    .leftJoin(businesses, eq(leads.businessId, businesses.id))
    .where(eq(leads.id, params.id))
    .limit(1)

  if (!rows.length) notFound()

  const { lead, business } = rows[0]

  return (
    <div className="container max-w-3xl py-8">
      <Link href="/leads">
        <Button variant="ghost" size="sm" className="mb-6 gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Leads
        </Button>
      </Link>

      <div className="flex flex-col gap-6">
        {/* Business Info */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-2xl">
                  {business?.name ?? 'Unknown Business'}
                </CardTitle>
                <CardDescription className="mt-1 flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {business?.address ?? 'No address'}
                </CardDescription>
              </div>
              <div className="flex flex-col items-end gap-2">
                <StatusBadge status={lead.status} />
                {lead.fitScore != null && (
                  <FitScoreBadge score={lead.fitScore} />
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {business?.category && (
              <Badge variant="outline">{business.category}</Badge>
            )}
            <div className="grid grid-cols-3 gap-4 text-sm">
              {business?.rating && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Star className="h-4 w-4 text-yellow-500" />
                  {business.rating} rating
                </div>
              )}
              {business?.phone && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Phone className="h-4 w-4" />
                  {business.phone}
                </div>
              )}
              {business?.website && (
                <a
                  href={business.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  <Globe className="h-4 w-4" />
                  Website
                </a>
              )}
            </div>
            {lead.fitReason && (
              <>
                <Separator />
                <div>
                  <p className="text-sm font-medium">Why this is a good fit</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {lead.fitReason}
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Email Preview & Actions */}
        <EmailPreview lead={lead} />
      </div>
    </div>
  )
}
