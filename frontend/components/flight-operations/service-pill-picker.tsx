'use client'

import { useServices } from '@/hooks/use-services'
import { cn } from '@/lib/utils'
import type { ServiceRow } from '@/repositories/services.repo'
import { useEffect, useState } from 'react'
import { fallbackServiceLabel, getServiceVisual } from './service-visuals'

// One shared pill look for the card, the form fly-out and (read-only) anywhere else (B26c).
const PILL = 'flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] border'

// quantity_unit (B26f): set = the service carries a quantity ('gal'); NULL/missing = a plain toggle.
type CatalogEntry = Pick<ServiceRow, 'key' | 'label' | 'icon' | 'color'> & {
  quantity_unit?: string | null
}

/** "TKS Fluid · 12 gal" when the service has a unit and a quantity, else just the label. */
function pillText(
  label: string,
  entry?: CatalogEntry | null,
  quantity?: number
): string {
  return quantity != null && entry?.quantity_unit
    ? `${label} · ${quantity} ${entry.quantity_unit}`
    : label
}

interface ServicePillViewProps {
  serviceKey: string
  /** The catalog row, when loaded; without it the label is derived from the key. */
  service?: CatalogEntry | null
  /** flight_service.quantity; shown (with the catalog unit) only for services that have a quantity_unit. */
  quantity?: number
  className?: string
}

/** Read-only pill. Unknown keys render a generic pill, never throw. */
export function ServicePillView({
  serviceKey,
  service,
  quantity,
  className
}: ServicePillViewProps) {
  const { Icon, color } = getServiceVisual(serviceKey, service)
  return (
    <div className={cn(PILL, color, className)} data-service-key={serviceKey}>
      <Icon className="w-3 h-3" />
      {pillText(
        service?.label ?? fallbackServiceLabel(serviceKey),
        service,
        quantity
      )}
    </div>
  )
}

interface ServicePillPickerViewProps {
  catalog: CatalogEntry[]
  value: string[]
  onChange: (keys: string[]) => void
  /** key -> quantity for the services that have a quantity_unit. */
  quantities?: Record<string, number>
  /** Presence turns the quantity inputs on. Called AFTER onChange, so a parent must update it functionally. */
  onQuantitiesChange?: (quantities: Record<string, number>) => void
  disabled?: boolean
  className?: string
  loading?: boolean
}

/** Whole-number input that lets the field be cleared while typing; only a value >= 1 is committed. */
function QuantityInput({
  label,
  unit,
  value,
  disabled,
  onCommit
}: {
  label: string
  unit: string
  value: number
  disabled?: boolean
  onCommit: (n: number) => void
}) {
  const [text, setText] = useState(String(value))
  useEffect(
    () => setText((t) => (Number(t) === value ? t : String(value))),
    [value]
  )
  return (
    <>
      <input
        type="number"
        min={1}
        step={1}
        inputMode="numeric"
        value={text}
        disabled={disabled}
        aria-label={`${label} quantity (${unit})`}
        onChange={(e) => {
          setText(e.target.value)
          const n = Number(e.target.value)
          if (Number.isInteger(n) && n >= 1) onCommit(n)
        }}
        onBlur={() => setText(String(value))}
        className="h-5 w-12 rounded border border-border bg-background px-1 text-[11px] disabled:opacity-60"
      />
      <span className="text-[11px] text-muted-foreground">{unit}</span>
    </>
  )
}

