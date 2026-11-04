// App-wide settings (table app_setting, one row per key). This file is the single place that knows which
// keys exist, their built-in defaults and how a value is cleaned and validated; the repository and the
// Settings page both go through it.

export const TAIL_NUMBER_PREFIX_KEY = 'tail_number_prefix'
export const EQUIPMENT_TYPES_KEY = 'equipment_types'

/** One kind of equipment. `value` is what equipment.equipment_type stores and never changes; label and icon are display. */
export type EquipmentTypeDef = { value: string; label: string; icon: string }

/** Fuel truck logic (truck sheets, fuel dispatch, imports) keys on this value, so it can't be removed. */
export const FUEL_TRUCK_TYPE = 'fuel_truck'

export const DEFAULT_EQUIPMENT_TYPES: EquipmentTypeDef[] = [
  { value: 'fuel_truck', label: 'Fuel Truck', icon: '⛽' },
  { value: 'tug', label: 'Tug', icon: '🚜' },
  { value: 'gpu', label: 'GPU', icon: '⚡' },
  { value: 'air_start', label: 'Air Start', icon: '💨' },
  { value: 'belt_loader', label: 'Belt Loader', icon: '🧰' },
  { value: 'stairs', label: 'Air Stairs', icon: '🪜' },
  { value: 'lavatory_service', label: 'Lavatory Cart', icon: '🚿' },
  { value: 'water_service', label: 'Water Cart', icon: '💧' },
  { value: 'golf_cart', label: 'Golf Cart', icon: '⛳' },
  { value: 'staff_vehicle', label: 'Staff Vehicle', icon: '🚗' },
  { value: 'courtesy_vehicle', label: 'Courtesy Vehicle', icon: '🚙' },
  { value: 'other', label: 'Other', icon: '🔧' }
]

export const MAX_EQUIPMENT_TYPES = 40
export const MAX_EQUIPMENT_TYPE_LABEL_LENGTH = 40
export const FALLBACK_EQUIPMENT_ICON = '🔧'

export type AppSettings = {
  /** Text pre-filled into the tail number field of the Add Flight form, e.g. "N" or "C-". "" = no prefill. */
  tailNumberPrefix: string
  /** The equipment types offered on the Equipment page and form, in display order. */
  equipmentTypes: EquipmentTypeDef[]
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  tailNumberPrefix: 'N',
  equipmentTypes: DEFAULT_EQUIPMENT_TYPES
}

/** "lavatory_service" -> "Lavatory Service": display fallback for a stored type that is not in the list. */
export function formatTypeLabel(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function equipmentTypeLabel(
  types: EquipmentTypeDef[],
  value: string
): string {
  return types.find((t) => t.value === value)?.label ?? formatTypeLabel(value)
}

export function equipmentTypeIcon(
  types: EquipmentTypeDef[],
  value: string
): string {
  return types.find((t) => t.value === value)?.icon || FALLBACK_EQUIPMENT_ICON
}

/** A new type's stored value, derived from its label and made unique among `existing`. */
export function slugifyEquipmentType(label: string, existing: string[]): string {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'type'
  let value = base
  for (let n = 2; existing.includes(value); n++) value = `${base}_${n}`
  return value
}

/** null when the list is acceptable, else a message for the Settings page. */
export function validateEquipmentTypes(types: EquipmentTypeDef[]): string | null {
  if (types.length > MAX_EQUIPMENT_TYPES) {
    return `Use at most ${MAX_EQUIPMENT_TYPES} types.`
  }
  if (!types.some((t) => t.value === FUEL_TRUCK_TYPE)) {
    return 'The Fuel Truck type is required.'
  }
  const seen = new Set<string>()
  for (const t of types) {
    const label = t.label.trim()
    if (!label) return 'Every type needs a name.'
    if (label.length > MAX_EQUIPMENT_TYPE_LABEL_LENGTH) {
      return `Names can be at most ${MAX_EQUIPMENT_TYPE_LABEL_LENGTH} characters.`
    }
    const key = label.toLowerCase()
    if (seen.has(key)) return `"${label}" is listed twice.`
    seen.add(key)
  }
  return null
}

function equipmentTypesFromValue(value: unknown): EquipmentTypeDef[] | null {
  if (!Array.isArray(value)) return null
  const types: EquipmentTypeDef[] = []
  for (const item of value) {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof item.value !== 'string' ||
      !/^[a-z][a-z0-9_]*$/.test(item.value) ||
      typeof item.label !== 'string' ||
      typeof item.icon !== 'string'
    ) {
      return null
    }
    types.push({
      value: item.value,
      label: item.label.trim(),
      icon: item.icon.trim()
    })
  }
  return validateEquipmentTypes(types) === null ? types : null
}

export const MAX_TAIL_PREFIX_LENGTH = 4

// Common registration prefixes, offered as one-tap choices on the Settings page.
export const TAIL_PREFIX_PRESETS: { prefix: string; label: string }[] = [
  { prefix: 'N', label: 'United States' },
  { prefix: 'C-', label: 'Canada' },
  { prefix: 'G-', label: 'United Kingdom' },
  { prefix: 'D-', label: 'Germany' },
  { prefix: 'VH-', label: 'Australia' },
  { prefix: 'F-', label: 'France' }
]

// Tail numbers are upper case everywhere in the app (the tail field upper-cases as you type).
export function normalizeTailPrefix(raw: string): string {
  return raw.trim().toUpperCase()
}

/** null when the prefix is acceptable, else a message for the Settings page. "" is allowed: no prefill. */
export function validateTailPrefix(raw: string): string | null {
  const prefix = normalizeTailPrefix(raw)
  if (prefix.length > MAX_TAIL_PREFIX_LENGTH) {
    return `Use at most ${MAX_TAIL_PREFIX_LENGTH} characters.`
  }
  if (!/^[A-Z0-9-]*$/.test(prefix)) {
    return 'Use letters, numbers and hyphens only, for example N, C-, G-.'
  }
  return null
}

// Rows are read defensively: a missing, mistyped or invalid stored value falls back to the default.
export function settingsFromRows(
  rows: { key: string; value: unknown }[]
): AppSettings {
  const settings = { ...DEFAULT_APP_SETTINGS }
  for (const row of rows) {
    if (
      row.key === TAIL_NUMBER_PREFIX_KEY &&
      typeof row.value === 'string' &&
      validateTailPrefix(row.value) === null
    ) {
      settings.tailNumberPrefix = normalizeTailPrefix(row.value)
    }
    if (row.key === EQUIPMENT_TYPES_KEY) {
      settings.equipmentTypes =
        equipmentTypesFromValue(row.value) ?? settings.equipmentTypes
    }
  }
  return settings
}

/** True when the tail field holds nothing the user typed: blank, or just the pre-filled prefix. */
export function isBlankTail(tail: string | undefined, prefix: string): boolean {
  const value = (tail ?? '').trim().toUpperCase()
  return value === '' || value === normalizeTailPrefix(prefix)
}
