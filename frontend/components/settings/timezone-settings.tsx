'use client'

import { Label } from '@/components/ui/label'
import { useAppSettings } from '@/hooks/use-app-settings'
import { useToast } from '@/hooks/use-toast'
import { US_TIME_ZONES, allTimeZones } from '@/lib/display-zone'
import { describeError } from '@/lib/error-message'
import { formatLocalTime, isValidTimeZone, zoneShortName } from '@/lib/local-date'
import { useMemo } from 'react'

// The FBO time zone the arrivals/departures board follows instead of the browser's zone. Saves as soon as
// it changes (app_setting key `timezone`), like the airport settings.
export function TimeZoneSettings() {
  const { settings, saveTimeZone } = useAppSettings()
  const { toast } = useToast()
  const zone = settings.timeZone
  const others = useMemo(() => {
    const us = new Set(US_TIME_ZONES.map((z) => z.zone))
    return allTimeZones().filter((z) => !us.has(z))
  }, [])
  const now = new Date()

  return (
    <section className="max-w-xl space-y-4 rounded-lg border border-border bg-card p-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Time zone</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The arrivals and departures board shows and filters times in this
          zone, whatever zone the computer is set to. Flights always store the
          exact moment, so changing it never moves a flight. Anyone can switch
          the board to Zulu (UTC) with the Z button on the board.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="timeZone">FBO time zone</Label>
        <select
          id="timeZone"
          value={zone}
          disabled={saveTimeZone.isPending}
          onChange={(e) => {
            const next = e.target.value
            if (!isValidTimeZone(next)) return
            saveTimeZone.mutate(next, {
              onSuccess: () =>
                toast({
                  title: 'Settings saved',
                  description: `Board time zone is ${next}.`
                }),
              onError: (error) =>
                toast({
                  title: "Couldn't save settings",
                  description: describeError(error),
                  variant: 'destructive'
                })
            })
          }}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <optgroup label="United States">
            {US_TIME_ZONES.map((z) => (
              <option key={z.zone} value={z.zone}>
                {z.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="All time zones">
            {!US_TIME_ZONES.some((z) => z.zone === zone) && !others.includes(zone) && (
              <option value={zone}>{zone}</option>
            )}
            {others.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, ' ')}
              </option>
            ))}
          </optgroup>
        </select>
        <p className="text-sm text-muted-foreground" data-testid="timezone-preview">
          Now {formatLocalTime(now, zone)} {zoneShortName(now, zone)} ({zone})
        </p>
      </div>
    </section>
  )
}
