'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Button } from '@frontend/ui/components/ui/button'
import { Card } from '@frontend/ui/components/ui/card'
import { Badge } from '@frontend/ui/components/ui/badge'
import { ErrorMessage } from '@frontend/ui/messages/error-message'
import { DispatchCard } from '@/components/fuel-dispatch/dispatch-card'
import { useQTDispatch } from '@/hooks/use-qt-dispatch'
import { Fuel, RefreshCw } from 'lucide-react'

export default function FuelDispatchMonitorPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const {
    dispatches,
    loading,
    error,
    lastUpdated,
    refreshCountdown,
    refetch,
  } = useQTDispatch()
  const [hideDeparted, setHideDeparted] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    }
  }, [status, router])

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return null
  }

  const filteredDispatches = hideDeparted
    ? dispatches.filter((d) => d.FlightStatus !== 'In Flight')
    : dispatches

  const statusColor = loading
    ? 'bg-warning/10 text-warning border-warning/20'
    : error
      ? 'bg-destructive/10 text-destructive border-destructive/20'
      : 'bg-success/10 text-success border-success/20'

  const statusText = loading
    ? 'Connecting...'
    : error
      ? 'Disconnected'
      : `Next refresh in ${refreshCountdown}s`

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Fuel className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold text-foreground">
              Fuel Dispatch Monitor
            </h1>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Real-time QT Technologies dispatch tracking
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Badge className={statusColor}>
            {statusText}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={refetch}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh Now
          </Button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <ErrorMessage
          message={error}
          onDismiss={() => {
            // Error will be cleared on next successful fetch
          }}
        />
      )}

      {/* Filter Controls */}
      <Card className="p-4 bg-card border-border">
        <div className="flex items-center justify-center gap-4">
          <label
            htmlFor="hideDepartedToggle"
            className="text-sm font-medium text-foreground cursor-pointer select-none"
          >
            Hide departed flights
          </label>
          <div className="relative inline-block w-14 h-8">
            <input
              type="checkbox"
              id="hideDepartedToggle"
              checked={hideDeparted}
              onChange={(e) => setHideDeparted(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-14 h-8 bg-muted rounded-full peer peer-checked:bg-primary transition-colors cursor-pointer" />
            <div className="absolute left-1 top-1 w-6 h-6 bg-white rounded-full transition-transform peer-checked:translate-x-6" />
          </div>
        </div>
      </Card>

      {/* Loading State */}
      {loading && dispatches.length === 0 && (
        <Card className="p-8 text-center bg-card border-border">
          <div className="text-muted-foreground">Loading dispatch data...</div>
        </Card>
      )}

      {/* Dispatch Grid */}
      {filteredDispatches.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredDispatches.map((dispatch) => (
            <DispatchCard
              key={`${dispatch.FlightNumber}_${dispatch.TailNumber}`}
              dispatch={dispatch}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredDispatches.length === 0 && dispatches.length > 0 && (
        <Card className="p-8 text-center bg-card border-border">
          <div className="text-muted-foreground">
            No upcoming flights (all flights have departed)
          </div>
        </Card>
      )}

      {!loading && dispatches.length === 0 && !error && (
        <Card className="p-8 text-center bg-card border-border">
          <div className="text-muted-foreground">No dispatches available</div>
        </Card>
      )}

      {/* Last Updated */}
      {lastUpdated && (
        <div className="text-center text-sm text-muted-foreground">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </div>
      )}
    </div>
  )
}
