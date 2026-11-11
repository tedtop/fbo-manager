'use client'

import { dimensionsFor } from '@/lib/aircraft-dimensions'
import {
  cardinalScreenAngles,
  fitSilhouette,
  headingToScreenAngle,
  keyboardHeading,
  pointerToHeading,
  roseTicks
} from '@/lib/compass-rose'
import { cn } from '@/lib/utils'
import { type KeyboardEvent, type PointerEvent, useRef } from 'react'
import { aircraftIconUrl, paddedSize } from './aircraft-icon'

// The rose is drawn in a 200 x 200 box centred on the origin, so its size on screen is only CSS.
const RING_RADIUS = 92
const TICK_LENGTH = { major: 14, medium: 9, minor: 5 }
const LABEL_RADIUS = 68
/** The whole plane, at any angle, stays inside this circle (clear of the cardinal marks). */
const PLANE_RADIUS = 52

const CARDINALS = ['N', 'E', 'S', 'W'] as const

type CompassRoseProps = {
  /** True heading of the aircraft, whole degrees 0..359. */
  heading: number
  /** Current rotation of the map: the rose is drawn as the map is, with north turned by it. */
  mapBearing: number
  typeIcao: string
  /** Live: called for every heading picked by pointer or keyboard. */
  onChange: (heading: number) => void
  className?: string
}

/** Polar position on the rose: degrees clockwise from the top of the screen. */
function polar(screenAngle: number, radius: number) {
  const rad = (screenAngle * Math.PI) / 180
  return { x: radius * Math.sin(rad), y: -radius * Math.cos(rad) }
}

/**
 * Round compass for setting an aircraft's heading: click or drag anywhere on it, or use the
 * arrow keys when it is focused. The plane silhouette in the middle points at the heading.
 * The top of the rose is the top of the map, so with a rotated map the N mark is turned too.
 */
export function CompassRose({
  heading,
  mapBearing,
  typeIcao,
  onChange,
  className
}: CompassRoseProps) {
  const dims = dimensionsFor(typeIcao)
  // Fit the padded image so the outline at the wing tips and nose stays inside the circle.
  const padded = paddedSize(dims.wingspanM, dims.lengthM)
  const plane = fitSilhouette(padded.width, padded.height, PLANE_RADIUS)
  const iconUrl = aircraftIconUrl(
    dims.category,
    true,
    dims.wingspanM / dims.lengthM
  )
  const cardinals = cardinalScreenAngles(mapBearing)
  const draggingRef = useRef(false)

  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const next = pointerToHeading(
      e.clientX - (rect.left + rect.width / 2),
      e.clientY - (rect.top + rect.height / 2),
      mapBearing
    )
    if (next !== null && next !== heading) onChange(next)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const next = keyboardHeading(heading, e.key, e.shiftKey)
    if (next === null) return
    // The rose handles its own keys: the arrow keys must not also turn or move the plane
    // through the map-level handler (use-plane-markers.ts ignores role="slider" targets too).
    e.preventDefault()
    e.stopPropagation()
    if (next !== heading) onChange(next)
  }

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Aircraft heading"
      aria-valuemin={0}
      aria-valuemax={359}
      aria-valuenow={heading}
      aria-valuetext={`${heading} degrees`}
      data-testid="compass-rose"
      className={cn(
        'mx-auto aspect-square w-48 max-w-full cursor-pointer touch-none select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className
      )}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return
        draggingRef.current = true
        try {
          // Keeps the drag going when the pointer leaves the rose (mouse, touch and pen alike).
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          // Not an active pointer (synthetic events): the click itself still counts.
        }
        pick(e)
      }}
      onPointerMove={(e) => {
        if (draggingRef.current) pick(e)
      }}
      onPointerUp={() => {
        draggingRef.current = false
      }}
      onPointerCancel={() => {
        draggingRef.current = false
      }}
    >
      <svg
        viewBox="-100 -100 200 200"
        className="pointer-events-none size-full"
        aria-hidden="true"
      >
        <circle
          r={RING_RADIUS}
          className="fill-muted/40 stroke-muted-foreground/50"
          strokeWidth={1.5}
        />
        {roseTicks(mapBearing).map((tick) => {
          const from = polar(tick.screenAngle, RING_RADIUS)
          const to = polar(
            tick.screenAngle,
            RING_RADIUS - TICK_LENGTH[tick.kind]
          )
          return (
            <line
              key={tick.heading}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              className={
                tick.kind === 'major'
                  ? 'stroke-foreground'
                  : 'stroke-muted-foreground'
              }
              strokeWidth={tick.kind === 'major' ? 2 : 1}
              strokeOpacity={tick.kind === 'minor' ? 0.55 : 1}
            />
          )
        })}
        {CARDINALS.map((mark) => {
          const at = polar(cardinals[mark], LABEL_RADIUS)
          return (
            <text
              key={mark}
              x={at.x}
              y={at.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={mark === 'N' ? 18 : 14}
              fontWeight={700}
              className={
                mark === 'N' ? 'fill-destructive' : 'fill-muted-foreground'
              }
            >
              {mark}
            </text>
          )
        })}
        {/* Notch above the ring: the top of the screen, whatever the map rotation. */}
        <path
          d="M 0 -91 L -5 -100 L 5 -100 Z"
          className="fill-primary"
          data-testid="map-up-notch"
        >
          <title>Map up</title>
        </path>
        <image
          href={iconUrl}
          x={-plane.width / 2}
          y={-plane.height / 2}
          width={plane.width}
          height={plane.height}
          preserveAspectRatio="none"
          transform={`rotate(${headingToScreenAngle(heading, mapBearing)})`}
          opacity={dims.estimated ? 0.7 : 1}
          data-testid="compass-plane"
        />
      </svg>
    </div>
  )
}
