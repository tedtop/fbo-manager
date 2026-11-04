'use client'

import { AirportCombobox } from '@/components/flight-operations/airport-combobox'
import { Label } from '@/components/ui/label'
import { useAirportSettings } from '@/hooks/use-airports'
import { useAppSettings } from '@/hooks/use-app-settings'
import { useToast } from '@/hooks/use-toast'
import {
  AIRPORT_DISPLAY_OPTIONS,
  type AirportDisplay
} from '@/lib/app-settings'
import { describeError } from '@/lib/error-message'

// Home airport (pre-fills Origin, ranks its country first in the airport picker) and which airport code
// the app shows. Both save as soon as they change, like the equipment types editor.
export function AirportSettings() {
  const { saveHomeAirport, saveAirportDisplay } = useAppSettings()
  const { homeAirport, displayPreference, homeCountry } = useAirportSettings()
  const { toast } = useToast()

  const onError = (error: unknown) =>
    toast({
      title: "Couldn't save settings",
      description: describeError(error),
      variant: 'destructive'
    })

  return (
    <section className="max-w-xl space-y-4 rounded-lg border border-border bg-card p-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Airports</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your home airport is the default Origin for new flights and wins when
          a code matches several airports. Flights always store the ICAO code.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="homeAirport">Home airport</Label>
        <AirportCombobox
          id="homeAirport"
          value={homeAirport}
          homeCountry={homeCountry}
          displayPreference={displayPreference}
          disabled={saveHomeAirport.isPending}
          onChange={(code) =>
            saveHomeAirport.mutate(code, {
              onSuccess: () =>
                toast({
                  title: 'Settings saved',
                  description: `Home airport is ${code}.`
                }),
              onError
            })
          }
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="airportDisplay">Airport code shown</Label>
        <select
          id="airportDisplay"
          value={displayPreference}
          disabled={saveAirportDisplay.isPending}
          onChange={(e) =>
            saveAirportDisplay.mutate(e.target.value as AirportDisplay, {
              onError
            })
          }
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
        >
          {AIRPORT_DISPLAY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </section>
  )
}
