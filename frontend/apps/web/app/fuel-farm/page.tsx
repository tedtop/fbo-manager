'use client'

import { TankFormDialog } from '@/components/fuel-farm/tank-form-dialog'
import { TankVisualCard } from '@/components/fuel-farm/tank-visual-card'
import { useTheme } from '@/components/navigation-wrapper'
import { useTanks } from '@/hooks/use-tanks'
import type { TankInsert, TankWithLatestReading } from '@/repositories/tanks.repo'
import { createTankReading } from '@/repositories/tank-readings.repo'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@frontend/ui/components/ui/badge'
import { Button } from '@frontend/ui/components/ui/button'
import { Card } from '@frontend/ui/components/ui/card'
import { ErrorMessage } from '@frontend/ui/messages/error-message'
import { SuccessMessage } from '@frontend/ui/messages/success-message'
import { useState } from 'react'

export default function FuelFarmPage() {
  const { theme } = useTheme()
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

  const sortedTanks = [...tanks].sort((a, b) => {
    const aNum = Number.parseInt(a.tank_id.replace('T', ''))
    const bNum = Number.parseInt(b.tank_id.replace('T', ''))
    return aNum - bNum
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">⛽ Fuel Farm Levels</h1>
          <p className="mt-2 text-sm text-muted-foreground">Real-time tank level monitoring</p>
        </div>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => { setEditingTank(null); setDialogOpen(true) }}>
          New Tank
        </Button>
      </div>

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

      <div className="relative">
        <div className="flex gap-5 overflow-x-auto pb-4 px-2 scroll-smooth snap-x snap-proximity">
          {sortedTanks.map((tank, index) => (
            <div key={tank.tank_id} className="flex gap-5 items-center snap-start">
              {tank.tank_id === 'T7' && index > 0 && (
                <div className="flex-shrink-0 w-1 h-48 bg-gradient-to-b from-transparent via-yellow-400 to-transparent rounded" />
              )}
              <div className="flex-shrink-0 w-44">
                <TankVisualCard tank={tank} onUpdateLevel={handleUpdateLevel} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {tanks.length === 0 && !error && (
        <Card className="p-8 text-center bg-card border-border">
          <div className="text-muted-foreground">No tanks found. Create a tank to get started.</div>
        </Card>
      )}
    </div>
  )
}
