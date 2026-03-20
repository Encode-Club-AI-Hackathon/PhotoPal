import Link from 'next/link'
import { Camera, MapPin, Mail, Star, ArrowRight, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const features = [
  {
    icon: Camera,
    title: 'Portfolio Analysis',
    description:
      'Paste your portfolio URL and our AI extracts your photography style, specialties, and unique selling points automatically.',
  },
  {
    icon: MapPin,
    title: 'Business Discovery',
    description:
      'Google Maps integration finds local businesses that need professional photography – restaurants, hotels, retail, and more.',
  },
  {
    icon: Star,
    title: 'Fit Scoring',
    description:
      'Every lead is scored 0-100 based on how well the business matches your photography style and experience.',
  },
  {
    icon: Mail,
    title: 'AI Cold Emails',
    description:
      "Personalised outreach emails written by GPT-4o that reference both your portfolio and the business's social media presence.",
  },
]

export default function HomePage() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-50 via-white to-indigo-50 py-24">
        <div className="container flex flex-col items-center gap-8 text-center">
          <div className="flex items-center gap-2 rounded-full bg-blue-100 px-4 py-1.5 text-sm font-medium text-blue-700">
            <Zap className="h-4 w-4" />
            AI-powered lead generation for photographers
          </div>
          <h1 className="max-w-3xl text-5xl font-extrabold tracking-tight sm:text-6xl">
            Turn Local Businesses into{' '}
            <span className="text-primary">Photography Clients</span>
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            PhotoPal analyzes your portfolio, discovers nearby businesses that
            need a photographer, and generates personalised cold outreach emails
            – all in minutes.
          </p>
          <div className="flex gap-4">
            <Link href="/onboarding">
              <Button size="lg" className="gap-2 text-base">
                Get Started Free
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <Link href="/map">
              <Button variant="outline" size="lg" className="text-base">
                View Map
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container py-24">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold">How it works</h2>
          <p className="mt-2 text-muted-foreground">
            Four simple steps from portfolio to signed client
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, description }) => (
            <Card key={title} className="transition-shadow hover:shadow-md">
              <CardContent className="flex flex-col gap-4 p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold">{title}</h3>
                <p className="text-sm text-muted-foreground">{description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary py-16 text-primary-foreground">
        <div className="container flex flex-col items-center gap-6 text-center">
          <h2 className="text-3xl font-bold">Ready to find your next client?</h2>
          <p className="max-w-md opacity-90">
            Create your free account, paste your portfolio URL, and let PhotoPal
            do the prospecting for you.
          </p>
          <Link href="/onboarding">
            <Button
              size="lg"
              variant="secondary"
              className="gap-2 text-base font-semibold"
            >
              Start for Free
              <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  )
}
