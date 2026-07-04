'use client'

import { Button } from '@/components/ui/button'
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('App error:', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center h-96 gap-4">
      <h2 className="text-xl font-semibold text-destructive">
        Something went wrong
      </h2>
      <p className="text-sm text-muted-foreground max-w-md text-center">
        {error.message}
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}
