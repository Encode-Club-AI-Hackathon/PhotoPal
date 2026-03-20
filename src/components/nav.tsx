'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Camera, Map, Users, User, LogIn } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const links = [
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/map', label: 'Map', icon: Map },
  { href: '/profile', label: 'Profile', icon: User },
]

function CivicUserButton() {
  try {
    // Dynamically load UserButton only when Civic Auth is available
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { UserButton } = require('@civic/auth/react')
    return <UserButton />
  } catch {
    return null
  }
}

export function Nav() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <Camera className="h-5 w-5 text-primary" />
          <span>PhotoPal</span>
        </Link>

        <nav className="flex items-center gap-1">
          {links.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'gap-2',
                  pathname === href && 'bg-accent text-accent-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Button>
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <CivicUserButton />
          <Link href="/onboarding">
            <Button size="sm" className="gap-2">
              <LogIn className="h-4 w-4" />
              Get Started
            </Button>
          </Link>
        </div>
      </div>
    </header>
  )
}
