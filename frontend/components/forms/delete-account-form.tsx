'use client'

import type {
  DeleteAccountFormSchema,
  deleteAccountAction
} from '@/actions/delete-account-action'
import { deleteAccountFormSchema } from '@/lib/validation'
import { useAuth } from '@/providers/auth-provider'
import { FormHeader } from '@/forms/form-header'
import { SubmitField } from '@/forms/submit-field'
import { TextField } from '@/forms/text-field'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'

export function DeleteAccountForm({
  onSubmitHandler
}: { onSubmitHandler: typeof deleteAccountAction }) {
  const { session, supabase } = useAuth()
  const router = useRouter()

  const { formState, handleSubmit, register, reset, setValue } =
    useForm<DeleteAccountFormSchema>({
      resolver: zodResolver(deleteAccountFormSchema)
    })

  useEffect(() => {
    if (session?.user?.email) {
      setValue('usernameCurrent', session.user.email)
    }
  }, [setValue, session?.user?.email])

  return (
    <>
      <FormHeader
        title="Delete your account"
        description="After this action all data will be lost"
      />

      <form
        method="post"
        onSubmit={handleSubmit(async (data) => {
          const res = await onSubmitHandler(data)

          if (res) {
            reset()
            await supabase.auth.signOut()
            router.push('/login')
          }
        })}
      >
        <TextField
          type="text"
          register={register('username')}
          label="Email"
          formState={formState}
        />

        <SubmitField>Delete account</SubmitField>
      </form>
    </>
  )
}
