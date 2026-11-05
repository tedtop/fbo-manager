import { safeNextPath } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * OAuth landing point (Google sign-in). Supabase redirects here with a one-time `code`; we trade it
 * for a session cookie and send the user on. Where they end up (the board, or /pending for a brand
 * new account without a role) is decided by the middleware on the next request.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNextPath(searchParams.get('next'))

  // Prefer the configured public URL; otherwise trust the proxy's forwarded host (Railway) outside dev.
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.NODE_ENV === 'development' || !forwardedHost
      ? origin
      : `https://${forwardedHost}`)

  // Fixed wording only: the provider's own error text must never be shown as page content.
  const fail = () => {
    const url = new URL('/login', base)
    url.searchParams.set('error', 'oauth')
    return NextResponse.redirect(url)
  }

  if (searchParams.get('error') || searchParams.get('error_description') || !code) return fail()

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return fail()

  const target = new URL(next, base)
  if (target.origin !== new URL(base).origin) return NextResponse.redirect(new URL('/', base))
  return NextResponse.redirect(target)
}
