'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Edit2, Send, Loader2 } from 'lucide-react'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface Lead {
  id: string
  status: string
  emailSubject: string | null
  emailBody: string | null
}

export function EmailPreview({ lead }: { lead: Lead }) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [subject, setSubject] = useState(lead.emailSubject ?? '')
  const [body, setBody] = useState(lead.emailBody ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [isSending, setIsSending] = useState(false)

  async function saveEdits() {
    setIsSaving(true)
    await fetch(`/api/leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailSubject: subject, emailBody: body }),
    })
    setIsSaving(false)
    setIsEditing(false)
  }

  async function sendEmail() {
    setIsSending(true)
    await fetch(`/api/leads/${lead.id}/send`, { method: 'POST' })
    setIsSending(false)
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Mail className="h-5 w-5" />
            Email Draft
          </CardTitle>
          {!isEditing && lead.status === 'approved' && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => setIsEditing(true)}
            >
              <Edit2 className="h-4 w-4" />
              Edit
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {isEditing ? (
          <>
            <div className="grid gap-2">
              <Label>Subject</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Body</Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Subject
              </p>
              <p className="mt-1 font-medium">{subject || '(no subject)'}</p>
            </div>
            <div className="rounded-md bg-muted/40 p-4">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                {body || '(no email body)'}
              </pre>
            </div>
          </>
        )}
      </CardContent>

      <CardFooter className="flex justify-end gap-2">
        {isEditing ? (
          <>
            <Button
              variant="ghost"
              onClick={() => setIsEditing(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button onClick={saveEdits} disabled={isSaving} className="gap-1">
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </>
        ) : (
          lead.status === 'approved' && (
            <Button
              onClick={sendEmail}
              disabled={isSending}
              className="gap-1"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send Email
            </Button>
          )
        )}
      </CardFooter>
    </Card>
  )
}
