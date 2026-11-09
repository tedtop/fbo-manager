'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { QTDispatch } from '@/types/qt-dispatch'
import { format } from 'date-fns'
import { WingLoadingPanel } from './wing-loading-panel'

interface DispatchCardProps {
  dispatch: QTDispatch
}

export function DispatchCard({ dispatch }: DispatchCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'In Flight':
        return 'bg-destructive/10 text-destructive border-destructive/20'
      case 'In':
        return 'bg-success/10 text-success border-success/20'
      case 'Planned':
        return 'bg-accent/10 text-accent-foreground border-accent/20'
      default:
        return 'bg-muted text-muted-foreground border-border'
    }
  }

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return 'N/A'
    // QT sends "YYYY-MM-DD HH:mm" in airport-local time; the "T" form parses the same everywhere
    // (Safari rejects the space) and stays local, with no zone shift.
    const date = new Date(dateString.replace(' ', 'T'))
    if (Number.isNaN(date.getTime())) return 'N/A'
    return format(date, 'MMM d, h:mm a')
  }

  // QT's placeholders for "not assigned", same sets as Minuteman.
  const gateUnknown = new Set(['', '?'])
  const terminalUnknown = new Set(['', '-', '?', '0'])
  const gateLabel =
    dispatch.Gate && !gateUnknown.has(dispatch.Gate)
      ? `${dispatch.TerminalNumber && !terminalUnknown.has(dispatch.TerminalNumber) ? dispatch.TerminalNumber : ''}${dispatch.Gate}`
      : null

  const cardBorderClass =
    dispatch.FlightStatus === 'In Flight'
      ? 'border-l-destructive'
      : dispatch.FlightStatus === 'Completed'
        ? 'border-l-success opacity-70'
        : 'border-l-primary'

  return (
    <Card
      className={`p-5 bg-card border-border border-l-4 ${cardBorderClass} hover:shadow-lg transition-all duration-200`}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-xl font-bold text-foreground">
            {dispatch.FlightNumber} to {dispatch.Destination}
          </h3>
          {dispatch.AirlineName && (
            <p className="text-sm text-muted-foreground mt-1">{dispatch.AirlineName}</p>
          )}
        </div>
        <Badge className={getStatusColor(dispatch.FlightStatus)}>
          {dispatch.FlightStatus}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-muted/30 p-3 rounded-lg">
          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
            Tail Number
          </div>
          <div className="text-sm font-semibold text-foreground">
            {dispatch.TailNumber}
          </div>
        </div>

        {(dispatch.AircraftType || gateLabel) && (
          <div className="bg-muted/30 p-3 rounded-lg">
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
              Aircraft{gateLabel ? ' / Gate' : ' Type'}
            </div>
            <div className="text-sm font-semibold text-foreground">
              {[dispatch.AircraftType, gateLabel && `Gate ${gateLabel}`].filter(Boolean).join(' · ')}
            </div>
          </div>
        )}

        <div className="bg-muted/30 p-3 rounded-lg">
          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
            Arrival
          </div>
          <div className="text-sm font-semibold text-foreground">
            {formatDateTime(dispatch.ArrivalDate)}
          </div>
        </div>

        {dispatch.Origin && (
          <div className="bg-muted/30 p-3 rounded-lg">
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
              Origin
            </div>
            <div className="text-sm font-semibold text-foreground">
              {dispatch.Origin}
            </div>
          </div>
        )}

        <div className="bg-muted/30 p-3 rounded-lg">
          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
            Departure
          </div>
          <div className="text-sm font-semibold text-foreground">
            {formatDateTime(dispatch.DepartureDate)}
          </div>
        </div>
      </div>

      <div className="bg-success/10 border border-success/20 p-4 rounded-lg">
        <div className="text-center">
          <div className="text-2xl font-bold text-success">
            {dispatch.QuantityInWeight.toLocaleString()} lbs
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            ({dispatch.Quantity.toLocaleString()} gal)
          </div>
        </div>
      </div>

      {dispatch.QuantityInWeight > 0 && (
        <div className="mt-3">
          <WingLoadingPanel aircraftType={dispatch.AircraftType} requestLbs={dispatch.QuantityInWeight} />
        </div>
      )}

      {dispatch.MEL && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-800 dark:text-yellow-300">
          <span aria-hidden>⚠️</span>
          <span>{dispatch.MELMessage || 'MEL item on this aircraft'}</span>
        </div>
      )}
    </Card>
  )
}
