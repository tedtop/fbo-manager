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
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover'
import type { ProductRow } from '@/repositories/products.repo'
import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { formatCurrency, lineAmount, parseNum } from './ticket-math'
import { type ServiceLineDraft, draftKey } from './types'

interface ServiceItemsEditorProps {
  items: ServiceLineDraft[]
  onChange: (items: ServiceLineDraft[]) => void
  products: ProductRow[]
  disabled?: boolean
}

export function serviceLineTotal(items: ServiceLineDraft[]): number {
  return items.reduce((sum, item) => {
    const qty = parseNum(item.quantity)
    const price = parseNum(item.unitPrice)
    if (qty == null || price == null) return sum
    return sum + lineAmount(qty, price)
  }, 0)
}

/**
 * Non-fuel lines: pick from the service catalog or free-type a line.
 * Everything stays keyboard-reachable — the catalog opens as a command
 * palette, rows are plain inputs.
 */
export function ServiceItemsEditor({
  items,
  onChange,
  products,
  disabled
}: ServiceItemsEditorProps) {
  const [pickerOpen, setPickerOpen] = useState(false)

  const update = (key: string, patch: Partial<ServiceLineDraft>) => {
    onChange(
      items.map((item) => (item.key === key ? { ...item, ...patch } : item))
    )
  }

  const remove = (key: string) => {
    onChange(items.filter((item) => item.key !== key))
  }

  const addFromCatalog = (product: ProductRow) => {
    onChange([
      ...items,
      {
        key: draftKey(),
        itemType:
          product.product_type === 'fuel'
            ? 'service'
            : (product.product_type as ServiceLineDraft['itemType']),
        productId: product.id,
        description: product.name,
        quantity: '1',
        unitPrice: String(product.price)
      }
    ])
    setPickerOpen(false)
  }

  const addBlank = () => {
    onChange([
      ...items,
      {
        key: draftKey(),
        itemType: 'service',
        productId: null,
        description: '',
        quantity: '1',
        unitPrice: ''
      }
    ])
  }

  return (
    <div className="space-y-1.5">
      {items.map((item) => {
        const qty = parseNum(item.quantity)
        const price = parseNum(item.unitPrice)
        const amount =
          qty != null && price != null ? lineAmount(qty, price) : null
        return (
          <div key={item.key} className="flex items-center gap-1.5">
            <Input
              value={item.description}
              onChange={(e) =>
                update(item.key, {
                  description: e.target.value,
                  productId: null
                })
              }
              placeholder="Description"
              aria-label="Line item description"
              className="h-8 flex-1"
              disabled={disabled}
            />
            <Input
              inputMode="decimal"
              value={item.quantity}
              onChange={(e) => update(item.key, { quantity: e.target.value })}
              placeholder="Qty"
              aria-label="Quantity"
              className="h-8 w-16 text-right font-mono tabular-nums"
              disabled={disabled}
            />
            <Input
              inputMode="decimal"
              value={item.unitPrice}
              onChange={(e) => update(item.key, { unitPrice: e.target.value })}
              placeholder="Price"
              aria-label="Unit price"
              className="h-8 w-24 text-right font-mono tabular-nums"
              disabled={disabled}
            />
            <span className="w-24 text-right font-mono text-sm tabular-nums">
              {amount != null ? formatCurrency(amount) : '—'}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={() => remove(item.key)}
              disabled={disabled}
              aria-label="Remove line item"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )
      })}

      <div className="flex gap-2">
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={disabled}
            >
              <Plus className="mr-1 h-3 w-3" />
              From catalog
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[320px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search services…" />
              <CommandList>
                <CommandEmpty>Nothing in the catalog.</CommandEmpty>
                <CommandGroup>
                  {products
                    .filter((p) => p.product_type !== 'fuel')
                    .map((product) => (
                      <CommandItem
                        key={product.id}
                        value={product.name}
                        onSelect={() => addFromCatalog(product)}
                      >
                        <span className="truncate">{product.name}</span>
                        <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
                          {formatCurrency(Number(product.price))}
                        </span>
                      </CommandItem>
                    ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={addBlank}
          disabled={disabled}
        >
          <Plus className="mr-1 h-3 w-3" />
          Blank line
        </Button>
      </div>
    </div>
  )
}
