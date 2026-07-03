import { createAdminClient } from '@/lib/supabase/admin'
import { requireUsersAdmin } from '@/lib/supabase/require-users-admin'
import { setUserRoles } from '@/repositories/user-roles.repo'
import { type NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const authResult = await requireUsersAdmin()
  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    )
  }

  const body = await request.json()
  const { email, firstName, lastName, phoneNumber, employeeId, roleIds } =
    body as {
      email?: string
      firstName?: string
      lastName?: string
      phoneNumber?: string
      employeeId?: string
      roleIds?: number[]
    }

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: invited, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(email, {
      data: { first_name: firstName ?? '', last_name: lastName ?? '' },
      redirectTo: process.env.NEXT_PUBLIC_SITE_URL
        ? `${process.env.NEXT_PUBLIC_SITE_URL}/login`
        : undefined
    })

  if (inviteError || !invited.user) {
    return NextResponse.json(
      { error: inviteError?.message ?? 'Failed to invite user' },
      { status: 400 }
    )
  }

  const newUserId = invited.user.id

  // The auth trigger already created a bare profiles row; fill in the
  // details the admin provided on the invite form.
  const { error: profileError } = await admin
    .from('profiles')
    .update({
      first_name: firstName ?? '',
      last_name: lastName ?? '',
      phone_number: phoneNumber ?? '',
      employee_id: employeeId ?? null,
      created_by: authResult.caller.user.id,
      updated_by: authResult.caller.user.id
    })
    .eq('id', newUserId)

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  if (roleIds && roleIds.length > 0) {
    await setUserRoles(admin, newUserId, roleIds, authResult.caller.user.id)
  }

  return NextResponse.json({ id: newUserId, email }, { status: 201 })
}
