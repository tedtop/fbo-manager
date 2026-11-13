'use client'

import '@/components/fuel-dispatch/fuel-dispatch.css'
import { DensityBox } from '@/components/fuel-dispatch/density-box'
import { WeatherWidget } from '@/components/fuel-dispatch/weather-widget'
import { useWeather } from '@/hooks/use-weather'
import { changeKey, normalizeTail } from '@/lib/dispatch-display'
import Link from 'next/link'
import { FuelOrderCard } from '@/components/fuel-dispatch/fuel-order-card'
import { FuelerAssignDialog } from '@/components/fuel-dispatch/fueler-assign-dialog'
import { TransactionFormDialog } from '@/components/fuel-dispatch/transaction-form-dialog'
import { DispatchCard } from '@/components/fuel-dispatch/dispatch-card'
import { ErrorMessage } from '@/messages/error-message'
import { Button } from '@/components/ui/button'
import { useQTDispatch } from '@/hooks/use-qt-dispatch'
import { useSession } from '@/hooks/use-session'
import { useTransactions } from '@/hooks/use-transactions'
import { assignFueler, removeFueler } from '@/services/transactions.service'
import { fillFuelOrder, startFuelOrder } from '@/services/fuel-orders.service'
import { createClient } from '@/lib/supabase/client'
import type { TransactionInsert, TransactionWithRelations } from '@/repositories/transactions.repo'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Fuel } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

type FilterMode = 'airlines' | 'all'

