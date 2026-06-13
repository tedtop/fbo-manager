import { changePasswordAction } from '@/actions/change-password-action'
import { ChangePasswordForm } from '@/components/forms/change-password-form'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Change password - Turbo'
}

export default function ChangePassword() {
  return <ChangePasswordForm onSubmitHandler={changePasswordAction} />
}
