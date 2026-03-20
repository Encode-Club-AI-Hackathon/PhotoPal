/**
 * Civic Auth server-side helpers.
 * On the server, use the `@civic/auth/nextjs` package to retrieve the current user.
 */

import type { User } from '@civic/auth'

export type { User }

/**
 * Get the current authenticated user from the Civic session cookie.
 * Returns null when no user is logged in or when running outside of a request context.
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const { getUser } = await import('@civic/auth/nextjs')
    return getUser()
  } catch {
    return null
  }
}
