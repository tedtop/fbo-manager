'use client'

import { Label } from '@/components/ui/label'
import { useAppSettings } from '@/hooks/use-app-settings'
import { useToast } from '@/hooks/use-toast'
import { NAME_DISPLAY_OPTIONS, type NameDisplay } from '@/lib/app-settings'
import { describeError } from '@/lib/error-message'

// How people's names appear on screen (the Line Schedule today). Saves as soon as it changes.
export function NameDisplaySettings() {
  const { settings, saveNameDisplay } = useAppSettings()
  const { toast } = useToast()

  return (
    <section className="max-w-xl space-y-4 rounded-lg border border-border bg-card p-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Names</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          How employee names are shown on the Line Schedule. Stored names are not changed.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="nameDisplay">Name shown</Label>
        <select
          id="nameDisplay"
          value={settings.nameDisplay}
          disabled={saveNameDisplay.isPending}
          onChange={(e) =>
            saveNameDisplay.mutate(e.target.value as NameDisplay, {
              onError: (error) =>
                toast({
                  title: "Couldn't save settings",
                  description: describeError(error),
                  variant: 'destructive'
                })
            })
          }
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
        >
          {NAME_DISPLAY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label} ({o.example})
            </option>
          ))}
        </select>
      </div>
    </section>
  )
}
