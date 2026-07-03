'use client'

import { FuelOrderCard } from '@/components/fuel-dispatch/fuel-order-card'
import { FuelerAssignDialog } from '@/components/fuel-dispatch/fueler-assign-dialog'
import { TransactionFormDialog } from '@/components/fuel-dispatch/transaction-form-dialog'
import { DispatchCard } from '@/components/fuel-dispatch/dispatch-card'
import { ErrorMessage } from '@/messages/error-message'
import { Button } from '@/components/ui/button'
import { useQTDispatch } from '@/hooks/use-qt-dispatch'
import { useSession } from '@/hooks/use-session'
import { useTransactions } from '@/hooks/use-transactions'
import {
  assignFueler,
  removeFueler,
  updateProgress
} from '@/services/transactions.service'
import { createClient } from '@/lib/supabase/client'
import type { TransactionInsert, TransactionWithRelations } from '@/repositories/transactions.repo'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Fuel, RefreshCw } from 'lucide-react'
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
    error: qtError,
    lastUpdated,
    refreshCountdown,
    refetch: qtRefetch,
    changes: qtChanges
  } = useQTDispatch()

  const [filterMode, setFilterMode] = useState<FilterMode>('airlines')
  const [hideDeparted, setHideDeparted] = useState(true)
  const { transactions, loading: txLoading, createTransaction, updateTransaction, deleteTransaction, refetch: txRefetch } = useTransactions()

  const [formOpen, setFormOpen] = useState(false)
  const [editTx, setEditTx] = useState<TransactionWithRelations | null>(null)
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignTx, setAssignTx] = useState<TransactionWithRelations | null>(null)

  const filteredDispatches = hideDeparted
    ? dispatches.filter((d) => d.FlightStatus !== 'In Flight')
    : dispatches

  const fuelOrders = transactions.filter(
    (t) => t.source === 'manual' || t.source === 'flight_card'
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
    await deleteTransaction(id)
    toast({ title: 'Fuel order deleted' })
  }

  const handleProgress = async (id: number, progress: 'started' | 'in_progress' | 'completed') => {
    await updateProgress(db, id, progress)
    toast({ title: `Order ${progress === 'completed' ? 'completed' : progress === 'in_progress' ? 'started' : 'updated'}` })
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

  const hasNew = qtChanges && qtChanges.length > 0

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-foreground">Fuel Dispatch</h1>

          {/* Filter radio */}
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
            <button
              onClick={() => setFilterMode('airlines')}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                filterMode === 'airlines'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Airlines
            </button>
            <button
              onClick={() => setFilterMode('all')}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                filterMode === 'all'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              All
            </button>
          </div>

          {/* Hide departed toggle */}
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <span>Hide departed</span>
            <div className="relative inline-block w-9 h-5">
              <input
                type="checkbox"
                checked={hideDeparted}
                onChange={(e) => setHideDeparted(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-primary transition-colors cursor-pointer" />
              <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-background rounded-full transition-transform peer-checked:translate-x-4 shadow-sm" />
            </div>
          </label>
        </div>

        <div className="flex items-center gap-2">
          {/* QT refresh */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {qtLoading ? (
              <div className="flex items-center gap-1">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Loading...
              </div>
            ) : (
              <>
                {lastUpdated && (
                  <span>Updated {new Date(lastUpdated).toLocaleTimeString()}</span>
                )}
                <span className={cn(
                  'px-1.5 py-0.5 rounded text-[10px] font-medium',
                  refreshCountdown <= 5 ? 'bg-yellow-500/10 text-yellow-500' : 'bg-muted text-muted-foreground'
                )}>
                  {refreshCountdown}s
                </span>
              </>
            )}
            {hasNew && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-500/10 text-green-500 animate-pulse">
                New
              </span>
            )}
          </div>

          {filterMode === 'all' && (
            <Button size="sm" onClick={openCreate}>
              <Fuel className="w-3.5 h-3.5 mr-1.5" />
              New Fuel Order
            </Button>
          )}
        </div>
      </div>

      {/* Error */}
      {qtError && <ErrorMessage>{qtError}</ErrorMessage>}

      {/* Cards Grid */}
      {filterMode === 'airlines' ? (
        qtLoading && dispatches.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-lg text-muted-foreground">Loading dispatches...</div>
          </div>
        ) : filteredDispatches.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {dispatches.length > 0
              ? 'No upcoming flights (all flights have departed)'
              : 'No dispatches available'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredDispatches.map((dispatch) => (
              <DispatchCard key={dispatch.DispatchID ?? `${dispatch.FlightNumber}-${dispatch.TailNumber}`} dispatch={dispatch} />
            ))}
          </div>
        )
      ) : (
        /* "All" mode: QT cards + fuel order cards */
        <div className="space-y-6">
          {/* QT Dispatches Section */}
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
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredDispatches.map((dispatch) => (
              <DispatchCard key={dispatch.DispatchID ?? `${dispatch.FlightNumber}-${dispatch.TailNumber}`} dispatch={dispatch} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Fuel Orders Section */}
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
              Fuel Orders ({fuelOrders.length})
            </h2>
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
                    onUpdateProgress={handleProgress}
                  />
                ))}
              </div>
            )}
          </div>
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
