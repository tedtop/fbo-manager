import { Button } from '@/components/ui/button'

interface FlightLoadErrorProps {
  message: string
  retrying?: boolean
  // True when flights from an earlier fetch are still on screen below.
  hasData?: boolean
  onRetry: () => void
}

export function FlightLoadError({
  message,
  retrying,
  hasData,
  onRetry
}: FlightLoadErrorProps) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      <div className="min-w-0">
        <p className="font-medium">
          {hasData ? "Couldn't refresh flights" : "Couldn't load flights"}
        </p>
        <p className="break-words">
          {message}
          {hasData && ' Showing the last loaded flights.'}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onRetry}
        disabled={retrying}
      >
        {retrying ? 'Retrying...' : 'Retry'}
      </Button>
    </div>
  )
}
