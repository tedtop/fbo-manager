'use client'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { resetPasswordSchema } from '@/lib/password-reset'
import { ErrorMessage } from '@/messages/error-message'
import { useAuth } from '@/providers/auth-provider'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Plane } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'

type Values = z.infer<typeof resetPasswordSchema>

/** Shown after the emailed link signed the person in with a one-time recovery session. */
export function ResetPasswordForm() {
  const { supabase } = useAuth()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState } = useForm<Values>({
    resolver: zodResolver(resetPasswordSchema)
  })

  const onSubmit = handleSubmit(async ({ password }) => {
    setError(null)
    const { error: err } = await supabase.auth.updateUser({ password })
    if (err) {
      setError(err.message)
      return
    }
    router.push('/')
    router.refresh()
  })

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-card border-border">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-primary rounded-full">
              <Plane className="w-8 h-8 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-card-foreground">Choose a new password</CardTitle>
          <CardDescription className="text-muted-foreground">
            Use at least 8 characters. You'll be signed in when it's saved.
          </CardDescription>
        </CardHeader>
        {error && (
          <div className="px-6">
            <ErrorMessage>{error}</ErrorMessage>
          </div>
        )}
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-card-foreground">
                New password
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                {...register('password')}
                className="bg-background border-border text-foreground"
              />
              {formState.errors.password && (
                <p className="text-sm text-destructive">{formState.errors.password.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="passwordRetype" className="text-card-foreground">
                Retype password
              </Label>
              <Input
                id="passwordRetype"
                type="password"
                autoComplete="new-password"
                {...register('passwordRetype')}
                className="bg-background border-border text-foreground"
              />
              {formState.errors.passwordRetype && (
                <p className="text-sm text-destructive">{formState.errors.passwordRetype.message}</p>
              )}
            </div>
          </CardContent>
          <CardFooter className="pt-6">
            <Button type="submit" className="w-full" disabled={formState.isSubmitting}>
              {formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save password'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
