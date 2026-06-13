import { profileAction } from '@/actions/profile-action'
import { ProfileForm } from '@/components/forms/profile-form'
import { createClient } from '@/lib/supabase/server'
import { findUserByEmail } from '@/repositories/users.repo'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Profile - Turbo'
}

export default async function Profile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const currentUserPromise = user?.email
    ? findUserByEmail(supabase as any, user.email).then((u) => ({
        first_name: u?.first_name ?? user.user_metadata?.first_name ?? '',
        last_name: u?.last_name ?? user.user_metadata?.last_name ?? '',
        email: u?.email ?? user.email ?? '',
        username: u?.username ?? user.user_metadata?.username ?? ''
      }))
    : Promise.resolve({ first_name: '', last_name: '', email: '', username: '' })

  return (
    <ProfileForm
      currentUser={currentUserPromise as any}
      onSubmitHandler={profileAction}
    />
  )
}
