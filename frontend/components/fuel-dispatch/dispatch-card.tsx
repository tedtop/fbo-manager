'use client'

import {
  type DispatchChanges,
  type FlightTrack,
  countdownMinutes,
  formatCountdown,
  formatDateTime,
  formatElapsedSince,
  formatLbs,
  formatMinutes,
  formatTimeOnly,
  gateLabel,
  normalizeTail,
  urgencyClass
} from '@/lib/dispatch-display'
import type { QTDispatch } from '@/types/qt-dispatch'
import type { ReactNode } from 'react'
import { WingLoadingPanel } from './wing-loading-panel'

interface DispatchCardProps {
  dispatch: QTDispatch
  /** Live ADS-B overlay for this tail, if any. */
  track?: FlightTrack
  /** Fuel / gate / time changes seen since this page opened. */
  changes?: DispatchChanges
  /** Re-render clock (ms): countdowns are computed against it. */
  now?: number
}

const Banner = ({ icon, text }: { icon: string; text: string }) => (
  <div className="fd-banner">
    <span className="fd-banner-icon">{icon}</span>
    <span className="fd-banner-text">{text}</span>
  </div>
)

// One dispatch as a Minuteman-style card (public/fuel_dispatch.html createDispatchCard): flight and
// status, tail / airline / arrival / departure tiles with countdowns, the fuel total, then MEL and
// change banners. The wing-loading fuel sheet is this app's addition and sits under the fuel total.
export function DispatchCard({ dispatch, track, changes, now = Date.now() }: DispatchCardProps) {
  const status = dispatch.FlightStatus
  const cardClass = [
    'fd-card',
    status === 'In Flight' ? 'priority' : status === 'Completed' ? 'completed' : '',
    dispatch.MEL ? 'mel' : '',
    changes ? 'has-change' : ''
  ]
    .filter(Boolean)
    .join(' ')

  const fr24Url = dispatch.TailNumber
    ? `https://www.flightradar24.com/data/aircraft/${dispatch.TailNumber.toLowerCase()}`
    : null
  const link = (text: string) =>
    fr24Url ? (
      <a className="fd-fr24" href={fr24Url} target="_blank" rel="noopener noreferrer">
        {text}
      </a>
    ) : (
      text
    )

  // Live ADS-B ETA for inbound flights, QT's own times otherwise; urgency colours either.
  let arrivalCountdown: ReactNode = null
  let departureCountdown: ReactNode = null
  let timeOnGround: ReactNode = null
  if (status === 'Planned') {
    if (track && !track.onGround && track.etaMinutes != null) {
      const trackTitle =
        `ADS-B: ${Math.round(track.distanceNm ?? 0)} nm out at ${Math.round(track.groundSpeedKt ?? 0)} kt` +
        (track.altitudeFt != null ? `, ${track.altitudeFt.toLocaleString()} ft` : '')
      arrivalCountdown = (
        <div className={`fd-info-sub ${urgencyClass(track.etaMinutes)}`} title={trackTitle}>
          in ~{formatMinutes(Math.max(1, Math.round(track.etaMinutes)))} <span className="fd-live-badge">live</span>
        </div>
      )
    } else {
      arrivalCountdown = (
        <div className={`fd-info-sub ${urgencyClass(countdownMinutes(dispatch.ArrivalDate, now))}`}>
          {formatCountdown(dispatch.ArrivalDate, now)}
        </div>
      )
    }
  } else if (status === 'In') {
    departureCountdown = (
      <div className={`fd-info-sub ${urgencyClass(countdownMinutes(dispatch.DepartureDate, now))}`}>
        {formatCountdown(dispatch.DepartureDate, now)}
      </div>
    )
    // QT's TimeOnGround is the scheduled turn (departure - arrival), not elapsed time, so elapsed is
    // computed from ArrivalDate and QT's figure shown for reference.
    const scheduledTurn =
      dispatch.TimeOnGround && dispatch.TimeOnGround !== 'Unknown' ? (
        <div className="fd-info-sub">of {dispatch.TimeOnGround} scheduled</div>
      ) : null
    timeOnGround = (
      <div className="fd-info-item">
        <div className="fd-info-label">Time on Ground</div>
        <div className="fd-info-value">{formatElapsedSince(dispatch.ArrivalDate, now)}</div>
        {scheduledTurn}
      </div>
    )
  }

  // The transponder's specific type (B39M) next to QT's generic one (737) when they differ, then the
  // gate as Terminal+Gate ("A4"), matching the ramp signage.
  const equipment =
    track?.equipmentCode && track.equipmentCode !== dispatch.AircraftType
      ? `${track.equipmentCode} (${dispatch.AircraftType})`
      : track?.equipmentCode || dispatch.AircraftType
  const gate = gateLabel(dispatch)
  const aircraftSub = [equipment, gate ? `Gate ${gate}` : null].filter(Boolean).join(' · ')

  const alerts: ReactNode[] = []
  if (dispatch.MEL) alerts.push(<Banner key="mel" icon="⚠️" text={dispatch.MELMessage || 'MEL item on this aircraft'} />)
  if (changes?.fuel.length) {
    const text = changes.fuel
      .map((c) => `Fuel ${c.increased ? 'increased' : 'decreased'}: ${formatLbs(c.oldValue)} → ${formatLbs(c.newValue)} lbs`)
      .join('\n')
    alerts.push(<Banner key="fuel" icon="⛽" text={text} />)
  }
  if (changes?.gate.length) {
    alerts.push(
      <Banner key="gate" icon="🚪" text={changes.gate.map((c) => `Gate changed: ${c.oldValue} → ${c.newValue}`).join('\n')} />
    )
  }
  if (changes?.time.length) {
    const text = changes.time
      .map((c) => `${c.label} changed: ${formatTimeOnly(c.oldValue)} → ${formatTimeOnly(c.newValue)}`)
      .join('\n')
    alerts.push(<Banner key="time" icon="🕐" text={text} />)
  }

  const flightTitle = `${dispatch.FlightNumber} to ${dispatch.Destination}`

  return (
    <div className={cardClass} data-testid="dispatch-card" data-tail={normalizeTail(dispatch.TailNumber)}>
      <div className="fd-flight-header">
        <div className="fd-flight-number">{link(flightTitle)}</div>
        <div className={`fd-flight-status ${status.toLowerCase().replace(' ', '-')}`}>{status}</div>
      </div>

      <div className="fd-flight-info">
        <div className="fd-info-item">
          <div className="fd-info-label">Tail Number</div>
          <div className="fd-info-value">{link(dispatch.TailNumber || '')}</div>
          {aircraftSub && <div className="fd-info-sub">{aircraftSub}</div>}
        </div>
        <div className="fd-info-item">
          <div className="fd-info-label">Airline</div>
          <div className="fd-info-value fd-airline-value">{dispatch.AirlineName}</div>
        </div>
        <div className="fd-info-item">
          <div className="fd-info-label">Arrival</div>
          <div className="fd-info-value">{formatDateTime(dispatch.ArrivalDate)}</div>
          {arrivalCountdown}
        </div>
        <div className="fd-info-item">
          <div className="fd-info-label">Departure</div>
          <div className="fd-info-value">{formatDateTime(dispatch.DepartureDate)}</div>
          {departureCountdown}
        </div>
        {timeOnGround}
      </div>

      <div className="fd-fuel-info">
        <div className="fd-fuel-quantity">
          {dispatch.QuantityInWeight} lbs ({dispatch.Quantity} gal)
        </div>
      </div>

      {dispatch.QuantityInWeight > 0 && (
        <div className="mt-3">
          <WingLoadingPanel
            aircraftType={dispatch.AircraftType}
            plannedLbs={dispatch.QuantityInWeight}
            title={`${dispatch.FlightNumber} ${dispatch.TailNumber}`}
          />
        </div>
      )}

      {alerts.length > 0 && <div className="fd-alerts">{alerts}</div>}
    </div>
  )
}
