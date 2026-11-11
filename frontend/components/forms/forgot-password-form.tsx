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
import { forgotPasswordSchema, resetRedirectUrl } from '@/lib/password-reset'
import { ErrorMessage } from '@/messages/error-message'
import { SuccessMessage } from '@/messages/success-message'
import { useAuth } from '@/providers/auth-provider'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Plane } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'

type Values = z.infer<typeof forgotPasswordSchema>

export function ForgotPasswordForm() {
  const { supabase } = useAuth()
  const search = useSearchParams()
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState } = useForm<Values>({
    resolver: zodResolver(forgotPasswordSchema)
  })

  const linkProblem = search.get('error') === 'expired'

  const onSubmit = handleSubmit(async ({ email }) => {
    setError(null)
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: resetRedirectUrl(window.location.origin)
    })
    // Same answer whether or not the address has an account, so the form cannot be used to probe for
    // accounts. Only a delivery/rate-limit problem is reported.
    if (err && err.status !== 400) {
      setError(
        err.status === 429
          ? 'Too many reset emails right now. Wait a few minutes and try again.'
          : "We couldn't send the email. Please try again."
      )
      return
    }
    setSent(true)
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
          <CardTitle className="text-2xl font-bold text-card-foreground">Reset password</CardTitle>
          <CardDescription className="text-muted-foreground">
            Enter your email and we'll send you a link to choose a new password.
          </CardDescription>
        </CardHeader>

        {linkProblem && !sent && (
          <div className="px-6">
            <ErrorMessage>That reset link has expired or was already used. Request a new one.</ErrorMessage>
          </div>
        )}
        {error && (
          <div className="px-6">
            <ErrorMessage>{error}</ErrorMessage>
          </div>
        )}

        {sent ? (
          <CardContent>
            <SuccessMessage>
              If an account exists for that email, a reset link is on its way. The link works once and
              expires in an hour.
            </SuccessMessage>
          </CardContent>
        ) : (
          <form onSubmit={onSubmit}>
            <CardContent className="space-y-2">
              <Label htmlFor="email" className="text-card-foreground">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                {...register('email')}
                className="bg-background border-border text-foreground"
              />
              {formState.errors.email && (
                <p className="text-sm text-destructive">{formState.errors.email.message}</p>
              )}
            </CardContent>
            <CardFooter className="pt-6">
              <Button type="submit" className="w-full" disabled={formState.isSubmitting}>
                {formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send reset link'}
              </Button>
            </CardFooter>
          </form>
        )}

        <p className="pb-6 text-sm text-center text-muted-foreground">
          <Link href="/login" className="text-primary hover:underline font-medium">
            Back to sign in
          </Link>
        </p>
      </Card>
    </div>
  )
}
