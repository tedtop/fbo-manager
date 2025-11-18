'use client'

import type { Fueler, FuelerTrainingRequest } from '@frontend/types/api'
import { Button } from '@frontend/ui/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle
} from '@frontend/ui/components/ui/dialog'
import { Input } from '@frontend/ui/components/ui/input'
import { Label } from '@frontend/ui/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@frontend/ui/components/ui/select'
import { useSession } from 'next-auth/react'
import { useEffect, useMemo, useState } from 'react'
import { SuccessMessage } from '@frontend/ui/messages/success-message'
import { ErrorMessage } from '@frontend/ui/messages/error-message'
import { getApiClient } from '@/lib/api'
import type { Training } from '@frontend/types/api'

interface AssignTrainingDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    training: Training | null
    onAssigned?: () => void
}

export function AssignTrainingDialog({
    open,
    onOpenChange,
    training,
    onAssigned
}: AssignTrainingDialogProps) {
    const { data: session } = useSession()
    const [fuelers, setFuelers] = useState<Fueler[]>([])
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
    const [completedDate, setCompletedDate] = useState(today)
    const [fuelerId, setFuelerId] = useState<number>(0)
    const [notes, setNotes] = useState('')

    // Compute expiry client-side (mirrors server logic) so we can preview
    const expiryDate = useMemo(() => {
        if (!training) return ''
        const validity = training.validity_period_days || 0
        const base = new Date(completedDate + 'T00:00:00')
        base.setDate(base.getDate() + validity)
        return base.toISOString().slice(0, 10)
    }, [training, completedDate])

    useEffect(() => {
        if (open && session) {
            fetchFuelers()
            setCompletedDate(today)
            setFuelerId(0)
            setNotes('')
        }
    }, [open, session, today])

    const fetchFuelers = async () => {
        try {
            const client = await getApiClient(session)
            const res = await client.fuelers.fuelersList()
            setFuelers(res.results || [])
        } catch (e) {
            console.error('Failed to load fuelers', e)
        }
    }

    const submit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!training || !fuelerId) return
        setLoading(true)
        try {
            setError(null)
            setSuccess(null)
            const client = await getApiClient(session)
            const body: FuelerTrainingRequest & { notes?: string } = {
                fueler: fuelerId,
                training: training.id!,
                completed_date: completedDate,
                expiry_date: expiryDate,
                certified_by: null,
                ...(notes ? { notes } : {})
            }
            // Use the complete action endpoint (auto-upsert + history)
            await client.fuelerCertifications.fuelerCertificationsCompleteCreate(body)
            onOpenChange(false)
            onAssigned?.()
            setSuccess('Training assigned successfully')
        } catch (err) {
            console.error('Assignment failed', err)
            setError('Failed to assign training')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Assign Training: {training?.training_name}</DialogTitle>
                </DialogHeader>
                {!training ? (
                    <div className="text-sm text-muted-foreground">Select a training first.</div>
                ) : (
                    <form onSubmit={submit} className="space-y-4">
                        <div className="space-y-2">
                            <Label>Fueler *</Label>
                            <Select
                                value={fuelerId.toString()}
                                onValueChange={(v) => setFuelerId(Number.parseInt(v))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select fueler" />
                                </SelectTrigger>
                                <SelectContent>
                                    {fuelers.map((f) => (
                                        <SelectItem key={f.id} value={f.id!.toString()}>
                                            {f.fueler_name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Completed Date *</Label>
                                <Input
                                    type="date"
                                    value={completedDate}
                                    onChange={(e) => setCompletedDate(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Computed Expiry</Label>
                                <Input type="date" value={expiryDate} readOnly disabled />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Notes (optional)</Label>
                            <Input
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Additional context"
                            />
                        </div>
                        {success && <SuccessMessage>{success}</SuccessMessage>}
                        {error && <ErrorMessage>{error}</ErrorMessage>}
                        <div className="flex justify-end gap-2 pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                                disabled={loading}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={loading || !fuelerId || !expiryDate}
                            >
                                {loading ? 'Assigning...' : 'Assign'}
                            </Button>
                        </div>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    )
}
