"use client"

import * as React from "react"
import { Check, ChevronsUpDown, User, Plus, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from "@/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCustomers, useCreateCustomer } from "@/hooks/use-customers"
import type { CustomerRow } from "@/repositories/customers.repo"

interface CustomerSelectorProps {
    selectedCustomer: CustomerRow | null
    onSelect: (customer: CustomerRow | null) => void
}

export function CustomerSelector({ selectedCustomer, onSelect }: CustomerSelectorProps) {
    const [open, setOpen] = React.useState(false)
    const [showCreate, setShowCreate] = React.useState(false)
    const [newName, setNewName] = React.useState("")
    const [newEmail, setNewEmail] = React.useState("")
    const [newPhone, setNewPhone] = React.useState("")
    const [newType, setNewType] = React.useState<CustomerRow["customer_type"]>("ga")

    const { data: customers = [], isLoading } = useCustomers()
    const createCustomer = useCreateCustomer()

    const handleCreate = async () => {
        if (!newName.trim()) return
        const created = await createCustomer.mutateAsync({
            name: newName.trim(),
            email: newEmail.trim(),
            phone: newPhone.trim(),
            customer_type: newType,
        })
        onSelect(created)
        setShowCreate(false)
        setNewName("")
        setNewEmail("")
        setNewPhone("")
        setNewType("ga")
    }

    return (
        <>
            <div className="space-y-2">
                <Label>Customer</Label>
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
                            ) : isLoading ? (
                                <span className="flex items-center gap-2 text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading customers...
                                </span>
                            ) : (
                                <span className="text-muted-foreground">Select customer...</span>
                            )}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[340px] p-0">
                        <Command>
                            <CommandInput placeholder="Search customer..." />
                            <CommandList>
                                <CommandEmpty>No customer found.</CommandEmpty>
                                <CommandGroup>
                                    {customers.map((customer) => (
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
                                            <span className="flex-1">{customer.name}</span>
                                            <span className="text-xs text-muted-foreground uppercase ml-2">
                                                {customer.customer_type}
                                            </span>
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                                <CommandSeparator />
                                <CommandGroup>
                                    <CommandItem
                                        onSelect={() => {
                                            setOpen(false)
                                            setShowCreate(true)
                                        }}
                                        className="text-primary"
                                    >
                                        <Plus className="mr-2 h-4 w-4" />
                                        Create new customer
                                    </CommandItem>
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
                {selectedCustomer?.email && (
                    <p className="text-xs text-muted-foreground">{selectedCustomer.email}</p>
                )}
            </div>

            <Dialog open={showCreate} onOpenChange={setShowCreate}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>New Customer</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-1">
                            <Label htmlFor="new-name">Name *</Label>
                            <Input
                                id="new-name"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="John Smith / NetJets"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="new-email">Email</Label>
                            <Input
                                id="new-email"
                                type="email"
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                placeholder="email@example.com"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="new-phone">Phone</Label>
                            <Input
                                id="new-phone"
                                value={newPhone}
                                onChange={(e) => setNewPhone(e.target.value)}
                                placeholder="(555) 000-0000"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label>Type</Label>
                            <Select value={newType} onValueChange={(v) => setNewType(v as CustomerRow["customer_type"])}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ga">General Aviation</SelectItem>
                                    <SelectItem value="private">Private / Charter</SelectItem>
                                    <SelectItem value="military">Military</SelectItem>
                                    <SelectItem value="usfs">US Forest Service</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                        <Button
                            onClick={handleCreate}
                            disabled={!newName.trim() || createCustomer.isPending}
                        >
                            {createCustomer.isPending ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</>
                            ) : "Create Customer"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
