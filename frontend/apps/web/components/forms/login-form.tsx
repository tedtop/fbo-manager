'use client'

import { loginFormSchema } from '@/lib/validation'
import { useAuth } from '@/providers/auth-provider'
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
import { ErrorMessage } from '@frontend/ui/messages/error-message'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Plane } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'

type LoginFormSchema = z.infer<typeof loginFormSchema>

export function LoginForm() {
  const search = useSearchParams()
  const router = useRouter()
  const { supabase } = useAuth()
  const [authError, setAuthError] = useState<string | null>(null)
  const [devLoading, setDevLoading] = useState<'admin' | 'user' | null>(null)

  const { register, handleSubmit, formState } = useForm<LoginFormSchema>({
    resolver: zodResolver(loginFormSchema)
  })

  const signIn = async (email: string, password: string) => {
    setAuthError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setAuthError(error.message)
      return false
    }
    router.push('/')
    router.refresh()
    return true
  }

  const onSubmitHandler = handleSubmit((data) => {
    signIn(data.email, data.password)
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
            Welcome Back
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Sign in to access your flight operations dashboard
          </CardDescription>
        </CardHeader>

        {(authError || search.has('error')) && (
          <div className="px-6">
            <ErrorMessage>
              {authError || "That account doesn't exist."}{' '}
              <Link href="/register" className="underline font-medium">
                Sign up
              </Link>
            </ErrorMessage>
          </div>
        )}

        <form onSubmit={onSubmitHandler}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-card-foreground">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
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
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-card-foreground">
                  Password
                </Label>
                <Link
                  href="/forgot-password"
                  className="text-sm text-primary hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                {...register('password')}
                className="bg-background border-border text-foreground"
              />
              {formState.errors.password && (
                <p className="text-sm text-destructive">
                  {formState.errors.password.message}
                </p>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4 pt-6">
            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              Sign In
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">
                  Quick Dev Login
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={devLoading !== null}
                onClick={async () => {
                  setDevLoading('admin')
                  const ok = await signIn('admin@fbo.local', 'devadmin')
                  if (!ok) setDevLoading(null)
                }}
              >
                {devLoading === 'admin' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Log in as Admin'
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={devLoading !== null}
                onClick={async () => {
                  setDevLoading('user')
                  const ok = await signIn('user@fbo.local', 'devuser')
                  if (!ok) setDevLoading(null)
                }}
              >
                {devLoading === 'user' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Log in as User'
                )}
              </Button>
            </div>

            <p className="text-sm text-center text-muted-foreground">
              Don't have an account?{' '}
              <Link
                href="/register"
                className="text-primary hover:underline font-medium"
              >
                Sign up
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