/** Presentational picker over an explicit catalog (the exported ServicePillPicker feeds it from use-services). */
export function ServicePillPickerView({
  catalog,
  value,
  onChange,
  quantities,
  onQuantitiesChange,
  disabled,
  className,
  loading
}: ServicePillPickerViewProps) {
  const toggle = (key: string, entry: CatalogEntry | null) => {
    const removing = value.includes(key)
    onChange(removing ? value.filter((k) => k !== key) : [...value, key])
    if (onQuantitiesChange && entry?.quantity_unit) {
      const next = { ...quantities }
      if (removing) delete next[key]
      else next[key] = 1
      onQuantitiesChange(next)
    }
  }

  // Keys on the flight that are not in the active catalog (a retired service) stay visible and selected
  // so the user can untoggle them; saving a flight that still carries one would be refused by the RPC.
  const extras = value.filter((k) => !catalog.some((s) => s.key === k))

  if (loading && catalog.length === 0 && extras.length === 0) {
    return (
      <div className={cn('flex flex-wrap gap-1', className)} aria-busy="true">
        {['a', 'b', 'c', 'd', 'e', 'f'].map((id) => (
          <div key={id} className="h-5 w-16 rounded bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  const items: Array<{ key: string; entry: CatalogEntry | null }> = [
    ...catalog.map((entry) => ({ key: entry.key, entry })),
    ...extras.map((key) => ({ key, entry: null }))
  ]

  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {items.map(({ key, entry }) => {
        const selected = value.includes(key)
        const { Icon, color } = getServiceVisual(key, entry)
        const unit = entry?.quantity_unit
        const label = entry?.label ?? fallbackServiceLabel(key)
        const button = (
          <button
            key={key}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            data-service-key={key}
            onClick={() => toggle(key, entry)}
            className={cn(
              PILL,
              'transition-all disabled:cursor-not-allowed disabled:opacity-60',
              selected
                ? color
                : 'bg-muted/30 text-muted-foreground border-border hover:border-primary/40'
            )}
          >
            <Icon className="w-3 h-3" aria-hidden="true" />
            {label}
          </button>
        )
        if (!(selected && unit && onQuantitiesChange)) return button
        return (
          <span key={key} className="inline-flex items-center gap-0.5">
            {button}
            <QuantityInput
              label={label}
              unit={unit}
              value={quantities?.[key] ?? 1}
              disabled={disabled}
              onCommit={(n) => onQuantitiesChange({ ...quantities, [key]: n })}
            />
          </span>
        )
      })}
    </div>
  )
}

interface ServicePillPickerProps {
  /** Selected service keys (`service.key`). */
  value: string[]
  onChange: (keys: string[]) => void
  /** Optional (B26f): key -> quantity for services with a quantity_unit (e.g. TKS Fluid, gal). */
  quantities?: Record<string, number>
  /** Optional: when given, selected quantity services show a numeric input. Called after onChange. */
  onQuantitiesChange?: (quantities: Record<string, number>) => void
  disabled?: boolean
  className?: string
}

/** Toggle pills for the active service catalog. Contract: keys in, keys out (+ optional quantities). */
export function ServicePillPicker({
  value,
  onChange,
  quantities,
  onQuantitiesChange,
  disabled,
  className
}: ServicePillPickerProps) {
  const { services, loading } = useServices()
  return (
    <ServicePillPickerView
      catalog={services}
      value={value}
      onChange={onChange}
      quantities={quantities}
      onQuantitiesChange={onQuantitiesChange}
      disabled={disabled}
      className={className}
      loading={loading}
    />
  )
}

/** Placeholder pill shown while the service catalog loads; carries no data-service-key. */
export function ServicePillSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('h-5 w-14 rounded bg-muted animate-pulse', className)}
      data-service-loading="true"
      aria-busy="true"
    />
  )
}

interface ServicePillProps {
  serviceKey: string
  /** flight_service.quantity; rendered with the catalog unit, e.g. "TKS Fluid · 12 gal". */
  quantity?: number
  className?: string
}

/** Read-only pill for one service key, labelled from the catalog. */
export function ServicePill({
  serviceKey,
  quantity,
  className
}: ServicePillProps) {
  const { services, loading } = useServices()
  // Until the catalog arrives a bare key could only be drawn with the derived label ("Gpu"), which flashes
  // a wrong name on the card (B138). Show a placeholder instead; a failed fetch still falls back to the key label.
  if (loading) return <ServicePillSkeleton className={className} />
  return (
    <ServicePillView
      serviceKey={serviceKey}
      service={services.find((s) => s.key === serviceKey)}
      quantity={quantity}
      className={className}
    />
  )
}
