'use client'

import type { changePasswordAction } from '@/actions/change-password-action'
import { changePasswordFormSchema } from '@/lib/validation'
import { FormHeader } from '@/forms/form-header'
import { SubmitField } from '@/forms/submit-field'
import { TextField } from '@/forms/text-field'
import { SuccessMessage } from '@/messages/success-message'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'

export type ChangePasswordFormSchema = z.infer<typeof changePasswordFormSchema>

export function ChangePasswordForm({
  onSubmitHandler
}: {
  onSubmitHandler: typeof changePasswordAction
}) {
  const [success, setSuccess] = useState<boolean>(false)

  const { formState, handleSubmit, register, reset, setError } =
    useForm<ChangePasswordFormSchema>({
      resolver: zodResolver(changePasswordFormSchema)
    })

  return (
    <>
      <FormHeader
        title="Set new account password"
        description="Change sign in access password"
      />

      {success && (
        <SuccessMessage>Password has been successfully changed</SuccessMessage>
      )}

      <form
        method="post"
        onSubmit={handleSubmit(async (data) => {
          const res = await onSubmitHandler(data)

          if (typeof res === 'string') {
            setSuccess(false)
            setError('password', { message: res })
          } else if (res !== true) {
            setSuccess(false)
          } else {
            reset()
            setSuccess(true)
          }
        })}
      >
        <TextField
          type="text"
          register={register('password')}
          label="Current password"
          formState={formState}
        />

        <TextField
          type="text"
          register={register('passwordNew')}
          label="New password"
          formState={formState}
        />

        <TextField
          type="text"
          register={register('passwordRetype')}
          label="Retype password"
          formState={formState}
        />

        <SubmitField isLoading={formState.isLoading}>
          Change password
        </SubmitField>
      </form>
    </>
  )
}
