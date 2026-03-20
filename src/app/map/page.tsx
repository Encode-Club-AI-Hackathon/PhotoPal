import { BusinessMap } from '@/components/business-map'

export default function MapPage() {
  return (
    <div className="container py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Business Map</h1>
        <p className="text-muted-foreground">
          Businesses near you ranked by fit score. Click a marker to view the
          lead.
        </p>
      </div>
      <BusinessMap />
    </div>
  )
}
