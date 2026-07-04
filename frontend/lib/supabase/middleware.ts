import { getSupabaseAnonKey, getSupabaseUrl } from '@/lib/supabase/env'
import type { Database } from '@/types/database'
import { createServerClient } from '@supabase/ssr'
import type { NextRequest, NextResponse } from 'next/server'

export async function updateSession(
  request: NextRequest,
  response: NextResponse
) {
  const supabase = createServerClient<Database>(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
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

  const {
    data: { user }
  } = await supabase.auth.getUser()

  return { response, user }
}
