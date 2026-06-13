"use client";
import Link from "next/link";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useTheme } from '@/components/navigation-wrapper'
import { CertificationFormDialog } from '@/components/training/certification-form-dialog'
import { useCertifications } from '@/hooks/use-certifications'
import type { CertificationDomain } from '@/types/domain/certifications'
import type { CertificationInsert } from '@/repositories/certifications.repo'
import { Badge } from '@frontend/ui/components/ui/badge'
import { Button } from '@frontend/ui/components/ui/button'
import { Card } from '@frontend/ui/components/ui/card'
import { ErrorMessage } from '@frontend/ui/messages/error-message'
import { SuccessMessage } from '@frontend/ui/messages/success-message'
import { useState } from 'react'

export default function TrainingPage() {
  const { user } = useCurrentUser();
  const isAdmin = user?.role === "admin";
  const { theme } = useTheme()
  const { certifications, loading, error, upsertCertification, deleteCertification } = useCertifications()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCertification, setEditingCertification] = useState<CertificationDomain | null>(null)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const showSuccess = (msg: string) => { setSuccessMessage(msg); setTimeout(() => setSuccessMessage(''), 3000) }
  const showError = (msg: string) => { setErrorMessage(msg); setTimeout(() => setErrorMessage(''), 3000) }

  const handleSubmit = async (data: CertificationInsert) => {
    try {
      await upsertCertification(data)
      showSuccess(editingCertification ? 'Certification updated successfully' : 'Certification created successfully')
      setEditingCertification(null)
    } catch (err) {
      showError('Failed to save certification')
      throw err
    }
  }

  const handleDeleteCertification = async (id: number) => {
    if (!confirm('Are you sure you want to delete this certification?')) return
    try {
      await deleteCertification(id)
      showSuccess('Certification deleted successfully')
    } catch (err) {
      showError('Failed to delete certification')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg text-muted-foreground">Loading training data...</div>
      </div>
    )
  }

  const expiredCerts = certifications.filter((c) => c.expiryStatus === 'expired')
  const criticalCerts = certifications.filter((c) => c.expiryStatus === 'critical')
  const warningCerts = certifications.filter((c) => c.expiryStatus === 'warning')
  const cautionCerts = certifications.filter((c) => c.expiryStatus === 'caution')

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'expired': case 'critical': return 'bg-destructive/10 text-destructive border-destructive/20'
      case 'warning': case 'caution': return 'bg-warning/10 text-warning border-warning/20'
      case 'valid': return 'bg-success/10 text-success border-success/20'
      default: return 'bg-muted text-muted-foreground border-border'
    }
  }

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Training Management</h1>
          <p className="mt-2 text-sm text-muted-foreground">Track fueler certifications and training status</p>
        </div>
        {isAdmin && (
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => { setEditingCertification(null); setDialogOpen(true) }}>
            Add Certification
          </Button>
        )}
      </div>

      {successMessage && <SuccessMessage>{successMessage}</SuccessMessage>}
      {errorMessage && <ErrorMessage>{errorMessage}</ErrorMessage>}
      {error && (
        <Card className="bg-destructive/10 border-destructive/20 p-4">
          <p className="text-sm text-destructive">Failed to load training data</p>
        </Card>
      )}

      <CertificationFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        certification={editingCertification}
        onSubmit={handleSubmit}
      />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-4">
        {[
          { count: expiredCerts.length, label: 'Expired', color: 'bg-destructive/10 border-destructive/20' },
          { count: criticalCerts.length, label: '1 Day', color: 'bg-destructive/10 border-destructive/20 border-2' },
          { count: warningCerts.length, label: '3 Days', color: 'bg-warning/10 border-warning/20' },
          { count: cautionCerts.length, label: '7 Days', color: 'bg-warning/10 border-warning/20' }
        ].map(({ count, label, color }) => (
          <Card key={label} className={`p-6 ${color}`}>
            <div className="flex items-center">
              <div className="ml-4">
                <div className="text-2xl font-bold">{count}</div>
                <div className="text-sm text-muted-foreground">{label}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="bg-card border-border">
        <div className="px-6 py-5 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">All Certifications ({certifications.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted/30">
              <tr>
                {['Fueler', 'Training', 'Completed', 'Expires', 'Days Left', 'Status', 'Certified By', 'Actions'].map((h) => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {certifications.map((cert) => (
                <tr key={cert.id} className={`hover:bg-muted/10 ${cert.expiryStatus === 'expired' ? 'bg-destructive/5' : ''}`}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground">{cert.fuelerName}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">{cert.trainingName}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">{formatDate(cert.completedDate)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">{formatDate(cert.expiryDate)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`font-semibold ${cert.daysUntilExpiry < 0 ? 'text-destructive' : cert.daysUntilExpiry <= 3 ? 'text-destructive' : cert.daysUntilExpiry <= 7 ? 'text-warning' : 'text-foreground'}`}>
                      {cert.daysUntilExpiry < 0 ? `${Math.abs(cert.daysUntilExpiry)} days ago` : `${cert.daysUntilExpiry} days`}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge className={getStatusBadge(cert.expiryStatus)}>
                      {cert.expiryStatus.charAt(0).toUpperCase() + cert.expiryStatus.slice(1)}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">{cert.certifiedByName || 'N/A'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80"
                      onClick={() => { setEditingCertification(cert); setDialogOpen(true) }}>Edit</Button>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive/80"
                      onClick={() => handleDeleteCertification(cert.id)}>Delete</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {certifications.length === 0 && !error && (
          <div className="p-8 text-center">
            <div className="text-muted-foreground">No certifications found. Add certifications to get started.</div>
          </div>
        )}
      </Card>
    </div>
  )
}
