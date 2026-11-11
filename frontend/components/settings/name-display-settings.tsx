'use client'

import { Label } from '@/components/ui/label'
import { useAppSettings } from '@/hooks/use-app-settings'
import { useToast } from '@/hooks/use-toast'
import { NAME_DISPLAY_OPTIONS, type NameDisplay, USER_NAME_SORT_OPTIONS, type UserNameSort } from '@/lib/app-settings'
import { describeError } from '@/lib/error-message'

// How people's names appear on screen (the Line Schedule today). Saves as soon as it changes.
export function NameDisplaySettings() {
  const { settings, saveNameDisplay, saveUserNameSort } = useAppSettings()
  const { toast } = useToast()

  return (
    <section className="max-w-xl space-y-4 rounded-lg border border-border bg-card p-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Names</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          How employee names are shown on the Line Schedule, and how Manage Users sorts names. Stored names are not changed.
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

      <div className="space-y-2">
        <Label htmlFor="userNameSort">Sort users by</Label>
        <select
          id="userNameSort"
          value={settings.userNameSort}
          disabled={saveUserNameSort.isPending}
          onChange={(e) =>
            saveUserNameSort.mutate(e.target.value as UserNameSort, {
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
          {USER_NAME_SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label} ({o.example})
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          The starting order of the Name column in Manage Users. Clicking a column heading there changes it for that visit.
        </p>
      </div>
    </section>
  )
}
