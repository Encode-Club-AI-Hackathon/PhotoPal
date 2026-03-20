import { db } from '@/db'
import { photographerProfiles } from '@/db/schema'
import { ProfileForm } from '@/components/profile-form'

export const dynamic = 'force-dynamic'

async function getProfile() {
  try {
    const rows = await db.select().from(photographerProfiles).limit(1)
    return rows[0] ?? null
  } catch {
    return null
  }
}

export default async function ProfilePage() {
  const profile = await getProfile()

  return (
    <div className="container max-w-2xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Your Profile</h1>
        <p className="text-muted-foreground">
          Keep your profile up to date so the AI can generate the best outreach
          emails.
        </p>
      </div>
      <ProfileForm initialData={profile} />
    </div>
  )
}
