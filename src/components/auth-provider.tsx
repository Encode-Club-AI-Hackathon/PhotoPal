'use client'

import { CivicAuthProvider } from '@civic/auth/react'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const clientId = process.env.NEXT_PUBLIC_CIVIC_CLIENT_ID ?? ''

  if (!clientId) {
    // No client ID configured – render children without auth in dev/build
    return <>{children}</>
  }

  return (
    <CivicAuthProvider clientId={clientId}>{children}</CivicAuthProvider>
  )
}
