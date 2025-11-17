'use client'

import { useCurrentUser } from '@/hooks/use-current-user'
import type { Training, TrainingRequest } from '@frontend/types/api'
import { Button } from '@frontend/ui/components/ui/button'
import { Card } from '@frontend/ui/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@frontend/ui/components/ui/dialog'
import { Input } from '@frontend/ui/components/ui/input'
import { Label } from '@frontend/ui/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@frontend/ui/components/ui/table'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { getApiClient } from '@/lib/api'

export default function TrainingTypesPage() {
    const { data: session, status } = useSession()
    const { user, loading: userLoading } = useCurrentUser()
    const router = useRouter()
    const [trainings, setTrainings] = useState<Training[]>([])
    const [loading, setLoading] = useState(true)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editing, setEditing] = useState<Training | null>(null)
    const [form, setForm] = useState<TrainingRequest>({
        training_name: '',
        description: '',
        validity_period_days: 0,
        aircraft_type: null
    })

    const isAdmin = useMemo(() => user?.role === 'admin', [user])

    useEffect(() => {
        if (status === 'unauthenticated') router.push('/login')
    }, [status, router])

    useEffect(() => {
        if (session) fetchTrainings()
    }, [session])

    const fetchTrainings = async () => {
        try {
            setLoading(true)
            const client = await getApiClient(session)
            const res = await client.trainings.trainingsList()
            setTrainings(res.results || [])
        } finally {
            setLoading(false)
        }
    }

    const openCreate = () => {
        setEditing(null)
        setForm({ training_name: '', description: '', validity_period_days: 0, aircraft_type: null })
        setDialogOpen(true)
    }

    const openEdit = (t: Training) => {
        setEditing(t)
        setForm({
            training_name: t.training_name,
            description: t.description || '',
            validity_period_days: t.validity_period_days,
            aircraft_type: t.aircraft_type
        })
        setDialogOpen(true)
    }

    const save = async (e: React.FormEvent) => {
        e.preventDefault()
        const client = await getApiClient(session)
        if (editing) {
            await client.trainings.trainingsUpdate(editing.id!, form)
        } else {
            await client.trainings.trainingsCreate(form)
        }
        setDialogOpen(false)
        fetchTrainings()
    }

    const remove = async (id: number) => {
        if (!confirm('Delete this training type?')) return
        const client = await getApiClient(session)
        await client.trainings.trainingsDestroy(id)
        fetchTrainings()
    }

    if (status === 'loading' || userLoading || loading) {
        return <div className="p-6 text-muted-foreground">Loading...</div>
    }
    if (!isAdmin) {
        return <div className="p-6 text-muted-foreground">Admins only</div>
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">Training Types</h1>
                    <p className="text-sm text-muted-foreground">Manage available trainings and validity periods</p>
                </div>
                <Button onClick={openCreate}>New Training</Button>
            </div>

            <Card className="p-4">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Validity (days)</TableHead>
                            <TableHead>Aircraft Type</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {trainings.map((t) => (
                            <TableRow key={t.id}>
                                <TableCell className="font-medium">{t.training_name}</TableCell>
                                <TableCell>{t.validity_period_days}</TableCell>
                                <TableCell>{t.aircraft_type || '—'}</TableCell>
                                <TableCell className="text-right space-x-2">
                                    <Button variant="outline" size="sm" onClick={() => openEdit(t)}>Edit</Button>
                                    <Button variant="destructive" size="sm" onClick={() => remove(t.id!)}>Delete</Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                {trainings.length === 0 && (
                    <div className="text-sm text-muted-foreground p-4">No training types yet.</div>
                )}
            </Card>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Edit Training' : 'New Training'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={save} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Name</Label>
                            <Input id="name" value={form.training_name}
                                onChange={(e) => setForm({ ...form, training_name: e.target.value })}
                                required />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="desc">Description</Label>
                            <Input id="desc" value={form.description || ''}
                                onChange={(e) => setForm({ ...form, description: e.target.value })} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="validity">Validity (days)</Label>
                                <Input id="validity" type="number" min={0} value={form.validity_period_days}
                                    onChange={(e) => setForm({ ...form, validity_period_days: Number(e.target.value) })}
                                    required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="ac">Aircraft Type (optional)</Label>
                                <Input id="ac" value={form.aircraft_type || ''}
                                    onChange={(e) => setForm({ ...form, aircraft_type: e.target.value || null })} />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                            <Button type="submit">Save</Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    )
}
