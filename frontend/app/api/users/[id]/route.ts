import { createAdminClient } from '@/lib/supabase/admin'
import { setStaffRealEmail } from '@/lib/staff-email-link'
import { requireUsersAdmin } from '@/lib/supabase/require-users-admin'
import { type NextRequest, NextResponse } from 'next/server'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireUsersAdmin()
  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    )
  }

  const { id } = await params

  if (id === authResult.caller.user.id) {
    return NextResponse.json(
      { error: 'You cannot delete your own account' },
      { status: 400 }
    )
  }

  const admin = createAdminClient()

  // Deleting the auth user cascades to profiles/user_roles via FK ON DELETE CASCADE.
  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}

/**
 * B78: set the real email on a staff account (body: { email, linkFromUserId? }).
 * linkFromUserId is an Awaiting-access Google sign-up holding that email; it is deleted first.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireUsersAdmin()
  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    )
  }

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as {
    email?: string
    linkFromUserId?: string | null
  }

  const result = await setStaffRealEmail(createAdminClient(), {
    targetId: id,
    email: body.email ?? '',
    linkFromUserId: body.linkFromUserId,
    callerId: authResult.caller.user.id
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result)
}
