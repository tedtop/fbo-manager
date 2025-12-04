'use client'

import { useEffect, useMemo, useState } from 'react'
import { useCurrentUser } from '@/hooks/use-current-user'
import { Button } from '@frontend/ui/components/ui/button'
import { Card } from '@frontend/ui/components/ui/card'
import { Badge } from '@frontend/ui/components/ui/badge'
import { useCertifications } from '@/hooks/use-certifications'
import type { Fueler, FuelerTraining, FuelerTrainingRequest, Training } from '@frontend/types/api'
import { CertificationFormDialog } from '@/components/training/certification-form-dialog'
import { useSession } from 'next-auth/react'
import { getApiClient } from '@/lib/api'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@frontend/ui/components/ui/select'

export default function ManageCertificationsPage() {
    const { user } = useCurrentUser()
    const isAdmin = user?.role === 'admin'
    const { data: session } = useSession()

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

    // Filter state and dropdown data
    const [fuelers, setFuelers] = useState<Fueler[]>([])
    const [trainingsList, setTrainingsList] = useState<Training[]>([])
    const [filterFueler, setFilterFueler] = useState<string>('all')
    const [filterTraining, setFilterTraining] = useState<string>('all')
    const [filterStatus, setFilterStatus] = useState<string>('all')

    useEffect(() => {
        const load = async () => {
            if (!session) return
            try {
                const client = await getApiClient(session)
                const [fRes, tRes] = await Promise.all([
                    client.fuelers.fuelersList(),
                    client.trainings.trainingsList()
                ])
                setFuelers(fRes.results || [])
                setTrainingsList(tRes.results || [])
            } catch (e) {
                // ignore silently for filters
            }
        }
        load()
    }, [session])

    const filteredCertifications = useMemo(() => {
        return certifications.filter((c: any) => {
            if (filterFueler !== 'all' && String(c.fueler) !== filterFueler) return false
            if (filterTraining !== 'all' && String(c.training) !== filterTraining) return false
            if (filterStatus !== 'all' && String(c.expiry_status) !== filterStatus) return false
            return true
        })
    }, [certifications, filterFueler, filterTraining, filterStatus])

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
            const uid = (session as any)?.user?.id
            const certifiedBy = uid ? Number(uid) : undefined
            const payload: FuelerTrainingRequest = {
                ...data,
                certified_by: certifiedBy ?? data.certified_by ?? null
            }
            if (editing) {
                await updateCertification(editing.id, payload)
            } else {
                await createCertification(payload)
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
                        {loading ? 'Loading...' : `${filteredCertifications.length} shown (${certifications.length} total)`}
                    </div>
                    {(error || actionError) && (
                        <div className="text-sm text-destructive">
                            {actionError || (error as any)?.message || 'Error loading certifications'}
                        </div>
                    )}
                </div>

                {/* Filters */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                    <div>
                        <div className="text-xs text-muted-foreground mb-1">Fueler</div>
                        <Select value={filterFueler} onValueChange={setFilterFueler}>
                            <SelectTrigger>
                                <SelectValue placeholder="All fuelers" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All fuelers</SelectItem>
                                {fuelers.map((f) => (
                                    <SelectItem key={f.id} value={String(f.id)}>
                                        {f.fueler_name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <div className="text-xs text-muted-foreground mb-1">Training</div>
                        <Select value={filterTraining} onValueChange={setFilterTraining}>
                            <SelectTrigger>
                                <SelectValue placeholder="All trainings" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All trainings</SelectItem>
                                {trainingsList.map((t) => (
                                    <SelectItem key={t.id} value={String(t.id)}>
                                        {t.training_name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <div className="text-xs text-muted-foreground mb-1">Status</div>
                        <Select value={filterStatus} onValueChange={setFilterStatus}>
                            <SelectTrigger>
                                <SelectValue placeholder="All statuses" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All statuses</SelectItem>
                                <SelectItem value="expired">expired</SelectItem>
                                <SelectItem value="critical">critical</SelectItem>
                                <SelectItem value="warning">warning</SelectItem>
                                <SelectItem value="caution">caution</SelectItem>
                                <SelectItem value="valid">valid</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {loading ? (
                    <div className="text-sm text-muted-foreground">Loading...</div>
                ) : certifications.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No certifications found.</div>
                ) : (
                    <div className="space-y-2">
                        {filteredCertifications.map((c) => (
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
