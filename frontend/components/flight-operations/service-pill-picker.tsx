'use client'

import { useServices } from '@/hooks/use-services'
import { cn } from '@/lib/utils'
import type { ServiceRow } from '@/repositories/services.repo'
import { fallbackServiceLabel, getServiceVisual } from './service-visuals'

// One shared pill look for the card, the form fly-out and (read-only) anywhere else (B26c).
const PILL = 'flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] border'

type CatalogEntry = Pick<ServiceRow, 'key' | 'label' | 'icon' | 'color'>

interface ServicePillViewProps {
  serviceKey: string
  /** The catalog row, when loaded; without it the label is derived from the key. */
  service?: CatalogEntry | null
  className?: string
}

/** Read-only pill. Unknown keys render a generic pill, never throw. */
export function ServicePillView({ serviceKey, service, className }: ServicePillViewProps) {
  const { Icon, color } = getServiceVisual(serviceKey, service)
  return (
    <div className={cn(PILL, color, className)} data-service-key={serviceKey}>
      <Icon className="w-3 h-3" />
      {service?.label ?? fallbackServiceLabel(serviceKey)}
    </div>
  )
}

interface ServicePillPickerViewProps {
  catalog: CatalogEntry[]
  value: string[]
  onChange: (keys: string[]) => void
  disabled?: boolean
  className?: string
  loading?: boolean
}

/** Presentational picker over an explicit catalog (the exported ServicePillPicker feeds it from use-services). */
export function ServicePillPickerView({
  catalog,
  value,
  onChange,
  disabled,
  className,
  loading
}: ServicePillPickerViewProps) {
  const toggle = (key: string) =>
    onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key])

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
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            data-service-key={key}
            onClick={() => toggle(key)}
            className={cn(
              PILL,
              'transition-all disabled:cursor-not-allowed disabled:opacity-60',
              selected
                ? color
                : 'bg-muted/30 text-muted-foreground border-border hover:border-primary/40'
            )}
          >
            <Icon className="w-3 h-3" aria-hidden="true" />
            {entry?.label ?? fallbackServiceLabel(key)}
          </button>
        )
      })}
    </div>
  )
}

interface ServicePillPickerProps {
  /** Selected service keys (`service.key`). */
  value: string[]
  onChange: (keys: string[]) => void
  disabled?: boolean
  className?: string
}

/** Toggle pills for the active service catalog. Contract: keys in, keys out. */
export function ServicePillPicker({ value, onChange, disabled, className }: ServicePillPickerProps) {
  const { services, loading } = useServices()
  return (
    <ServicePillPickerView
      catalog={services}
      value={value}
      onChange={onChange}
      disabled={disabled}
      className={className}
      loading={loading}
    />
  )
}

interface ServicePillProps {
  serviceKey: string
  className?: string
}

/** Read-only pill for one service key, labelled from the catalog. */
export function ServicePill({ serviceKey, className }: ServicePillProps) {
  const { services } = useServices()
  return (
    <ServicePillView
      serviceKey={serviceKey}
      service={services.find((s) => s.key === serviceKey)}
      className={className}
    />
  )
}
