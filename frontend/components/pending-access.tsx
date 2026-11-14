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
import type { PendingReason } from '@/lib/access'
import { useAuth } from '@/providers/auth-provider'
import { Clock, Plane } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

const COPY: Record<PendingReason, { title: string; body: string }> = {
  'no-role': {
    title: 'Waiting for access',
    body: 'Your account is created. An administrator needs to give you a role before you can use the app. Ask your manager to approve it, then check again.'
  },
  'no-access': {
    title: 'No modules available yet',
    body: 'Your account is set up, but your role does not include any part of the app yet. Ask an administrator if you expected access.'
  },
  disabled: {
    title: 'Account disabled',
    body: 'This account has been disabled. Contact an administrator if you think this is a mistake.'
  },
  error: {
    title: "We couldn't check your access",
    body: 'Something went wrong while checking your account. Try again in a moment, or contact an administrator if it keeps happening.'
  }
}

function isReason(value: string | null): value is PendingReason {
  return value !== null && value in COPY
}

export function PendingAccess() {
  const search = useSearchParams()
  const router = useRouter()
  const { supabase, session } = useAuth()
  const [checking, setChecking] = useState(false)

  const raw = search.get('reason')
  const reason: PendingReason = isReason(raw) ? raw : 'no-role'
  const copy = COPY[reason]

  const checkAgain = () => {
    setChecking(true)
    // The middleware re-reads the account: an approved user lands on their first page, anyone
    // else comes straight back here.
    router.replace('/')
    router.refresh()
    setTimeout(() => setChecking(false), 1500)
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-card border-border">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-primary rounded-full">
              {reason === 'no-role' ? (
                <Clock className="w-8 h-8 text-primary-foreground" />
              ) : (
                <Plane className="w-8 h-8 text-primary-foreground" />
              )}
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-card-foreground">
            {copy.title}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {copy.body}
          </CardDescription>
        </CardHeader>
        {session?.user?.email && (
          <CardContent className="text-center text-sm text-muted-foreground">
            Signed in as{' '}
            <span className="font-medium text-foreground">
              {session.user.email}
            </span>
          </CardContent>
        )}
        {reason === 'no-role' && (
          <CardContent>
            <details className="rounded-md border border-border p-3 text-sm text-muted-foreground" data-testid="pending-explainer">
              <summary className="cursor-pointer font-medium text-foreground">What does this mean?</summary>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>Signing in with Google created your account, but it has no role yet.</li>
                <li>An administrator picks your role (Administrator, Front Desk, Line Department or Customer) on the Users page.</li>
                <li>Once they have, press Check again and you will land in the app.</li>
              </ol>
            </details>
          </CardContent>
        )}
        <CardFooter className="flex flex-col gap-2 pt-4">
          {reason !== 'disabled' && (
            <Button className="w-full" onClick={checkAgain} disabled={checking}>
              {checking ? 'Checking…' : 'Check again'}
            </Button>
          )}
          <Button variant="outline" className="w-full" onClick={signOut}>
            Sign out
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
