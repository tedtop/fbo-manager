import { createServerClient } from '@supabase/ssr'
import type { NextRequest, NextResponse } from 'next/server'
import { type AccessState, parseAccessState } from '@/lib/access'
import type { Database } from '@/types/database'

export async function updateSession(
  request: NextRequest,
  response: NextResponse
) {
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        }
      }
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  /** Role / status snapshot for the signed-in user; null (fail closed) when the RPC errors. */
  const getAccess = async (): Promise<AccessState | null> => {
    const { data, error } = await supabase.rpc('get_my_access')
    if (error) return null
    return parseAccessState(data)
  }

  return { response, user, getAccess }
}
