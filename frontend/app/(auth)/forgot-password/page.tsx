import { ForgotPasswordForm } from '@/components/forms/forgot-password-form'
import type { Metadata } from 'next'
import { Suspense } from 'react'

export const metadata: Metadata = { title: 'Reset password' }

export default function ForgotPassword() {
  return (
    <Suspense>
      <ForgotPasswordForm />
    </Suspense>
  )
}
