'use client'

import { useState } from 'react'
import type {
  RegisterFormSchema,
  registerAction
} from '@/actions/register-action'
import { fieldApiError } from '@/lib/forms'
import { registerFormSchema } from '@/lib/validation'
import { Button } from '@frontend/ui/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@frontend/ui/components/ui/card'
import { Input } from '@frontend/ui/components/ui/input'
import { Label } from '@frontend/ui/components/ui/label'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plane } from 'lucide-react'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'

export function RegisterForm({
  onSubmitHandler
}: { onSubmitHandler: typeof registerAction }) {
  const [formError, setFormError] = useState<string | null>(null)

  const { formState, handleSubmit, register, setError } =
    useForm<RegisterFormSchema>({
      resolver: zodResolver(registerFormSchema)
    })

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-card border-border">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-primary rounded-full">
              <Plane className="w-8 h-8 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-card-foreground">
            Create Account
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Join our flight operations platform
          </CardDescription>
        </CardHeader>

        <form
          onSubmit={handleSubmit(async (data) => {
            setFormError(null) // reset previous banner error

            const res = await onSubmitHandler(data)

            if (res === true) {
              signIn()
              return
            }

            if (typeof res !== 'boolean') {
              const nfe = (res as any)?.non_field_errors
              if (Array.isArray(nfe) && nfe.length > 0) {
                setFormError(nfe.join(' '))
              } else {
                setFormError('Registration failed. Please check your details.')
              }

              // existing field-level mapping
              fieldApiError('username', 'username', res, setError)
              fieldApiError('email', 'email', res, setError)
              fieldApiError('password', 'password', res, setError)
              fieldApiError('password_retype', 'passwordRetype', res, setError)
              return
            }

            // boolean false fallback
            setFormError('Registration failed. Please try again.')
          })}
        >
          <CardContent className="space-y-4">
            {/* Global error banner */}
            {formError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
                <p className="text-sm text-destructive">{formError}</p>
              </div>
            )}

            {/* Username */}
            <div className="space-y-2">
              <Label htmlFor="username" className="text-card-foreground">
                Username
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="Unique username"
                autoComplete="username"
                {...register('username')}
                className="bg-background border-border text-foreground"
              />
              {formState.errors.username && (
                <p className="text-sm text-destructive">
                  {formState.errors.username.message}
                </p>
              )}
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-card-foreground">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                {...register('email')}
                className="bg-background border-border text-foreground"
              />
              {formState.errors.email && (
                <p className="text-sm text-destructive">
                  {formState.errors.email.message}
                </p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-card-foreground">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Your new password"
                autoComplete="new-password"
                {...register('password')}
                className="bg-background border-border text-foreground"
              />
              {formState.errors.password && (
                <p className="text-sm text-destructive">
                  {formState.errors.password.message}
                </p>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="passwordRetype" className="text-card-foreground">
                Confirm Password
              </Label>
              <Input
                id="passwordRetype"
                type="password"
                placeholder="Verify password"
                autoComplete="new-password"
                {...register('passwordRetype')}
                className="bg-background border-border text-foreground"
              />
              {formState.errors.passwordRetype && (
                <p className="text-sm text-destructive">
                  {formState.errors.passwordRetype.message}
                </p>
              )}
            </div>
          </CardContent>

          <CardFooter className="flex flex-col space-y-4 pt-6">
            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              Create Account
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              Already have an account?{' '}
              <Link
                href="/login"
                className="text-primary hover:underline font-medium"
              >
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}

