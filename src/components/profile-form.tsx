'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

const profileSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  bio: z.string().optional(),
  location: z.string().optional(),
  style: z.string().optional(),
  priceRange: z.string().optional(),
  portfolioUrl: z.string().url('Must be a valid URL').or(z.literal('')),
})

type ProfileFormData = z.infer<typeof profileSchema>

interface Profile {
  name: string | null
  bio: string | null
  location: string | null
  style: string | null
  priceRange: string | null
  portfolioUrl: string | null
  specialties?: string[] | null
  yearsExperience?: number | null
}

export function ProfileForm({ initialData }: { initialData: Profile | null }) {
  const [isSaving, setIsSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: initialData?.name ?? '',
      bio: initialData?.bio ?? '',
      location: initialData?.location ?? '',
      style: initialData?.style ?? '',
      priceRange: initialData?.priceRange ?? '',
      portfolioUrl: initialData?.portfolioUrl ?? '',
    },
  })

  async function onSubmit(data: ProfileFormData) {
    setIsSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, civicUserId: 'demo' }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Save failed')
      }
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsSaving(false)
    }
  }

  const initials = (form.watch('name') ?? '')
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
      {success && (
        <Alert>
          <AlertDescription>Profile saved successfully!</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Personal Info</CardTitle>
          <CardDescription>Your public photographer profile</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 text-lg">
              <AvatarFallback>{initials || 'PP'}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="grid gap-2">
                <Label htmlFor="name">Full Name</Label>
                <Input id="name" {...form.register('name')} />
                {form.formState.errors.name && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.name.message}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea id="bio" rows={4} {...form.register('bio')} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                placeholder="San Francisco, CA"
                {...form.register('location')}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="priceRange">Price Range</Label>
              <Input
                id="priceRange"
                placeholder="$500–$2,000"
                {...form.register('priceRange')}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Photography Details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="style">Photography Style</Label>
            <Input
              id="style"
              placeholder="Natural light, editorial, moody…"
              {...form.register('style')}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="portfolioUrl">Portfolio URL</Label>
            <Input
              id="portfolioUrl"
              placeholder="https://yourportfolio.com"
              {...form.register('portfolioUrl')}
            />
            {form.formState.errors.portfolioUrl && (
              <p className="text-sm text-destructive">
                {form.formState.errors.portfolioUrl.message}
              </p>
            )}
          </div>
          {initialData?.yearsExperience != null && (
            <p className="text-sm text-muted-foreground">
              {initialData.yearsExperience} years of experience detected from
              your portfolio
            </p>
          )}
        </CardContent>
      </Card>

      <Button type="submit" disabled={isSaving} className="gap-2">
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        Save Profile
      </Button>
    </form>
  )
}
