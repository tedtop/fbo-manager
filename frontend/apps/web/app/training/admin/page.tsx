"use client";

import { useEffect, useMemo, useState } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";

type Fueler = { id: number; fueler_name: string };
type Training = { id: number; training_name: string };

export default function AdminTrainingAssignmentsPage() {
    const { user } = useCurrentUser();
    const isAdmin = user?.role === "admin";

    const [fuelers, setFuelers] = useState<Fueler[]>([]);
    const [trainings, setTrainings] = useState<Training[]>([]);
    const [selectedFuelerIds, setSelectedFuelerIds] = useState<number[]>([]);
    const [selectedTrainingId, setSelectedTrainingId] = useState<number | null>(null);
    const [dueDate, setDueDate] = useState<string>("");
    const [notes, setNotes] = useState<string>("");
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState<string>("");

    useEffect(() => {
        if (!isAdmin) return;
        // Fetch fuelers
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/fuelers/`)
            .then((r) => r.json())
            .then((data) => setFuelers(data || []))
            .catch(() => setFuelers([]));

        // Fetch trainings
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/trainings/`)
            .then((r) => r.json())
            .then((data) => setTrainings(data || []))
            .catch(() => setTrainings([]));
    }, [isAdmin]);

    const toggleFueler = (id: number) => {
        setSelectedFuelerIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    };

    const canSubmit = useMemo(
        () => isAdmin && !!selectedTrainingId && selectedFuelerIds.length > 0 && !submitting,
        [isAdmin, selectedTrainingId, selectedFuelerIds, submitting]
    );

    const handleAssign = async () => {
        if (!canSubmit || !selectedTrainingId) return;
        setSubmitting(true);
        setMessage("");
        try {
            const results: Response[] = [];
            for (const fuelerId of selectedFuelerIds) {
                results.push(
                    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/assigned-training/`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ fueler: fuelerId, training: selectedTrainingId, due_date: dueDate || null, notes }),
                    })
                );
            }
            const okCount = results.filter((r) => r.ok).length;
            setMessage(`Assigned ${okCount}/${selectedFuelerIds.length} fuelers`);
            setSelectedFuelerIds([]);
            setNotes("");
        } catch (e) {
            setMessage("Failed to assign trainings");
        } finally {
            setSubmitting(false);
        }
    };

    if (!isAdmin) {
        return <div className="p-6">You do not have access to this page.</div>;
    }

    return (
        <div className="p-6 space-y-6">
            <h1 className="text-xl font-semibold">Assign Trainings to Fuelers</h1>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                    <label className="block text-sm font-medium mb-2">Training</label>
                    <select
                        className="w-full border rounded p-2"
                        value={selectedTrainingId ?? ""}
                        onChange={(e) => setSelectedTrainingId(Number(e.target.value))}
                    >
                        <option value="">Select a training</option>
                        {trainings.map((t) => (
                            <option key={t.id} value={t.id}>{t.training_name}</option>
                        ))}
                    </select>
                    <div className="mt-4">
                        <label className="block text-sm font-medium mb-2">Due Date (optional)</label>
                        <input
                            type="date"
                            className="w-full border rounded p-2"
                            value={dueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                        />
                    </div>
                </div>

                <div className="md:col-span-2">
                    <label className="block text-sm font-medium mb-2">Fuelers</label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {fuelers.map((f) => (
                            <label key={f.id} className="flex items-center gap-2 border rounded p-2">
                                <input
                                    type="checkbox"
                                    checked={selectedFuelerIds.includes(f.id)}
                                    onChange={() => toggleFueler(f.id)}
                                />
                                <span>{f.fueler_name}</span>
                            </label>
                        ))}
                    </div>
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium mb-2">Notes (optional)</label>
                <textarea
                    className="w-full border rounded p-2"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                />
            </div>

            <div className="flex items-center gap-3">
                <button
                    className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
                    disabled={!canSubmit}
                    onClick={handleAssign}
                >
                    {submitting ? "Assigning..." : "Assign Training"}
                </button>
                {message && <span className="text-sm text-gray-600">{message}</span>}
            </div>
        </div>
    );
}
