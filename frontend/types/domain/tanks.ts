import type { TankWithLatestReading } from '@/repositories/tanks.repo'

export type TankStatus = 'critical' | 'warning' | 'good' | 'unknown'

export interface TankDomain {
  tankId: string
  tankName: string
  fuelType: 'jet_a' | 'avgas'
  capacityGallons: number
  usableMinInches: number
  usableMaxInches: number
  latestReading: { level: number; recordedAt: string } | null
  levelPercentage: number | null
  status: TankStatus
}

function computeLevelPercentage(
  level: number,
  usableMin: number,
  usableMax: number
): number {
  const range = usableMax - usableMin
  if (range <= 0) return 0
  const pct = ((level - usableMin) / range) * 100
  return Math.max(0, Math.min(100, pct))
}

function computeStatus(pct: number | null): TankStatus {
  if (pct === null) return 'unknown'
  if (pct <= 10) return 'critical'
  if (pct <= 25) return 'warning'
  return 'good'
}

export function toTankDomain(row: TankWithLatestReading): TankDomain {
  const usableMin = Number(row.usable_min_inches)
  const usableMax = Number(row.usable_max_inches)
  const level = row.latest_reading ? Number(row.latest_reading.level) : null

  const levelPercentage =
    level !== null ? computeLevelPercentage(level, usableMin, usableMax) : null

  return {
    tankId: row.tank_id,
    tankName: row.tank_name,
    fuelType: row.fuel_type,
    capacityGallons: Number(row.capacity_gallons),
    usableMinInches: usableMin,
    usableMaxInches: usableMax,
    latestReading: row.latest_reading
      ? {
          level: Number(row.latest_reading.level),
          recordedAt: row.latest_reading.recorded_at
        }
      : null,
    levelPercentage,
    status: computeStatus(levelPercentage)
  }
}
