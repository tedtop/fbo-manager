'use client'

import { useAuth } from '@/providers/auth-provider'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export function SignInLink() {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => router.push('/login')}
      className="cursor-pointer text-purple-600 underline"
    >
      Login
    </button>
  )
}

export function SignOutLink() {
  const { supabase } = useAuth()
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={async () => {
        await supabase.auth.signOut()
        router.push('/login')
      }}
      className="cursor-pointer text-purple-600 underline"
    >
      Logout
    </button>
  )
}

export function PagesOverview() {
  return (
    <ul className="flex flex-col gap-6">
      <li className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <span className="w-40 font-medium">Authenticated pages</span>
        <ul className="flex flex-row gap-6">
          <li><Link href="/profile" className="text-purple-600 underline">Profile</Link></li>
          <li><Link href="/change-password" className="text-purple-600 underline">Change password</Link></li>
          <li><Link href="/delete-account" className="text-purple-600 underline">Delete account</Link></li>
        </ul>
      </li>
      <li className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <span className="w-40 font-medium">Anonymous pages</span>
        <ul className="flex flex-row gap-6">
          <li><SignInLink /></li>
          <li><a href="/register" className="text-purple-600 underline">Register</a></li>
          <li><SignOutLink /></li>
        </ul>
      </li>
    </ul>
  )
}
