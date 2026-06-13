'use client'

import { useFuelers } from '@/hooks/use-fuelers'
import { completeCertification } from '@/services/certifications.service'
import { createClient } from '@/lib/supabase/client'
import type { TrainingRow } from '@/repositories/trainings.repo'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select'
import { useMemo, useState } from 'react'
import { SuccessMessage } from '@/messages/success-message'
import { ErrorMessage } from '@/messages/error-message'
import { useQueryClient } from '@tanstack/react-query'
import { certificationKeys } from '@/hooks/use-certifications'

interface AssignTrainingDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    training: TrainingRow | null
    onAssigned?: () => void
}

export function AssignTrainingDialog({
    open,
    onOpenChange,
    training,
    onAssigned
}: AssignTrainingDialogProps) {
    const { fuelers } = useFuelers()
    const qc = useQueryClient()
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
    const [completedDate, setCompletedDate] = useState(today)
    const [fuelerId, setFuelerId] = useState<number>(0)
    const [notes, setNotes] = useState('')

    const expiryDate = useMemo(() => {
        if (!training) return ''
        const validity = training.validity_period_days || 0
        const base = new Date(completedDate + 'T00:00:00')
        base.setDate(base.getDate() + validity)
        return base.toISOString().slice(0, 10)
    }, [training, completedDate])

    const submit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!training || !fuelerId) return
        setLoading(true)
        try {
            setError(null)
            setSuccess(null)
            const db = createClient()
            await completeCertification(db, {
                fuelerId,
                trainingId: training.id,
                completedDate,
                expiryDate,
                certifiedById: null,
                notes
            })
            qc.invalidateQueries({ queryKey: certificationKeys.all })
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
                                        <SelectItem key={f.id} value={f.id.toString()}>
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
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={loading || !fuelerId || !expiryDate}>
                                {loading ? 'Assigning...' : 'Assign'}
                            </Button>
                        </div>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    )
}
