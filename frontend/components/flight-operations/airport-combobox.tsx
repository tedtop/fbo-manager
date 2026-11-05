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
import { useAirport, useAirportSearch } from '@/hooks/use-airports'
import {
  type AirportDisplayPreference,
  displayCode,
  formatAirportOption,
  isAmbiguous,
  isExactCodeMatch,
  storedCode
} from '@/lib/airports'
import { cn } from '@/lib/utils'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { useEffect, useState } from 'react'

interface AirportComboboxProps {
  id?: string
  /** The stored value: an ICAO code (KGPI) or free text for a strip that is not in the table. */
  value: string
  /** Called with the stored code of the picked airport, or the typed text. */
  onChange: (storedCode: string) => void
  /** ISO country of the home airport; airports there are listed first for ambiguous codes. */
  homeCountry?: string
  displayPreference?: AirportDisplayPreference
  placeholder?: string
  disabled?: boolean
}

const DEBOUNCE_MS = 200

export function AirportCombobox({
  id,
  value,
  onChange,
  homeCountry = 'US',
  displayPreference = 'faa',
  placeholder = 'Select airport',
  disabled
}: AirportComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  // The highlighted row, controlled so the first result is preselected as results arrive
  // (cmdk only does that itself when it filters): Enter picks it, arrows move it.
  const [highlighted, setHighlighted] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query])

  const { data: results = [], isFetching } = useAirportSearch(
    debounced,
    homeCountry
  )
  const { data: selected } = useAirport(value || undefined)

  const typed = query.trim()
  const ambiguous = isAmbiguous(results, typed)
  const hasExact = results.some((a) => isExactCodeMatch(a, typed))

  // Results belong to the debounced query: only preselect once they match what is typed.
  const resultsMatchQuery = debounced === typed
  const firstId = results[0]?.id
  useEffect(() => {
    if (!open) return
    if (!typed) setHighlighted(value ? 'clear-airport' : '')
    else if (resultsMatchQuery && firstId !== undefined)
      setHighlighted(`airport-${firstId}`)
    else if (resultsMatchQuery && !isFetching) setHighlighted(`typed-${typed}`)
  }, [open, typed, resultsMatchQuery, firstId, isFetching, value])

  const pick = (code: string) => {
    onChange(code)
    setOpen(false)
    setQuery('')
  }

  const label = !value
    ? placeholder
    : selected
      ? `${displayCode(selected, displayPreference)} · ${selected.name}`
      : value

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
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={cn('truncate', !value && 'text-muted-foreground')}>
            {label}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) min-w-80 p-0"
        align="start"
      >
        <Command
          shouldFilter={false}
          value={highlighted}
          onValueChange={setHighlighted}
        >
          <CommandInput
            placeholder="Code or name (MSO, KMSO, Kalispell)"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {value && !typed && (
              <CommandGroup>
                <CommandItem value="clear-airport" onSelect={() => pick('')}>
                  <X className="size-4 shrink-0 opacity-70" />
                  Clear (no airport)
                </CommandItem>
              </CommandGroup>
            )}
            {!typed && <CommandEmpty>Type a code, name or city.</CommandEmpty>}
            {typed && isFetching && results.length === 0 && (
              <CommandEmpty>Searching...</CommandEmpty>
            )}
            <CommandGroup
              heading={
                ambiguous
                  ? `${typed.toUpperCase()} matches more than one airport`
                  : undefined
              }
            >
              {results.map((a) => (
                <CommandItem
                  key={a.id}
                  value={`airport-${a.id}`}
                  onSelect={() => pick(storedCode(a))}
                >
                  <Check
                    className={cn(
                      'size-4 shrink-0',
                      value === storedCode(a) ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span className="truncate whitespace-pre">
                    {formatAirportOption(a)}
                  </span>
                </CommandItem>
              ))}
              {typed && !hasExact && (
                <CommandItem
                  value={`typed-${typed}`}
                  onSelect={() => pick(typed)}
                >
                  Use &quot;{typed}&quot; as typed
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
