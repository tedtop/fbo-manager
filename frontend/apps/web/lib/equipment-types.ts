import type { Database } from '@/types/database'
import {
  Car,
  CircleDot,
  CircleHelp,
  Droplet,
  Droplets,
  Fuel,
  Layers,
  type LucideIcon,
  Package,
  Wind,
  Wrench,
  Zap
} from 'lucide-react'

export type EquipmentType =
  Database['public']['Tables']['equipment']['Row']['equipment_type']

export interface EquipmentTypeDefinition {
  value: EquipmentType
  label: string
  icon: LucideIcon
}

export const EQUIPMENT_TYPES: EquipmentTypeDefinition[] = [
  { value: 'fuel_truck', label: 'Fuel Truck', icon: Fuel },
  { value: 'tug', label: 'Tug', icon: Wrench },
  { value: 'gpu', label: 'Ground Power Unit', icon: Zap },
  { value: 'air_start', label: 'Air Start Unit', icon: Wind },
  { value: 'belt_loader', label: 'Belt Loader', icon: Package },
  { value: 'stairs', label: 'Passenger Stairs', icon: Layers },
  { value: 'lavatory_service', label: 'Lavatory Service', icon: Droplet },
  { value: 'water_service', label: 'Water Service', icon: Droplets },
  { value: 'golf_cart', label: 'Golf Cart', icon: CircleDot },
  { value: 'staff_vehicle', label: 'Staff Vehicle', icon: Car },
  { value: 'other', label: 'Other', icon: CircleHelp }
]

const EQUIPMENT_TYPE_MAP = new Map(
  EQUIPMENT_TYPES.map((def) => [def.value, def])
)

export function getEquipmentTypeDefinition(
  type: EquipmentType
): EquipmentTypeDefinition {
  return (
    EQUIPMENT_TYPE_MAP.get(type) ?? EQUIPMENT_TYPES[EQUIPMENT_TYPES.length - 1]
  )
}
