import type { Metadata } from 'next'
import './globals.css'
import { Nav } from '@/components/nav'
import { AuthProvider } from '@/components/auth-provider'

export const metadata: Metadata = {
  title: 'PhotoPal – Photo Lead Finder',
  description:
    'Find local businesses that need a photographer. Generate tailored cold outreach emails powered by AI.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <AuthProvider>
          <Nav />
          <main className="min-h-screen">{children}</main>
        </AuthProvider>
      </body>
    </html>
  )
}
