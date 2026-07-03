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
import { cn } from '@/lib/utils'
import type { CustomerRow } from '@/repositories/customers.repo'
import { Check, ChevronsUpDown, PenLine } from 'lucide-react'
import { useState } from 'react'

interface CustomerComboboxProps {
  customers: CustomerRow[]
  /** Linked account (required for E.O.M. / R.O.A. billing). */
  customerId: number | null
  /** NAME exactly as written on the ticket, e.g. 'UA5996'. */
  customerName: string
  onChange: (customerId: number | null, customerName: string) => void
  disabled?: boolean
}

/**
 * The NAME field: pick a known account or keep whatever was typed as a
 * write-in (airline + flight number style, no account link).
 */
export function CustomerCombobox({
  customers,
  customerId,
  customerName,
  onChange,
  disabled
}: CustomerComboboxProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const selected = customers.find((c) => c.id === customerId) ?? null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label="Customer name"
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          {customerName ? (
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate">{customerName}</span>
              {selected ? (
                <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-primary">
                  account
                </span>
              ) : (
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                  write-in
                </span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">Customer / flight…</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search accounts or type a name…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No matching account.</CommandEmpty>
            {search.trim() && (
              <CommandGroup>
                <CommandItem
                  value={`write-in-${search}`}
                  onSelect={() => {
                    onChange(null, search.trim())
                    setOpen(false)
                    setSearch('')
                  }}
                >
                  <PenLine className="mr-2 h-4 w-4 text-muted-foreground" />
                  Use “{search.trim()}” as written
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup heading="Accounts">
              {customers.map((customer) => (
                <CommandItem
                  key={customer.id}
                  value={customer.name}
                  onSelect={() => {
                    onChange(customer.id, customer.name)
                    setOpen(false)
                    setSearch('')
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      customerId === customer.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span className="truncate">{customer.name}</span>
                  <span className="ml-auto text-xs uppercase text-muted-foreground">
                    {customer.customer_type}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
