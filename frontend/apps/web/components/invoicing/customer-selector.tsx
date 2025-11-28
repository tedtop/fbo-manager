"use client"

import * as React from "react"
import { Check, ChevronsUpDown, User } from "lucide-react"
import { cn } from "@frontend/ui/lib/utils"
import { Button } from "@frontend/ui/components/ui/button"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@frontend/ui/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@frontend/ui/components/ui/popover"
import type { Customer } from "./types"

const MOCK_CUSTOMERS: Customer[] = [
    { id: "1", name: "John Doe (N12345)", type: "ga" },
    { id: "2", name: "NetJets (N555QS)", type: "private" },
    { id: "3", name: "US Forest Service", type: "usfs" },
    { id: "4", name: "Military Ops", type: "military" },
]

interface CustomerSelectorProps {
    selectedCustomer: Customer | null
    onSelect: (customer: Customer | null) => void
}

export function CustomerSelector({ selectedCustomer, onSelect }: CustomerSelectorProps) {
    const [open, setOpen] = React.useState(false)

    return (
        <div className="space-y-2">
            <label className="text-sm font-medium">Customer</label>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className="w-full justify-between"
                    >
                        {selectedCustomer ? (
                            <span className="flex items-center gap-2">
                                <User className="h-4 w-4" />
                                {selectedCustomer.name}
                            </span>
                        ) : (
                            "Select customer..."
                        )}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0">
                    <Command>
                        <CommandInput placeholder="Search customer..." />
                        <CommandList>
                            <CommandEmpty>No customer found.</CommandEmpty>
                            <CommandGroup>
                                {MOCK_CUSTOMERS.map((customer) => (
                                    <CommandItem
                                        key={customer.id}
                                        value={customer.name}
                                        onSelect={() => {
                                            onSelect(customer)
                                            setOpen(false)
                                        }}
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-4 w-4",
                                                selectedCustomer?.id === customer.id ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                        {customer.name}
                                        <span className="ml-auto text-xs text-muted-foreground uppercase">
                                            {customer.type}
                                        </span>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
        </div>
    )
}
