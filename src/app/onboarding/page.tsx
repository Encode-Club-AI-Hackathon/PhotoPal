'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Camera,
  Loader2,
  Check,
  ChevronRight,
  Globe,
  User,
  MapPin,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'

const step1Schema = z.object({
  portfolioUrl: z.string().url('Please enter a valid URL'),
})

const profileSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  bio: z.string().min(10, 'Bio must be at least 10 characters'),
  location: z.string().min(1, 'Location is required'),
  style: z.string().optional(),
  priceRange: z.string().optional(),
})

type Step1Data = z.infer<typeof step1Schema>
type ProfileData = z.infer<typeof profileSchema>

interface AnalysisResult {
  name: string
  bio: string
  location: string
  style: string
  specialties: string[]
  priceRange: string
  yearsExperience: number
}

const steps = [
  { id: 1, label: 'Portfolio URL', icon: Globe },
  { id: 2, label: 'AI Analysis', icon: Camera },
  { id: 3, label: 'Review Profile', icon: User },
  { id: 4, label: 'Set Location', icon: MapPin },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(
    null,
  )

  const step1Form = useForm<Step1Data>({
    resolver: zodResolver(step1Schema),
  })

  const profileForm = useForm<ProfileData>({
    resolver: zodResolver(profileSchema),
  })

  async function handlePortfolioSubmit(data: Step1Data) {
    setIsLoading(true)
    setError(null)
    setCurrentStep(2)

    try {
      const res = await fetch('/api/onboarding/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portfolioUrl: data.portfolioUrl }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Analysis failed')
      }

      const result = await res.json()
      setAnalysisResult(result)
      profileForm.reset({
        name: result.name ?? '',
        bio: result.bio ?? '',
        location: result.location ?? '',
        style: result.style ?? '',
        priceRange: result.priceRange ?? '',
      })
      setCurrentStep(3)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setCurrentStep(1)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleProfileSubmit(data: ProfileData) {
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          specialties: analysisResult?.specialties ?? [],
          yearsExperience: analysisResult?.yearsExperience ?? 0,
          portfolioUrl: step1Form.getValues('portfolioUrl'),
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Profile save failed')
      }

      router.push('/leads')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container max-w-2xl py-12">
      {/* Stepper */}
      <div className="mb-10">
        <div className="flex items-center justify-between">
          {steps.map((step, i) => {
            const Icon = step.icon
            const isDone = currentStep > step.id
            const isActive = currentStep === step.id
            return (
              <div key={step.id} className="flex flex-1 items-center">
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors ${
                      isDone
                        ? 'border-primary bg-primary text-primary-foreground'
                        : isActive
                          ? 'border-primary text-primary'
                          : 'border-muted-foreground/30 text-muted-foreground/30'
                    }`}
                  >
                    {isDone ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </div>
                  <span
                    className={`text-xs font-medium ${isActive ? 'text-primary' : 'text-muted-foreground'}`}
                  >
                    {step.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div
                    className={`mx-2 h-0.5 flex-1 transition-colors ${currentStep > step.id ? 'bg-primary' : 'bg-muted'}`}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Step 1 – Portfolio URL */}
      {currentStep === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Enter Your Portfolio URL</CardTitle>
            <CardDescription>
              Paste the link to your photography portfolio website. Our AI will
              analyse it and fill in your profile automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={step1Form.handleSubmit(handlePortfolioSubmit)}
              className="flex flex-col gap-4"
            >
              <div className="grid gap-2">
                <Label htmlFor="portfolioUrl">Portfolio URL</Label>
                <Input
                  id="portfolioUrl"
                  placeholder="https://yourportfolio.com"
                  {...step1Form.register('portfolioUrl')}
                />
                {step1Form.formState.errors.portfolioUrl && (
                  <p className="text-sm text-destructive">
                    {step1Form.formState.errors.portfolioUrl.message}
                  </p>
                )}
              </div>
              <Button type="submit" disabled={isLoading} className="gap-2">
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                Analyse My Portfolio
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Step 2 – Loading */}
      {currentStep === 2 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-6 py-16">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold">Analysing your portfolio…</h3>
              <p className="text-sm text-muted-foreground">
                Our AI is reading your portfolio and extracting your photography
                style, specialties, and experience. This takes about 15 seconds.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3 – Review Profile */}
      {currentStep === 3 && analysisResult && (
        <Card>
          <CardHeader>
            <CardTitle>Review Your Profile</CardTitle>
            <CardDescription>
              We pre-filled this from your portfolio. Edit anything that looks
              wrong.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {analysisResult.specialties.length > 0 && (
              <div className="mb-6 flex flex-wrap gap-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Detected specialties:
                </span>
                {analysisResult.specialties.map((s) => (
                  <Badge key={s} variant="secondary">
                    {s}
                  </Badge>
                ))}
              </div>
            )}
            <form
              onSubmit={profileForm.handleSubmit(handleProfileSubmit)}
              className="flex flex-col gap-4"
            >
              <div className="grid gap-2">
                <Label htmlFor="name">Your Name</Label>
                <Input id="name" {...profileForm.register('name')} />
                {profileForm.formState.errors.name && (
                  <p className="text-sm text-destructive">
                    {profileForm.formState.errors.name.message}
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  rows={4}
                  {...profileForm.register('bio')}
                />
                {profileForm.formState.errors.bio && (
                  <p className="text-sm text-destructive">
                    {profileForm.formState.errors.bio.message}
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="location">Location (City, Country)</Label>
                <Input id="location" {...profileForm.register('location')} />
                {profileForm.formState.errors.location && (
                  <p className="text-sm text-destructive">
                    {profileForm.formState.errors.location.message}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="style">Photography Style</Label>
                  <Input
                    id="style"
                    placeholder="e.g. Natural light, editorial"
                    {...profileForm.register('style')}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="priceRange">Price Range</Label>
                  <Input
                    id="priceRange"
                    placeholder="e.g. $500–$2000"
                    {...profileForm.register('priceRange')}
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCurrentStep(1)}
                >
                  Back
                </Button>
                <Button type="submit" disabled={isLoading} className="flex-1 gap-2">
                  {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save Profile &amp; Find Leads
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
