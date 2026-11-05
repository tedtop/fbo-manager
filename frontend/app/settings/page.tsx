'use client'

import { AirportSettings } from '@/components/settings/airport-settings'
import { EquipmentTypesEditor } from '@/components/settings/equipment-types-editor'
import { TimeZoneSettings } from '@/components/settings/timezone-settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAppSettings } from '@/hooks/use-app-settings'
import { useModuleAccess } from '@/hooks/use-permissions'
import { useToast } from '@/hooks/use-toast'
import {
  MAX_TAIL_PREFIX_LENGTH,
  TAIL_PREFIX_PRESETS,
  normalizeTailPrefix,
  validateTailPrefix
} from '@/lib/app-settings'
import { describeError } from '@/lib/error-message'
import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'

export default function SettingsPage() {
  // Changing app-wide settings needs the same permission as managing users (see the app_setting RLS policies).
  const { allowed, loading: accessLoading } = useModuleAccess('users', 'manage')
  const { settings, loading, saveTailPrefix } = useAppSettings()
  const { toast } = useToast()
  const [prefix, setPrefix] = useState('')

  useEffect(() => {
    setPrefix(settings.tailNumberPrefix)
  }, [settings.tailNumberPrefix])

  if (accessLoading || loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg text-muted-foreground">Loading settings...</div>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <h1 className="text-xl font-semibold text-foreground">
          Access Restricted
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You do not have permission to change settings. Contact an
          administrator if you believe this is a mistake.
        </p>
      </div>
    )
  }

  const normalized = normalizeTailPrefix(prefix)
  const problem = validateTailPrefix(prefix)
  const unchanged = normalized === settings.tailNumberPrefix

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (problem || unchanged) return
    try {
      await saveTailPrefix.mutateAsync(normalized)
      toast({
        title: 'Settings saved',
        description: normalized
          ? `New flights will start the tail number with ${normalized}.`
          : 'The tail number field will start empty.'
      })
    } catch (error) {
      toast({
        title: "Couldn't save settings",
        description: describeError(error),
        variant: 'destructive'
      })
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Options that apply to everyone using this app
        </p>
      </div>

      <form
        onSubmit={handleSave}
        className="max-w-xl space-y-4 rounded-lg border border-border bg-card p-6"
      >
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Aircraft registration prefix
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The Add Flight form starts the tail number with this text, so staff
            only type the rest. Use the prefix most of your aircraft share.
            Leave it empty for no prefill.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tailPrefix">Prefix</Label>
          <Input
            id="tailPrefix"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value.toUpperCase())}
            maxLength={MAX_TAIL_PREFIX_LENGTH + 2}
            placeholder="e.g. N"
            autoComplete="off"
            className="max-w-40 font-mono"
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? 'tailPrefixError' : undefined}
          />
          {problem && (
            <p
              id="tailPrefixError"
              role="alert"
              className="text-sm text-destructive"
            >
              {problem}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Common prefixes</p>
          <div className="flex flex-wrap gap-2">
            {TAIL_PREFIX_PRESETS.map((preset) => (
              <Button
                key={preset.prefix}
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={normalized === preset.prefix}
                className={cn(
                  normalized === preset.prefix && 'border-primary text-primary'
                )}
                onClick={() => setPrefix(preset.prefix)}
              >
                <span className="font-mono font-semibold">{preset.prefix}</span>
                <span className="ml-1.5 text-muted-foreground">
                  {preset.label}
                </span>
              </Button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-border pt-4">
          <Button
            type="submit"
            disabled={!!problem || unchanged || saveTailPrefix.isPending}
          >
            {saveTailPrefix.isPending ? 'Saving...' : 'Save'}
          </Button>
          {!problem && !unchanged && (
            <span className="text-sm text-muted-foreground">
              Unsaved change
            </span>
          )}
        </div>
      </form>

      <AirportSettings />

      <TimeZoneSettings />

      <EquipmentTypesEditor />
    </div>
  )
}
