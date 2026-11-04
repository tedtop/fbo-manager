'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAppSettings } from '@/hooks/use-app-settings'
import { useEquipment } from '@/hooks/use-equipment'
import { useToast } from '@/hooks/use-toast'
import {
  DEFAULT_EQUIPMENT_TYPES,
  type EquipmentTypeDef,
  FUEL_TRUCK_TYPE,
  MAX_EQUIPMENT_TYPE_LABEL_LENGTH,
  slugifyEquipmentType,
  validateEquipmentTypes
} from '@/lib/app-settings'
import { describeError } from '@/lib/error-message'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

function sameList(a: EquipmentTypeDef[], b: EquipmentTypeDef[]) {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function EquipmentTypesEditor() {
  const { settings, saveEquipmentTypes } = useAppSettings()
  const { equipment } = useEquipment()
  const { toast } = useToast()
  const [types, setTypes] = useState<EquipmentTypeDef[]>(settings.equipmentTypes)

  useEffect(() => {
    setTypes(settings.equipmentTypes)
  }, [settings.equipmentTypes])

  const inUse = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of equipment) {
      counts.set(e.equipment_type, (counts.get(e.equipment_type) ?? 0) + 1)
    }
    return counts
  }, [equipment])

  const problem = validateEquipmentTypes(types)
  const unchanged = sameList(types, settings.equipmentTypes)

  const update = (index: number, patch: Partial<EquipmentTypeDef>) =>
    setTypes((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)))

  const move = (index: number, by: -1 | 1) =>
    setTypes((prev) => {
      const next = [...prev]
      const target = index + by
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })

  const add = () =>
    setTypes((prev) => [
      ...prev,
      {
        value: slugifyEquipmentType(
          'new type',
          prev.map((t) => t.value)
        ),
        label: '',
        icon: ''
      }
    ])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (problem || unchanged) return
    // New rows got a placeholder value; derive the stored value from the final name (existing rows keep theirs).
    const taken: string[] = settings.equipmentTypes.map((t) => t.value)
    const cleaned = types.map((t) => {
      const label = t.label.trim()
      if (taken.includes(t.value)) return { ...t, label, icon: t.icon.trim() }
      const value = slugifyEquipmentType(label, taken)
      taken.push(value)
      return { value, label, icon: t.icon.trim() }
    })
    try {
      await saveEquipmentTypes.mutateAsync(cleaned)
      toast({ title: 'Equipment types saved' })
    } catch (error) {
      toast({
        title: "Couldn't save equipment types",
        description: describeError(error),
        variant: 'destructive'
      })
    }
  }

  return (
    <form
      onSubmit={handleSave}
      className="max-w-xl space-y-4 rounded-lg border border-border bg-card p-6"
    >
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Equipment types
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The kinds of equipment offered on the Equipment page and its form.
          Renaming a type updates every piece of equipment using it. A type in
          use can&apos;t be removed. Fuel Truck is built in because truck
          sheets and fuel dispatch depend on it.
        </p>
      </div>

      <ul className="space-y-2">
        {types.map((type, index) => {
          const count = inUse.get(type.value) ?? 0
          const locked = type.value === FUEL_TRUCK_TYPE
          const removeTitle = locked
            ? 'Fuel Truck is required'
            : count > 0
              ? `${count} equipment item${count === 1 ? '' : 's'} use this type`
              : 'Remove type'
          return (
            <li key={`${type.value}-${index}`} className="flex items-center gap-2">
              <Input
                aria-label={`Icon for ${type.label || 'new type'}`}
                value={type.icon}
                onChange={(e) => update(index, { icon: e.target.value })}
                maxLength={4}
                placeholder="🔧"
                className="w-16 text-center"
              />
              <Input
                aria-label="Type name"
                value={type.label}
                onChange={(e) => update(index, { label: e.target.value })}
                maxLength={MAX_EQUIPMENT_TYPE_LABEL_LENGTH}
                placeholder="Type name"
                className="flex-1"
              />
              <span className="w-12 text-right text-xs text-muted-foreground">
                {count > 0 ? `${count} in use` : ''}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Move ${type.label || 'type'} up`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUp className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Move ${type.label || 'type'} down`}
                disabled={index === types.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${type.label || 'type'}`}
                title={removeTitle}
                disabled={locked || count > 0}
                onClick={() =>
                  setTypes((prev) => prev.filter((_, i) => i !== index))
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          )
        })}
      </ul>

      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="size-4" /> Add type
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setTypes(DEFAULT_EQUIPMENT_TYPES)}
        >
          Reset to defaults
        </Button>
        <div className="ml-auto flex items-center gap-3">
          {!problem && !unchanged && (
            <span className="text-sm text-muted-foreground">Unsaved change</span>
          )}
          <Button
            type="submit"
            disabled={!!problem || unchanged || saveEquipmentTypes.isPending}
          >
            {saveEquipmentTypes.isPending ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
    </form>
  )
}
