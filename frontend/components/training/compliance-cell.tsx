'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type CellStatus = 'valid' | 'expiring' | 'expired' | 'missing'

export interface ComplianceCellData {
  fuelerId: number
  fuelerName: string
  trainingId: number
  trainingName: string
  validityDays: number
  expiryDate: string | null
  completedDate: string | null
}

interface ComplianceCellProps {
  data: ComplianceCellData
  onMarkComplete: (input: {
    fuelerId: number
    trainingId: number
    completedDate: string
    expiryDate: string
    certifiedById: null
  }) => Promise<void>
}

function getStatus(expiryDate: string | null): CellStatus {
  if (!expiryDate) return 'missing'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiry = new Date(expiryDate + 'T00:00:00')
  if (expiry < today) return 'expired'
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() + 30)
  return expiry <= cutoff ? 'expiring' : 'valid'
}

const STATUS_CONFIG: Record<
  CellStatus,
  { icon: string; cellClass: string; label: string }
> = {
  valid: {
    icon: '✅',
    cellClass: 'bg-success/10 hover:bg-success/20 text-success',
    label: 'Valid'
  },
  expiring: {
    icon: '⚠️',
    cellClass: 'bg-warning/10 hover:bg-warning/20 text-warning',
    label: 'Expiring soon'
  },
  expired: {
    icon: '❌',
    cellClass: 'bg-destructive/10 hover:bg-destructive/20 text-destructive',
    label: 'Expired'
  },
  missing: {
    icon: '❌',
    cellClass: 'bg-muted/30 hover:bg-destructive/10 text-muted-foreground',
    label: 'Not certified'
  }
}

export function ComplianceCell({ data, onMarkComplete }: ComplianceCellProps) {
  const [open, setOpen] = useState(false)
  const [completedDate, setCompletedDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const status = getStatus(data.expiryDate)
  const { icon, cellClass, label } = STATUS_CONFIG[status]

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const expiryPreview = useMemo(() => {
    if (!completedDate) return ''
    const base = new Date(completedDate + 'T00:00:00')
    base.setDate(base.getDate() + data.validityDays)
    return base.toISOString().slice(0, 10)
  }, [completedDate, data.validityDays])

  const openDialog = () => {
    setCompletedDate(today)
    setError(null)
    setOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!completedDate || !expiryPreview) return
    setLoading(true)
    setError(null)
    try {
      await onMarkComplete({
        fuelerId: data.fuelerId,
        trainingId: data.trainingId,
        completedDate,
        expiryDate: expiryPreview,
        certifiedById: null
      })
      setOpen(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setLoading(false)
    }
  }

  const tooltip = `${data.fuelerName} — ${data.trainingName}: ${label}${data.expiryDate ? ` (expires ${data.expiryDate})` : ''}`

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        title={tooltip}
        className={`w-full h-full flex items-center justify-center text-sm rounded transition-colors ${cellClass}`}
      >
        {icon}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark Complete</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{data.fuelerName}</span>
            {' — '}
            {data.trainingName}
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cc-date">Completed Date *</Label>
              <Input
                id="cc-date"
                type="date"
                value={completedDate}
                onChange={(e) => setCompletedDate(e.target.value)}
                required
              />
            </div>
            {expiryPreview && (
              <p className="text-sm text-muted-foreground">
                Expires:{' '}
                <span className="font-medium text-foreground">{expiryPreview}</span>
                <span className="text-xs ml-1">({data.validityDays}d validity)</span>
              </p>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading || !completedDate}>
                {loading ? 'Saving...' : 'Mark Complete'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
