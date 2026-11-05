'use client'

import '@/components/fuel-farm/fuel-farm.css'
import { GravityPanel } from '@/components/fuel-farm/gravity-panel'
import { JetATrend } from '@/components/fuel-farm/jet-a-trend'
import { TankCard } from '@/components/fuel-farm/tank-card'
import { TankFormDialog } from '@/components/fuel-farm/tank-form-dialog'
import { useTanks } from '@/hooks/use-tanks'
import { ConcurrencyConflictError } from '@/lib/concurrency'
import { JET_A_TREND_TANKS, type FarmTank } from '@/lib/fuel-farm'
import { createClient } from '@/lib/supabase/client'
import { createTankReading } from '@/repositories/tank-readings.repo'
import type { TankInsert, TankWithLatestReading } from '@/repositories/tanks.repo'
import Link from 'next/link'
import { Fragment, useEffect, useRef, useState } from 'react'

const TANK_ORDER = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'LF']
// Tanks outside the main containment area get a divider before them.
const OUTSIDE_CONTAINMENT = new Set(['T7', 'LF'])
const REFRESH_SECONDS = 30

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
  const [countdown, setCountdown] = useState(REFRESH_SECONDS)
  const [refreshing, setRefreshing] = useState(false)
  const refetchRef = useRef(refetch)
  refetchRef.current = refetch

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg)
    setTimeout(() => setSuccessMessage(''), 3000)
  }
  const showError = (msg: string) => {
    setErrorMessage(msg)
    setTimeout(() => setErrorMessage(''), 5000)
  }

  const refreshNow = async () => {
    setRefreshing(true)
    setCountdown(REFRESH_SECONDS)
    try {
      await refetchRef.current()
    } finally {
      setRefreshing(false)
    }
  }

  // 30s refresh countdown, like the Minuteman page. Pauses while a tab is hidden.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      setCountdown((c) => {
        if (c <= 1) {
          void refetchRef.current()
          return REFRESH_SECONDS
        }
        return c - 1
      })
    }, 1000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshNow()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

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

  const handleUpdateTank = async (data: TankInsert, expectedUpdatedAt?: string) => {
    if (!editingTank) return
    try {
      await updateTank(
        editingTank.tank_id,
        {
          tank_name: data.tank_name as string,
          fuel_type: data.fuel_type as 'jet_a' | 'avgas',
          capacity_gallons: data.capacity_gallons,
          min_level_inches: data.min_level_inches,
          max_level_inches: data.max_level_inches,
          usable_min_inches: data.usable_min_inches,
          usable_max_inches: data.usable_max_inches
        },
        expectedUpdatedAt
      )
      showSuccess('Tank updated successfully')
      setEditingTank(null)
    } catch (err) {
      // A concurrency conflict is handled by the form's edit-session dialog, not a toast.
      if (err instanceof ConcurrencyConflictError) throw err
      showError('Failed to update tank')
      throw err
    }
  }

  const sorted = sortTanks(tanks)

  const farmTanks: FarmTank[] = sorted
    .filter((t) => JET_A_TREND_TANKS.includes(t.tank_id))
    .map((t) => ({
      tankId: t.tank_id,
      level: t.latest_reading ? Number(t.latest_reading.level) : 0,
      usableMax: Number(t.usable_max_inches),
      recordedLow: t.recorded_low != null ? Number(t.recorded_low) : null
    }))
  const farmCapacity = sorted
    .filter((t) => JET_A_TREND_TANKS.includes(t.tank_id))
    .reduce((sum, t) => sum + Number(t.capacity_gallons), 0)

  let status: { cls: string; text: string; title?: string }
  if (loading || refreshing) status = { cls: 'connecting', text: '🟡 Loading...' }
  else if (error) status = { cls: 'disconnected', text: '🔴 Database Offline', title: 'Click to retry connection' }
  else status = { cls: 'connected', text: `🟢 Next refresh in ${countdown}s`, title: 'Click to refresh now' }

  return (
    <>
      <div className="ff" data-testid="fuel-farm">
        <div className="header">
          <div className="header-left">
            <JetATrend tanks={farmTanks} />
          </div>
          <div className="header-main">
            <h1>⛽ Fuel Farm Levels</h1>
            <button
              type="button"
              className={`status ${status.cls}`}
              title={status.title}
              onClick={refreshNow}
              style={{ cursor: status.cls === 'connecting' ? 'default' : 'pointer', fontFamily: 'inherit' }}
            >
              {status.text}
            </button>
            <div className="nav-buttons">
              <Link href="/fuel-dispatch">✈️ Fuel Dispatch</Link>
              <button
                type="button"
                onClick={() => {
                  setEditingTank(null)
                  setDialogOpen(true)
                }}
              >
                ➕ New Tank
              </button>
            </div>
          </div>
        </div>

        {errorMessage && <div className="error">{errorMessage}</div>}
        {successMessage && <div className="success">{successMessage}</div>}
        {error && <div className="error">Failed to load fuel tank data</div>}

        <div className="tanks-container">
          {sorted.map((tank) => (
            <Fragment key={tank.tank_id}>
              {OUTSIDE_CONTAINMENT.has(tank.tank_id) && <div className="containment-divider" />}
              <TankCard
                tank={tank}
                onUpdateLevel={handleUpdateLevel}
                onError={showError}
                onEdit={handleEditTank}
              />
            </Fragment>
          ))}
        </div>

        {!loading && sorted.length === 0 && !error && (
          <div className="empty-farm">No tanks found. Create a tank to get started.</div>
        )}
      </div>

      <GravityPanel farmCapacityGallons={farmCapacity} onError={showError} />

      <TankFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        tank={editingTank}
        onSubmit={editingTank ? handleUpdateTank : handleCreateTank}
      />
    </>
  )
}
