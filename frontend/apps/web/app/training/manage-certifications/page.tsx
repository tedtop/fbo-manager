'use client'

import { useMemo, useState } from 'react'
import { useCurrentUser } from '@/hooks/use-current-user'
import { useCertifications } from '@/hooks/use-certifications'
import { useFuelers } from '@/hooks/use-fuelers'
import { useTrainings } from '@/hooks/use-trainings'
import { Button } from '@frontend/ui/components/ui/button'
import { Card } from '@frontend/ui/components/ui/card'
import { Badge } from '@frontend/ui/components/ui/badge'
import type { CertificationDomain } from '@/types/domain/certifications'
import type { CertificationInsert } from '@/repositories/certifications.repo'
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

    const { certifications, loading, error, upsertCertification, deleteCertification } = useCertifications()
    const { fuelers } = useFuelers()
    const { trainings } = useTrainings()

    const [filterFueler, setFilterFueler] = useState<string>('all')
    const [filterTraining, setFilterTraining] = useState<string>('all')
    const [filterStatus, setFilterStatus] = useState<string>('all')
    const [actionError, setActionError] = useState<string>('')

    const filteredCertifications = useMemo(() => {
        return certifications.filter((c) => {
            if (filterFueler !== 'all' && String(c.fuelerId) !== filterFueler) return false
            if (filterTraining !== 'all' && String(c.trainingId) !== filterTraining) return false
            if (filterStatus !== 'all' && c.expiryStatus !== filterStatus) return false
            return true
        })
    }, [certifications, filterFueler, filterTraining, filterStatus])

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this certification?')) return
        try {
            await deleteCertification(id)
        } catch (e: any) {
            setActionError(e?.message || 'Failed to delete certification')
        }
    }

    const statusBadge = (status: string) => {
        const tone =
            status === 'expired'
                ? 'bg-destructive/10 text-destructive border-destructive/20'
                : status === 'critical'
                    ? 'bg-red-500/10 text-red-600 border-red-500/20'
                    : status === 'warning'
                        ? 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20'
                        : status === 'caution'
                            ? 'bg-amber-500/10 text-amber-700 border-amber-500/20'
                            : status === 'valid'
                                ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'
                                : 'bg-muted text-muted-foreground border-muted'
        return <Badge className={tone}>{status}</Badge>
    }

    if (!isAdmin) {
        return <div className="p-6">You do not have access to this page.</div>
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-semibold">Manage Certifications</h1>
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
                                {trainings.map((t) => (
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
                                {['expired', 'critical', 'warning', 'caution', 'valid'].map((s) => (
                                    <SelectItem key={s} value={s}>{s}</SelectItem>
                                ))}
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
                                        {c.fuelerName} — {c.trainingName}
                                    </div>
                                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                                        <span>Completed: {c.completedDate || '—'}</span>
                                        <span>•</span>
                                        <span>Expires: {c.expiryDate || '—'}</span>
                                        <span>•</span>
                                        {statusBadge(c.expiryStatus)}
                                        {c.certifiedByName && (
                                            <>
                                                <span>•</span>
                                                <span>By: {c.certifiedByName}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button variant="destructive" onClick={() => handleDelete(c.id)}>
                                        Delete
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
        </div>
    )
}
