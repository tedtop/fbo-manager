'use client'

import { useState } from 'react'
import { useCurrentUser } from '@/hooks/use-current-user'
import { Button } from '@frontend/ui/components/ui/button'
import { Card } from '@frontend/ui/components/ui/card'
import { Badge } from '@frontend/ui/components/ui/badge'
import { useCertifications } from '@/hooks/use-certifications'
import type { FuelerTraining, FuelerTrainingRequest } from '@frontend/types/api'
import { CertificationFormDialog } from '@/components/training/certification-form-dialog'

export default function ManageCertificationsPage() {
    const { user } = useCurrentUser()
    const isAdmin = user?.role === 'admin'

    const {
        certifications,
        loading,
        error,
        createCertification,
        updateCertification,
        deleteCertification
    } = useCertifications()

    const [dialogOpen, setDialogOpen] = useState(false)
    const [editing, setEditing] = useState<FuelerTraining | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [actionError, setActionError] = useState<string>('')

    if (!isAdmin) {
        return <div className="p-6">You do not have access to this page.</div>
    }

    const openCreate = () => {
        setEditing(null)
        setActionError('')
        setDialogOpen(true)
    }

    const openEdit = (c: FuelerTraining) => {
        setEditing(c)
        setActionError('')
        setDialogOpen(true)
    }

    const handleSubmit = async (data: FuelerTrainingRequest) => {
        setSubmitting(true)
        setActionError('')
        try {
            if (editing) {
                await updateCertification(editing.id, data)
            } else {
                await createCertification(data)
            }
        } catch (e: any) {
            setActionError(e?.message || 'Failed to save certification')
            throw e
        } finally {
            setSubmitting(false)
        }
    }

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this certification?')) return
        try {
            await deleteCertification(id)
        } catch (e: any) {
            setActionError(e?.message || 'Failed to delete certification')
        }
    }

    const statusBadge = (status?: string | null) => {
        const label = status || 'unknown'
        const tone =
            label === 'expired'
                ? 'bg-destructive/10 text-destructive border-destructive/20'
                : label === 'critical'
                    ? 'bg-red-500/10 text-red-600 border-red-500/20'
                    : label === 'warning'
                        ? 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20'
                        : label === 'caution'
                            ? 'bg-amber-500/10 text-amber-700 border-amber-500/20'
                            : label === 'valid'
                                ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'
                                : 'bg-muted text-muted-foreground border-muted'
        return <Badge className={tone}>{label}</Badge>
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-semibold">Manage Certifications</h1>
                <Button onClick={openCreate} className="bg-primary text-primary-foreground">
                    Create Certification
                </Button>
            </div>

            <Card className="p-4">
                <div className="mb-3 flex items-center gap-3">
                    <div className="text-sm text-muted-foreground">
                        {loading ? 'Loading...' : `${certifications.length} total`}
                    </div>
                    {(error || actionError) && (
                        <div className="text-sm text-destructive">
                            {actionError || (error as any)?.message || 'Error loading certifications'}
                        </div>
                    )}
                </div>

                {loading ? (
                    <div className="text-sm text-muted-foreground">Loading...</div>
                ) : certifications.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No certifications found.</div>
                ) : (
                    <div className="space-y-2">
                        {certifications.map((c) => (
                            <div key={c.id} className="flex items-center justify-between border rounded p-3">
                                <div className="space-y-1">
                                    <div className="font-medium text-foreground">
                                        {c.fueler_name} — {c.training_name}
                                    </div>
                                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                                        <span>Completed: {c.completed_date || '—'}</span>
                                        <span>•</span>
                                        <span>Expires: {c.expiry_date || '—'}</span>
                                        <span>•</span>
                                        {statusBadge((c as any).expiry_status)}
                                        {c.certified_by_name && (
                                            <>
                                                <span>•</span>
                                                <span>By: {c.certified_by_name}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button variant="outline" onClick={() => openEdit(c)}>
                                        Edit
                                    </Button>
                                    <Button variant="destructive" onClick={() => handleDelete(c.id)}>
                                        Delete
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            <CertificationFormDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                certification={editing}
                onSubmit={handleSubmit}
            />
        </div>
    )
}
