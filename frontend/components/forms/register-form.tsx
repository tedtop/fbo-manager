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
import { registerFormSchema } from '@/lib/validation'
import { useAuth } from '@/providers/auth-provider'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plane } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'

type RegisterFormSchema = z.infer<typeof registerFormSchema>

export function RegisterForm() {
  const [formError, setFormError] = useState<string | null>(null)
  const { supabase } = useAuth()
  const router = useRouter()

  const { formState, handleSubmit, register } = useForm<RegisterFormSchema>({
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
            setFormError(null)

            const { error } = await supabase.auth.signUp({
              email: data.email,
              password: data.password,
              options: {
                data: { username: data.username }
              }
            })

            if (error) {
              setFormError(error.message)
              return
            }

            router.push('/')
            router.refresh()
          })}
        >
          <CardContent className="space-y-4">
            {formError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
                <p className="text-sm text-destructive">{formError}</p>
              </div>
            )}

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
