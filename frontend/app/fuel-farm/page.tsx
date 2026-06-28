'use client'

import { TankFormDialog } from '@/components/fuel-farm/tank-form-dialog'
import { TankVisualCard, HorizontalTankCard } from '@/components/fuel-farm/tank-visual-card'
import { JetATrend } from '@/components/fuel-farm/jet-a-trend'
import { useTanks } from '@/hooks/use-tanks'
import type { TankInsert, TankWithLatestReading } from '@/repositories/tanks.repo'
import { createTankReading } from '@/repositories/tank-readings.repo'
import { inchesToGallons } from '@/lib/gallons-tables'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ErrorMessage } from '@/messages/error-message'
import { SuccessMessage } from '@/messages/success-message'
import { Fuel } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

const TANK_ORDER = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'LF']
const SPECIAL_TANKS = new Set(['T7', 'LF'])

function sortTanks(tanks: TankWithLatestReading[]) {
  return [...tanks].sort((a, b) => {
    const ai = TANK_ORDER.indexOf(a.tank_id)
    const bi = TANK_ORDER.indexOf(b.tank_id)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return a.tank_id.localeCompare(b.tank_id)
  })
}

export default function FuelFarmPage() {
  const { tanks, loading, error, createTank, updateTank, deleteTank, refetch } = useTanks()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTank, setEditingTank] = useState<TankWithLatestReading | null>(null)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg)
    setTimeout(() => setSuccessMessage(''), 3000)
  }
  const showError = (msg: string) => {
    setErrorMessage(msg)
    setTimeout(() => setErrorMessage(''), 3000)
  }

  const handleUpdateLevel = async (tankId: string, level: number) => {
    try {
      const db = createClient()
      await createTankReading(db, {
        tank_id: tankId,
        level,
        recorded_at: new Date().toISOString()
      })
      showSuccess(`${tankId} updated to ${level.toFixed(1)}"`)
      await refetch()
    } catch (err) {
      showError(`Failed to update ${tankId}`)
      throw err
    }
  }

  const handleCreateTank = async (data: TankInsert) => {
    try {
      await createTank(data)
      showSuccess('Tank created successfully')
    } catch (err) {
      showError('Failed to create tank')
      throw err
    }
  }

  const handleEditTank = (tank: TankWithLatestReading) => {
    setEditingTank(tank)
    setDialogOpen(true)
  }

  const handleUpdateTank = async (data: TankInsert) => {
    if (!editingTank) return
    try {
      await updateTank(editingTank.tank_id, {
        tank_name: data.tank_name as string,
        fuel_type: data.fuel_type as 'jet_a' | 'avgas',
        capacity_gallons: data.capacity_gallons,
        min_level_inches: data.min_level_inches,
        max_level_inches: data.max_level_inches,
        usable_min_inches: data.usable_min_inches,
        usable_max_inches: data.usable_max_inches
      })
      showSuccess('Tank updated successfully')
      setEditingTank(null)
    } catch (err) {
      showError('Failed to update tank')
      throw err
    }
  }

  const handleDeleteTank = async (tankId: string) => {
    if (!confirm('Are you sure you want to delete this tank?')) return
    try {
      await deleteTank(tankId)
      showSuccess('Tank deleted successfully')
    } catch (err) {
      showError('Failed to delete tank')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg text-muted-foreground">Loading fuel farm...</div>
      </div>
    )
  }

  const sorted = sortTanks(tanks)
  const standardTanks = sorted.filter((t) => !SPECIAL_TANKS.has(t.tank_id))
  const specialTanks = sorted.filter((t) => SPECIAL_TANKS.has(t.tank_id))

  const totalJetAGallons = tanks
    .filter((t) => t.fuel_type === 'jet_a' && t.tank_id !== 'LF')
    .reduce((sum, tank) => {
      const level = tank.latest_reading ? Number.parseFloat(tank.latest_reading.level) : 0
      return sum + inchesToGallons(tank.tank_id, level)
    }, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Fuel className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold text-foreground">Fuel Farm Levels</h1>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">Real-time tank level monitoring</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/fuel-dispatch">Fuel Dispatch</Link>
          </Button>
          <Button onClick={() => { setEditingTank(null); setDialogOpen(true) }}>
            New Tank
          </Button>
        </div>
      </div>

      {totalJetAGallons > 0 && (
        <Card className="bg-card border-border px-5 py-3">
          <div className="flex items-center gap-4">
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Total Jet A (T2–T7)</div>
              <div className="text-2xl font-bold text-cyan-400">
                {totalJetAGallons.toLocaleString()} gal
              </div>
            </div>
            <Badge className="bg-cyan-100 text-cyan-800 border-cyan-300">Jet A</Badge>
          </div>
        </Card>
      )}

      {successMessage && <SuccessMessage>{successMessage}</SuccessMessage>}
      {errorMessage && <ErrorMessage>{errorMessage}</ErrorMessage>}
      {error && (
        <Card className="bg-destructive/10 border-destructive/20 p-4">
          <p className="text-sm text-destructive">Failed to load fuel tank data</p>
        </Card>
      )}

      <TankFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        tank={editingTank}
        onSubmit={editingTank ? handleUpdateTank : handleCreateTank}
      />

      {/* Main containment tanks — grid fits without horizontal scroll */}
      {standardTanks.length > 0 && (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {standardTanks.map((tank) => (
            <TankVisualCard key={tank.tank_id} tank={tank} onUpdateLevel={handleUpdateLevel} />
          ))}
        </div>
      )}

      {/* Outside-containment tanks — horizontal cylinder layout */}
      {specialTanks.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-warning/60 to-transparent" />
            <span className="text-xs text-muted-foreground uppercase tracking-widest px-2">
              Outside Containment
            </span>
            <div className="h-px flex-1 bg-gradient-to-l from-transparent via-warning/60 to-transparent" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {specialTanks.map((tank) => (
              <HorizontalTankCard key={tank.tank_id} tank={tank} onUpdateLevel={handleUpdateLevel} />
            ))}
          </div>
        </div>
      )}

      {tanks.length === 0 && !error && (
        <Card className="p-8 text-center bg-card border-border">
          <div className="text-muted-foreground">No tanks found. Create a tank to get started.</div>
        </Card>
      )}

      <JetATrend />
    </div>
  )
}
