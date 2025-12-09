"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card } from "@frontend/ui/components/ui/card";
import { Button } from "@frontend/ui/components/ui/button";

interface AssignedTraining {
    id: number;
    training: number;
    training_name: string;
    fueler: number;
    fueler_name: string;
    status: string;
    assigned_at: string;
    due_date?: string | null;
}

export default function MyAssignedTrainingsPage() {
    const { status, data: session } = useSession();
    const router = useRouter();
    const [items, setItems] = useState<AssignedTraining[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string>("");
    const [completingId, setCompletingId] = useState<number | null>(null);

    useEffect(() => {
        if (status === "unauthenticated") router.push("/login");
    }, [status, router]);

    const load = async () => {
        if (!session) return;
        setLoading(true);
        setError("");
        try {
            const token = (session as any)?.accessToken || (session as any)?.user?.accessToken || (session as any)?.user?.token;
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/assigned-training/?my=true&status=assigned`, {
                headers: {
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.detail || data?.error || `Failed (${res.status})`);
            const list = data.results || data || [];
            setItems(list);
        } catch (e: any) {
            setError(e?.message || "Failed to load assignments");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session]);

    const complete = async (id: number) => {
        if (!session) return;
        setCompletingId(id);
        try {
            const token = (session as any)?.accessToken || (session as any)?.user?.accessToken || (session as any)?.user?.token;
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/assigned-training/${id}/complete/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.detail || data?.error || `Failed (${res.status})`);
            await load();
        } catch (e: any) {
            setError(e?.message || "Failed to complete training");
        } finally {
            setCompletingId(null);
        }
    };

    if (status === "loading" || loading) {
        return <div className="p-6 text-muted-foreground">Loading...</div>;
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold">My Trainings</h1>
                <p className="text-sm text-muted-foreground">Assigned trainings for you to complete</p>
            </div>

            <Card className="p-4">
                {error && <div className="text-sm text-destructive mb-3">{error}</div>}
                {items.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No assigned trainings.</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-muted-foreground">
                                <th className="text-left font-medium py-2">Training</th>
                                <th className="text-left font-medium py-2">Assigned</th>
                                <th className="text-left font-medium py-2">Due</th>
                                <th className="text-left font-medium py-2"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((it) => (
                                <tr key={it.id} className="border-t border-border">
                                    <td className="py-2 font-medium">{it.training_name}</td>
                                    <td className="py-2 text-muted-foreground">{new Date(it.assigned_at).toLocaleString()}</td>
                                    <td className="py-2 text-muted-foreground">{it.due_date ? new Date(it.due_date).toLocaleDateString() : "—"}</td>
                                    <td className="py-2">
                                        <Button size="sm" onClick={() => complete(it.id)} disabled={completingId === it.id} className="bg-primary text-primary-foreground">
                                            {completingId === it.id ? "Completing..." : "Complete"}
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </Card>
        </div>
    );
}
