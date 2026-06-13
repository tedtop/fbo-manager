"use client";

import { createClient } from "@/lib/supabase/client";
import { findAllFuelers } from "@/repositories/fuelers.repo";
import { findAssignedTrainingByFuelerId, updateAssignedTraining } from "@/repositories/assigned-training.repo";
import { useAuth } from "@/providers/auth-provider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export default function MyAssignedTrainingsPage() {
    const { session } = useAuth();
    const db = createClient();
    const qc = useQueryClient();

    const { data, isLoading, error } = useQuery({
        queryKey: ['assigned-trainings-me', session?.user?.email],
        queryFn: async () => {
            if (!session?.user?.email) return [];
            const fuelers = await findAllFuelers(db);
            const fueler = fuelers.find((f) => f.user?.email === session.user.email);
            if (!fueler) return [];
            return findAssignedTrainingByFuelerId(db, fueler.id);
        },
        enabled: !!session
    });

    const completeMutation = useMutation({
        mutationFn: (id: number) => updateAssignedTraining(db, id, {
            status: 'completed',
            completed_at: new Date().toISOString()
        }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['assigned-trainings-me'] })
    });

    if (isLoading) {
        return <div className="p-6 text-muted-foreground">Loading...</div>;
    }

    const items = data ?? [];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold">My Trainings</h1>
                <p className="text-sm text-muted-foreground">Assigned trainings for you to complete</p>
            </div>

            <Card className="p-4">
                {error && <div className="text-sm text-destructive mb-3">{(error as any)?.message || 'Error loading'}</div>}
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
                                    <td className="py-2 font-medium">{(it as any).training?.training_name ?? `Training #${it.training_id}`}</td>
                                    <td className="py-2 text-muted-foreground">{new Date(it.assigned_at).toLocaleString()}</td>
                                    <td className="py-2 text-muted-foreground">{it.due_date ? new Date(it.due_date).toLocaleDateString() : "—"}</td>
                                    <td className="py-2">
                                        <Button size="sm" onClick={() => completeMutation.mutate(it.id)}
                                            disabled={completeMutation.isPending} className="bg-primary text-primary-foreground">
                                            {completeMutation.isPending ? "Completing..." : "Complete"}
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
