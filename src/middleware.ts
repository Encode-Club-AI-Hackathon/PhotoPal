import { authMiddleware } from '@civic/auth/nextjs/middleware'

export default authMiddleware()

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/auth).*)',
  ],
}
