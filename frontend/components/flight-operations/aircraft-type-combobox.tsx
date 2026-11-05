'use client'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover'
import {
  findIcaoType,
  formatIcaoType,
  rankAndFilterIcaoTypes
} from '@/lib/icao-aircraft-types'
import { cn } from '@/lib/utils'
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react'
import { useMemo, useState } from 'react'

interface AircraftTypeComboboxProps {
  id?: string
  /** Display string currently stored on the form (e.g. "Gulfstream G650"). */
  value: string
  /** ICAO code currently selected, if known. */
  icao?: string
  usageCounts: Record<string, number>
  onSelect: (display: string, icao: string) => void
  disabled?: boolean
  /** Shows a spinner and disables the field while a type lookup is running. */
  loading?: boolean
}

const MAX_ROWS = 60

export function AircraftTypeCombobox({
  id,
  value,
  icao,
  usageCounts,
  onSelect,
  disabled,
  loading = false
}: AircraftTypeComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const results = useMemo(
    () => rankAndFilterIcaoTypes(query, usageCounts),
    [query, usageCounts]
  )
  const typed = query.trim()
  const hasExactCode = results.some(
    (t) => t.icao.toLowerCase() === typed.toLowerCase()
  )

  const select = (display: string, code: string) => {
    onSelect(display, code)
    setOpen(false)
    setQuery('')
  }

  const selectedIcao =
    icao && icao !== 'UNKN'
      ? icao
      : (findIcaoType(value)?.icao ??
        results.find((t) => formatIcaoType(t) === value)?.icao)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          // biome-ignore lint/a11y/useSemanticElements: standard shadcn combobox trigger pattern
          role="combobox"
          aria-expanded={open}
          disabled={disabled || loading}
          aria-busy={loading || undefined}
          className="w-full justify-between font-normal"
        >
          <span className={cn('truncate', !value && 'text-muted-foreground')}>
            {value
              ? selectedIcao
                ? `${selectedIcao} · ${value}`
                : value
              : 'Select aircraft type'}
          </span>
          {loading ? (
            <Loader2
              className="size-4 shrink-0 animate-spin opacity-70"
              aria-label="Looking up aircraft type"
            />
          ) : (
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) min-w-72 p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search code or model (e.g. G650, GLF6)"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {results.length === 0 && !typed && (
              <CommandEmpty>No aircraft types.</CommandEmpty>
            )}
            <CommandGroup>
              {typed && !hasExactCode && (
                <CommandItem
                  value={`custom-${typed}`}
                  onSelect={() => {
                    const upper = typed.toUpperCase()
                    select(
                      typed,
                      /^[A-Z0-9]{2,4}$/.test(upper) ? upper : 'UNKN'
                    )
                  }}
                >
                  Use &lsquo;{typed}&rsquo; as custom type
                </CommandItem>
              )}
              {results.slice(0, MAX_ROWS).map((t) => (
                <CommandItem
                  key={t.icao}
                  value={t.icao}
                  onSelect={() => select(formatIcaoType(t), t.icao)}
                >
                  <Check
                    className={cn(
                      'size-4',
                      selectedIcao === t.icao ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span className="font-mono">{t.icao}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="truncate">{formatIcaoType(t)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
