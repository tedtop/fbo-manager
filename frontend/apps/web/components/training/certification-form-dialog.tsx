'use client'

import { useFuelers } from '@/hooks/use-fuelers'
import { useTrainings } from '@/hooks/use-trainings'
import type { CertificationDomain } from '@/types/domain/certifications'
import type { CertificationInsert } from '@/repositories/certifications.repo'
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
import { useEffect, useState } from 'react'

interface CertificationFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  certification?: CertificationDomain | null
  onSubmit: (data: CertificationInsert) => Promise<void>
}

export function CertificationFormDialog({
  open,
  onOpenChange,
  certification,
  onSubmit
}: CertificationFormDialogProps) {
  const { fuelers } = useFuelers()
  const { trainings } = useTrainings()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<CertificationInsert>({
    fueler_id: 0,
    training_id: 0,
    completed_date: '',
    expiry_date: '',
    certified_by_id: null
  })

  useEffect(() => {
    if (certification) {
      setFormData({
        fueler_id: certification.fuelerId,
        training_id: certification.trainingId,
        completed_date: certification.completedDate,
        expiry_date: certification.expiryDate,
        certified_by_id: certification.certifiedById
      })
    } else {
      setFormData({ fueler_id: 0, training_id: 0, completed_date: '', expiry_date: '', certified_by_id: null })
    }
  }, [certification, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await onSubmit(formData)
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to save certification:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {certification ? 'Edit Certification' : 'Create Certification'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Fueler *</Label>
            <Select
              value={formData.fueler_id.toString()}
              onValueChange={(v) => setFormData({ ...formData, fueler_id: Number.parseInt(v) })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a fueler" />
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

          <div className="space-y-2">
            <Label>Training Type *</Label>
            <Select
              value={formData.training_id.toString()}
              onValueChange={(v) => setFormData({ ...formData, training_id: Number.parseInt(v) })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select training type" />
              </SelectTrigger>
              <SelectContent>
                {trainings.map((t) => (
                  <SelectItem key={t.id} value={t.id.toString()}>
                    {t.training_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Completed Date *</Label>
              <Input type="date" value={formData.completed_date}
                onChange={(e) => setFormData({ ...formData, completed_date: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Expiry Date *</Label>
              <Input type="date" value={formData.expiry_date}
                onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })} required />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !formData.fueler_id || !formData.training_id}>
              {loading ? 'Saving...' : certification ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