export default function FuelDispatchMonitorPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { toast } = useToast()
  const db = createClient()
  const {
    dispatches,
    loading: qtLoading,
    refreshing,
    error: qtError,
    errorStage,
    lastUpdated,
    refreshCountdown,
    refetch: qtRefetch,
    changes: qtChanges,
    flightTrack,
    now
  } = useQTDispatch()
  const weather = useWeather()
  const [helpOpen, setHelpOpen] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const [filterMode, setFilterMode] = useState<FilterMode>('airlines')
  const [hideDeparted, setHideDeparted] = useState(true)
  const { transactions, loading: txLoading, createTransaction, updateTransaction, deleteTransaction, refetch: txRefetch } = useTransactions()

  const [formOpen, setFormOpen] = useState(false)
  const [editTx, setEditTx] = useState<TransactionWithRelations | null>(null)
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignTx, setAssignTx] = useState<TransactionWithRelations | null>(null)

  // Minuteman keeps QT's own order and only drops flights that have left (status "In Flight").
  const filteredDispatches = hideDeparted
    ? dispatches.filter((d) => d.FlightStatus !== 'In Flight')
    : dispatches

  const fuelOrders = transactions.filter(
    (t) => t.source !== 'qt'
  )

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    }
  }, [status, router])

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (status === 'unauthenticated') return null

  const handleCreate = async (data: TransactionInsert) => {
    await createTransaction(data)
    toast({ title: 'Fuel order created' })
  }

  const handleUpdate = async (data: TransactionInsert) => {
    if (!editTx) return
    await updateTransaction(editTx.id, data)
    toast({ title: 'Fuel order updated' })
    setEditTx(null)
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteTransaction(id)
      toast({ title: 'Fuel order deleted' })
    } catch (err) {
      toast({
        title: 'Could not delete fuel order',
        description:
          err instanceof Error ? err.message : 'An unexpected error occurred',
        variant: 'destructive'
      })
    }
  }

  const handleStatus = async (tx: TransactionWithRelations, action: 'start' | 'fill') => {
    try {
      if (action === 'start') {
        await startFuelOrder(db, tx.id)
        toast({ title: 'Order started' })
      } else {
        const gallons = Number(tx.gallons_delivered ?? tx.quantity_gallons ?? tx.gallons_requested)
        await fillFuelOrder(db, tx.id, { gallonsDelivered: gallons })
        toast({ title: 'Order filled' })
      }
      await txRefetch()
    } catch (err) {
      toast({
        title: action === 'start' ? 'Could not start order' : 'Could not fill order',
        description: err instanceof Error ? err.message : 'An unexpected error occurred',
        variant: 'destructive'
      })
    }
  }

  const handleAssign = async (fuelerId: number) => {
    if (!assignTx) return
    await assignFueler(db, assignTx.id, fuelerId)
  }

  const handleRemoveAssign = async (fuelerId: number) => {
    if (!assignTx) return
    await removeFueler(db, assignTx.id, fuelerId)
  }

  const openCreate = () => {
    setEditTx(null)
    setFormOpen(true)
  }

  const openEdit = (tx: TransactionWithRelations) => {
    setEditTx(tx)
    setFormOpen(true)
  }

  const openAssign = (tx: TransactionWithRelations) => {
    setAssignTx(tx)
    setAssignOpen(true)
  }

  const renderCard = (dispatch: (typeof dispatches)[number]) => {
    const key = changeKey(dispatch)
    return (
      <DispatchCard
        key={dispatch.TransactionID ?? `${dispatch.FlightNumber}-${dispatch.TailNumber}`}
        dispatch={dispatch}
        track={flightTrack.get(normalizeTail(dispatch.TailNumber))}
        changes={key ? qtChanges.get(key) : undefined}
        now={now}
      />
    )
  }

  // Status pill, as Minuteman's: green countdown, yellow while loading/refreshing, red while failing.
  const pill = qtError
    ? { kind: 'disconnected', text: `🔴 Dispatch error - retrying in ${refreshCountdown}s`, clickable: false }
    : refreshing
      ? { kind: 'connecting', text: '🟡 Refreshing...', clickable: false }
      : qtLoading && !lastUpdated
        ? { kind: 'connecting', text: '🟡 Connecting...', clickable: false }
        : { kind: 'connected', text: `🟢 Next refresh in ${refreshCountdown}s`, clickable: true }

  const banner = qtError ? (
    errorStage ? (
      <ErrorMessage>
        QT login is being rejected – QT may have forced a password reset. Check/reset at{' '}
        <a className="underline" href="https://go.qttechnologies.com" target="_blank" rel="noopener noreferrer">
          https://go.qttechnologies.com
        </a>
        , then update QT_PASSWORD in Railway.
      </ErrorMessage>
    ) : (
      <ErrorMessage>{qtError}</ErrorMessage>
    )
  ) : localError ? (
    <ErrorMessage>{localError}</ErrorMessage>
  ) : null

  const emptyText = (
    <div className="text-center py-10 text-muted-foreground">
      {dispatches.length > 0 && hideDeparted
        ? 'No upcoming flights (all flights have departed)'
        : 'No dispatches available'}
    </div>
  )

  return (
    <div className="fd space-y-5">
      {/* Header: title, status pill and nav centred; KMSO weather card on the right (desktop) */}
      <div className="fd-header">
        <div className="fd-header-left" />
        <div>
          <h1>✈️ Fuel Dispatch Monitor</h1>
          <div
            className={cn('fd-status', pill.kind, pill.clickable && 'clickable')}
            data-testid="dispatch-status"
            title={pill.clickable ? 'Click to refresh now' : undefined}
            onClick={pill.clickable ? () => void qtRefetch() : undefined}
          >
            {pill.text}
          </div>
          <div className="fd-nav">
            <Link href="/fuel-farm">⛽ Fuel Farm</Link>
            <Link href="/docs/fuel-dispatch">❓ Help</Link>
          </div>
        </div>
        <WeatherWidget weather={weather} />
      </div>

      {banner}

      {/* Cards */}
      {filterMode === 'airlines' ? (
        qtLoading && dispatches.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-lg text-muted-foreground">Loading dispatches...</div>
          </div>
        ) : filteredDispatches.length === 0 ? (
          emptyText
        ) : (
          <div className="fd-grid">{filteredDispatches.map(renderCard)}</div>
        )
      ) : (
        /* "All" mode: QT cards + fuel order cards */
        <div className="space-y-6">
          {dispatches.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
                Airline Dispatches ({filteredDispatches.length})
              </h2>
              {filteredDispatches.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground border border-dashed border-border rounded-lg">
                  All flights have departed
                </div>
              ) : (
                <div className="fd-grid">{filteredDispatches.map(renderCard)}</div>
              )}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Fuel Orders ({fuelOrders.length})
              </h2>
              <Button size="sm" onClick={openCreate}>
                <Fuel className="w-3.5 h-3.5 mr-1.5" />
                New Fuel Order
              </Button>
            </div>
            {txLoading ? (
              <div className="text-sm text-muted-foreground">Loading orders...</div>
            ) : fuelOrders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border border-dashed border-border rounded-lg">
                No fuel orders yet. Click &ldquo;New Fuel Order&rdquo; to create one.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {fuelOrders.map((tx) => (
                  <FuelOrderCard
                    key={tx.id}
                    transaction={tx}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                    onAssignFuelers={openAssign}
                    onUpdateStatus={handleStatus}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <DensityBox weather={weather.current} onError={setLocalError} />

      {/* Filters: Minuteman's "Hide departed flights" switch, plus this app's Airlines / All view */}
      <div className="fd-box fd-filter" data-testid="dispatch-filters">
        <label className="fd-filter-label" htmlFor="hideDepartedToggle">
          Hide departed flights
        </label>
        <label className="fd-toggle">
          <input
            type="checkbox"
            id="hideDepartedToggle"
            checked={hideDeparted}
            onChange={(e) => setHideDeparted(e.target.checked)}
          />
          <span className="fd-toggle-slider" />
        </label>
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 ml-4">
          {(['airlines', 'all'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setFilterMode(mode)}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                filterMode === mode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {mode === 'airlines' ? 'Airlines' : 'All'}
            </button>
          ))}
        </div>
      </div>

      <div className="fd-last-updated">{lastUpdated ? `Last updated: ${lastUpdated.toLocaleTimeString()}` : ''}</div>

      {/* Troubleshooting help */}
      <button type="button" className="fd-fab help" onClick={() => setHelpOpen(!helpOpen)} aria-label="Troubleshooting">
        ?
      </button>
      {helpOpen && (
        <div className="fd-panel" data-testid="help-panel">
          <h4>Troubleshooting</h4>
          <p>
            If dispatch data stops loading: call QT Technologies Client Support at <a href="tel:8667883241">866-788-3241</a>{' '}
            or email <a href="mailto:QTHelpDesk@QTTechnologies.com">QTHelpDesk@QTTechnologies.com</a>, identify as Ted, and
            ask for a password reset and/or unlock on the TTMSO account. This re-enables the existing Company Location ID /
            User ID UUIDs without needing to change them.
          </p>
          <p>
            If the Company Location ID or User ID ever need to change: these are Railway environment variables
            (<code>QT_COMPANY_LOCATION_ID</code>, <code>QT_USER_ID</code>, and <code>QT_PASSWORD</code> for the login) and
            need a redeploy. This cannot be done from within this app.
          </p>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <TransactionFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setEditTx(null)
        }}
        transaction={editTx}
        onSubmit={editTx ? handleUpdate : handleCreate}
      />

      {/* Assign Fueler Dialog */}
      {assignTx && (
        <FuelerAssignDialog
          open={assignOpen}
          onOpenChange={setAssignOpen}
          assignedFuelerIds={assignTx.fueler_assignments.map((a) => a.fueler_id)}
          onAssign={handleAssign}
          onRemove={handleRemoveAssign}
        />
      )}
    </div>
  )
}
