import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { evaluateGate, isRouteOrChild } from '@/lib/access'
import { updateSession } from '@/lib/supabase/middleware'

const PUBLIC_ROUTES = ['/login', '/register', '/forgot-password', '/auth/callback']

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request })
  const {
    response: updatedResponse,
    user,
    getAccess
  } = await updateSession(request, response)

  const { pathname } = request.nextUrl
  const isPublicRoute = PUBLIC_ROUTES.some((r) => isRouteOrChild(pathname, r))

  if (!user && !isPublicRoute && !pathname.startsWith('/api/')) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  if (user && pathname === '/login') {
    const homeUrl = request.nextUrl.clone()
    homeUrl.pathname = '/'
    return NextResponse.redirect(homeUrl)
  }

  // Signed in but not necessarily approved: new Google / email sign-ups have no role until an
  // admin gives them one, and disabled accounts stay locked out. API routes check for themselves.
  if (user && !isPublicRoute && !pathname.startsWith('/api/')) {
    const gate = evaluateGate(pathname, await getAccess())
    if (gate.kind === 'redirect') {
      const target = new URL(gate.to, request.url)
      const redirect = NextResponse.redirect(target)
      // Keep any refreshed session cookies on the redirect.
      for (const cookie of updatedResponse.cookies.getAll()) {
        redirect.cookies.set(cookie)
      }
      return redirect
    }
  }

  return updatedResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|maplibre/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'
  ]
}
