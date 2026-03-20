'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, XCircle, MapPin, Star, ChevronRight, Loader2 } from 'lucide-react'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

interface Lead {
  id: string
  status: string
  fitScore: number | null
  fitReason: string | null
  emailSubject: string | null
  emailBody: string | null
  denialReason: string | null
  sentAt: Date | null
  createdAt: Date
}

interface BusinessInfo {
  id: string
  name: string
  address: string | null
  category: string | null
  rating: string | null
}

interface LeadCardProps {
  lead: Lead
  business: BusinessInfo | null
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    pending: { label: 'Pending', variant: 'secondary' },
    approved: { label: 'Approved', variant: 'default' },
    denied: { label: 'Denied', variant: 'destructive' },
    sent: { label: 'Sent', variant: 'outline' },
  }
  const { label, variant } = map[status] ?? { label: status, variant: 'secondary' }
  return <Badge variant={variant}>{label}</Badge>
}

export function FitScoreBadge({ score }: { score: number }) {
  const color =
    score >= 70
      ? 'text-green-700 bg-green-100'
      : score >= 40
        ? 'text-yellow-700 bg-yellow-100'
        : 'text-red-700 bg-red-100'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}
    >
      <Star className="h-3 w-3" />
      {score}/100
    </span>
  )
}

export function LeadCard({ lead, business }: LeadCardProps) {
  const router = useRouter()
  const [status, setStatus] = useState<string>(lead.status)
  const [showDenyForm, setShowDenyForm] = useState(false)
  const [denyReason, setDenyReason] = useState(lead.denialReason ?? '')
  const [isLoading, setIsLoading] = useState(false)

  async function updateLead(updates: Record<string, unknown>) {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (res.ok) {
        const updated = await res.json()
        setStatus(updated.status)
        router.refresh()
      }
    } finally {
      setIsLoading(false)
    }
  }

  async function handleApprove() {
    await updateLead({ status: 'approved' })
    setShowDenyForm(false)
  }

  async function handleDeny() {
    await updateLead({ status: 'denied', denialReason: denyReason })
    setShowDenyForm(false)
  }

  async function handleSend() {
    setIsLoading(true)
    try {
      await fetch(`/api/leads/${lead.id}/send`, { method: 'POST' })
      setStatus('sent')
      router.refresh()
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-lg">
              {business?.name ?? 'Unknown Business'}
            </CardTitle>
            {business?.address && (
              <p className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="h-3 w-3" />
                {business.address}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <StatusBadge status={status} />
            {lead.fitScore != null && <FitScoreBadge score={lead.fitScore} />}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pb-3">
        <div className="flex items-center gap-2">
          {business?.category && (
            <Badge variant="outline" className="text-xs">
              {business.category}
            </Badge>
          )}
          {business?.rating && (
            <span className="text-xs text-muted-foreground">
              ⭐ {business.rating}
            </span>
          )}
        </div>
        {lead.fitReason && (
          <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
            {lead.fitReason}
          </p>
        )}

        {showDenyForm && (
          <div className="mt-4 flex flex-col gap-2">
            <Label htmlFor={`deny-${lead.id}`}>
              Reason for denial (optional)
            </Label>
            <Textarea
              id={`deny-${lead.id}`}
              value={denyReason}
              onChange={(e) => setDenyReason(e.target.value)}
              placeholder="e.g. Already have a photographer"
              rows={2}
            />
          </div>
        )}
      </CardContent>

      <CardFooter className="flex items-center justify-between gap-2 pt-3">
        <Link href={`/leads/${lead.id}`}>
          <Button variant="ghost" size="sm" className="gap-1">
            View Details
            <ChevronRight className="h-4 w-4" />
          </Button>
        </Link>

        <div className="flex gap-2">
          {status === 'pending' && !showDenyForm && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-destructive hover:bg-destructive/10"
                disabled={isLoading}
                onClick={() => setShowDenyForm(true)}
              >
                <XCircle className="h-4 w-4" />
                Deny
              </Button>
              <Button
                size="sm"
                className="gap-1"
                disabled={isLoading}
                onClick={handleApprove}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Approve
              </Button>
            </>
          )}

          {status === 'pending' && showDenyForm && (
            <>
              <Button
                size="sm"
                variant="ghost"
                disabled={isLoading}
                onClick={() => setShowDenyForm(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={isLoading}
                onClick={handleDeny}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Confirm Deny'
                )}
              </Button>
            </>
          )}

          {status === 'approved' && (
            <Button
              size="sm"
              className="gap-1"
              disabled={isLoading}
              onClick={handleSend}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                '📧 Send Email'
              )}
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  )
}
