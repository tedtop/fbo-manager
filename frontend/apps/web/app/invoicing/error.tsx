'use client'

import { useEffect } from 'react'
import { Button } from '@frontend/ui/components/ui/button'

export default function InvoicingError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Invoicing page error:', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center h-96 gap-4">
      <h2 className="text-xl font-semibold text-destructive">Invoicing failed to load</h2>
      <p className="text-sm text-muted-foreground max-w-md text-center">{error.message}</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}
