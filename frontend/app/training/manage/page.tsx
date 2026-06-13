"use client";

import { useCurrentUser } from "@/hooks/use-current-user";
import { useTrainings } from "@/hooks/use-trainings";
import { useFuelers } from "@/hooks/use-fuelers";
import { createClient } from "@/lib/supabase/client";
import { createAssignedTraining } from "@/repositories/assigned-training.repo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useMemo, useState } from "react";
import type { TrainingRow } from "@/repositories/trainings.repo";

export default function ManageTrainingsPage() {
    const { user } = useCurrentUser();
    const isAdmin = user?.role === "admin";

    const { trainings, loading, error: trainingsError, createTraining } = useTrainings();
    const { fuelers } = useFuelers();

    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [validity, setValidity] = useState<number>(365);
    const [aircraftType, setAircraftType] = useState<string>("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string>("");

    const handleCreate = async () => {
        setSubmitting(true);
        setError("");
        try {
            await createTraining({
                training_name: name,
                description,
                validity_period_days: validity,
                aircraft_type: aircraftType || null
            });
            setName("");
            setDescription("");
            setValidity(365);
            setAircraftType("");
        } catch (e: any) {
            setError(e?.message || "Failed to create training");
        } finally {
            setSubmitting(false);
        }
    };

    const [assignOpen, setAssignOpen] = useState(false);
    const [assignTraining, setAssignTraining] = useState<TrainingRow | null>(null);
    const [selectedFuelerIds, setSelectedFuelerIds] = useState<number[]>([]);
    const [assignSubmitting, setAssignSubmitting] = useState(false);
    const [assignError, setAssignError] = useState<string>("");
    const [assignDueDate, setAssignDueDate] = useState<string>("");

    const toggleFueler = (id: number) => {
        setSelectedFuelerIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const openAssign = (t: TrainingRow) => {
        setAssignTraining(t);
        setSelectedFuelerIds([]);
        setAssignDueDate("");
        setAssignError("");
        setAssignOpen(true);
    };

    const handleAssignSubmit = async () => {
        if (!assignTraining || selectedFuelerIds.length === 0) return;
        setAssignSubmitting(true);
        setAssignError("");
        try {
            const db = createClient();
            await Promise.all(
                selectedFuelerIds.map((fuelerId) =>
                    createAssignedTraining(db, {
                        fueler_id: fuelerId,
                        training_id: assignTraining.id,
                        due_date: assignDueDate || null
                    })
                )
            );
            setAssignOpen(false);
        } catch (err: any) {
            setAssignError(err?.message || "Failed to assign trainings");
        } finally {
            setAssignSubmitting(false);
        }
    };

    if (!isAdmin) {
        return <div className="p-6">You do not have access to this page.</div>;
    }

    return (
        <div className="p-6 space-y-6">
            <h1 className="text-xl font-semibold">Manage Trainings</h1>

            <Card className="p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium mb-2">Training Name</label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Jet A Fueling" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-2">Validity (days)</label>
                        <Input type="number" value={validity} onChange={(e) => setValidity(Number(e.target.value))} />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium mb-2">Description</label>
                        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-2">Aircraft Type (optional)</label>
                        <Input value={aircraftType} onChange={(e) => setAircraftType(e.target.value)} placeholder="e.g. B738" />
                    </div>
                </div>
                <div>
                    <Button onClick={handleCreate} disabled={submitting || !name} className="bg-primary text-primary-foreground">
                        {submitting ? "Creating..." : "Create Training"}
                    </Button>
                    {error && <span className="ml-3 text-sm text-destructive">{error}</span>}
                </div>
            </Card>

            <Card className="p-4">
                <h2 className="text-lg font-semibold mb-3">Existing Trainings ({trainings.length})</h2>
                {loading ? (
                    <div className="text-sm text-muted-foreground">Loading...</div>
                ) : trainings.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No trainings found.</div>
                ) : (
                    <div className="space-y-2">
                        {trainings.map((t) => (
                            <div key={t.id} className="flex items-center justify-between border rounded p-3">
                                <div>
                                    <div className="font-medium text-foreground">{t.training_name}</div>
                                    <div className="text-xs text-muted-foreground">Validity: {t.validity_period_days} days{t.aircraft_type ? ` • Type: ${t.aircraft_type}` : ""}</div>
                                </div>
                                <Button variant="outline" onClick={() => openAssign(t)}>Assign</Button>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Assign Training{assignTraining ? `: ${assignTraining.training_name}` : ""}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-2">Fuelers</label>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-auto">
                                {fuelers.map((f) => (
                                    <label key={f.id} className="flex items-center gap-2 border rounded p-2">
                                        <input type="checkbox" checked={selectedFuelerIds.includes(f.id)} onChange={() => toggleFueler(f.id)} />
                                        <span>{f.fueler_name}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-2">Due Date (optional)</label>
                            <Input type="date" value={assignDueDate} onChange={(e) => setAssignDueDate(e.target.value)} />
                        </div>
                        {assignError && <div className="text-sm text-destructive">{assignError}</div>}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
                        <Button onClick={handleAssignSubmit} disabled={assignSubmitting || selectedFuelerIds.length === 0} className="bg-primary text-primary-foreground">
                            {assignSubmitting ? "Assigning..." : "Assign"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
