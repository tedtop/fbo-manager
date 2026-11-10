'use client'

import '@/components/fuel-farm/fuel-farm.css'
import { GravityQc } from '@/components/fuel-farm/gravity-qc'
import { JetATrend } from '@/components/fuel-farm/jet-a-trend'
import { TankCard } from '@/components/fuel-farm/tank-card'
import { TankFormDialog } from '@/components/fuel-farm/tank-form-dialog'
import { Button } from '@/components/ui/button'
import { useTanks } from '@/hooks/use-tanks'
import { useToast } from '@/hooks/use-toast'
import { ConcurrencyConflictError } from '@/lib/concurrency'
import { JET_A_TREND_TANKS, type FarmTank } from '@/lib/fuel-farm'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { createTankReading } from '@/repositories/tank-readings.repo'
import type { TankInsert, TankWithLatestReading } from '@/repositories/tanks.repo'
import { CircleHelp, Fuel, Plus, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

const TANK_ORDER = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'LF']
// Tanks outside the main containment area: their own group, each behind an amber divider.
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
  const { tanks, loading, error, createTank, updateTank, refetch } = useTanks()
  const { toast } = useToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTank, setEditingTank] = useState<TankWithLatestReading | null>(null)
  const [countdown, setCountdown] = useState(REFRESH_SECONDS)
  const [refreshing, setRefreshing] = useState(false)
  const refetchRef = useRef(refetch)
  refetchRef.current = refetch

  const showError = (title: string, description?: string) =>
    toast({ title, description, variant: 'destructive' })

  const refreshNow = async () => {
    setRefreshing(true)
    setCountdown(REFRESH_SECONDS)
    try {
      await refetchRef.current()
    } finally {
      setRefreshing(false)
    }
  }

  // 30s refresh countdown, like the Minuteman page. Paused while the tab is hidden;
  // refreshes immediately when it comes back.
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
      if (document.visibilityState !== 'visible') return
      setCountdown(REFRESH_SECONDS)
      void refetchRef.current()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const handleUpdateLevel = async (tankId: string, level: number) => {
    try {
      await createTankReading(createClient(), {
        tank_id: tankId,
        level,
        recorded_at: new Date().toISOString()
      })
      toast({ title: `${tankId} updated to ${level}"` })
      await refetch()
    } catch (err) {
      showError(`Couldn't update ${tankId}`, err instanceof Error ? err.message : undefined)
      throw err
    }
  }

  const handleCreateTank = async (data: TankInsert) => {
    try {
      await createTank(data)
      toast({ title: 'Tank created' })
    } catch (err) {
      showError("Couldn't create tank", err instanceof Error ? err.message : undefined)
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
      toast({ title: 'Tank updated' })
      setEditingTank(null)
    } catch (err) {
      // A concurrency conflict is handled by the form's edit-session dialog, not a toast.
      if (err instanceof ConcurrencyConflictError) throw err
      showError("Couldn't update tank", err instanceof Error ? err.message : undefined)
      throw err
    }
  }

  const sorted = sortTanks(tanks)
  const containment = sorted.filter((t) => !OUTSIDE_CONTAINMENT.has(t.tank_id))
  const outside = sorted.filter((t) => OUTSIDE_CONTAINMENT.has(t.tank_id))

  const mixedTanks = sorted.filter((t) => JET_A_TREND_TANKS.includes(t.tank_id))
  const farmTanks: FarmTank[] = mixedTanks.map((t) => ({
    tankId: t.tank_id,
    level: t.latest_reading ? Number(t.latest_reading.level) : 0,
    usableMax: Number(t.usable_max_inches),
    recordedLow: t.recorded_low != null ? Number(t.recorded_low) : null
  }))
  const farmCapacity = mixedTanks.reduce((sum, t) => sum + Number(t.capacity_gallons), 0)

  const busy = loading || refreshing
  const card = (tank: TankWithLatestReading) => (
    <TankCard
      key={tank.tank_id}
      tank={tank}
      outside={OUTSIDE_CONTAINMENT.has(tank.tank_id)}
      onUpdateLevel={handleUpdateLevel}
      onError={(message) => showError(message)}
      onEdit={handleEditTank}
    />
  )

  return (
    <div className="ff space-y-4" data-testid="fuel-farm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Fuel className="h-6 w-6 text-primary" />
            Fuel Farm
          </h1>
          <button
            type="button"
            onClick={refreshNow}
            title={error ? 'Retry now' : 'Refresh now'}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium tabular-nums transition-colors',
              error
                ? 'border-destructive/40 bg-destructive/10 text-destructive'
                : busy
                  ? 'border-warning/40 bg-warning/10 text-warning-foreground dark:text-warning'
                  : 'border-success/40 bg-success/10 text-success hover:bg-success/15'
            )}
          >
            <RefreshCw className={cn('h-3 w-3', busy && 'animate-spin')} />
            {error ? 'Database offline' : busy ? 'Refreshing...' : `Next refresh in ${countdown}s`}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/docs/fuel-farm">
              <CircleHelp className="mr-1.5 h-4 w-4" />
              Help
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/fuel-dispatch">Fuel Dispatch</Link>
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditingTank(null)
              setDialogOpen(true)
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            New Tank
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          Couldn&apos;t load the fuel farm. Readings shown may be out of date; the page keeps retrying.
        </div>
      )}

      {/* Jet A on hand + gravity QC */}
      <div className="grid gap-4 lg:grid-cols-3 2xl:grid-cols-4">
        <JetATrend tanks={farmTanks} className="lg:col-span-2 2xl:col-span-3" />
        <GravityQc farmCapacityGallons={farmCapacity} onError={(message) => showError(message)} />
      </div>

      {/* Tanks: containment T1-T6, then T7 and Life Flight outside containment */}
      {loading ? (
        <div className="flex h-96 items-center justify-center text-muted-foreground">Loading tanks...</div>
      ) : sorted.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
          No tanks yet. Use New Tank to add one.
        </div>
      ) : (
        <div className="ff-tanks">
          {containment.length > 0 && (
            <div className="ff-group ff-group-containment">{containment.map(card)}</div>
          )}
          {outside.length > 0 && (
            <div className="ff-group ff-group-outside">
              {outside.map((tank) => [<div key={`${tank.tank_id}-divider`} className="ff-divider" />, card(tank)])}
            </div>
          )}
        </div>
      )}

      <TankFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        tank={editingTank}
        onSubmit={editingTank ? handleUpdateTank : handleCreateTank}
      />
    </div>
  )
}
