import { ResetPasswordForm } from '@/components/forms/reset-password-form'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Choose a new password' }

export default function ResetPassword() {
  return <ResetPasswordForm />
}
