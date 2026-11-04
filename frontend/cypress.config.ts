import { defineConfig } from 'cypress'
import { createE2EDbClient } from './e2e/support/db'
import { seedDevUsers } from './e2e/support/seed'

// Cypress suite for the arrivals/departures module (docs/PLAN.md D9). Playwright stays the
// repo default for the other modules; this reuses its Supabase helpers (e2e/support/*) so the
// local-stack safety guard (assertSafeE2ETarget) applies here too.
// Own port (4210) so it never collides with Playwright (4100) or the dev server (4000).
export const CYPRESS_BASE_URL = process.env.CYPRESS_BASE_URL ?? 'http://localhost:4210'

type SeedFlightOptions = {
  tail: string
  /** Minutes from now; omit for a departure-only flight (flight.scheduled_arrival_time NULL). */
  arrivalInMin?: number
  /** Minutes from now (default 180); null for an arrival-only flight (flight.scheduled_departure_time NULL). */
  departureInMin?: number | null
  isQuickTurn?: boolean
  status?: 'scheduled' | 'arrived' | 'departed' | 'cancelled' | 'delayed' | 'planned'
  services?: string[]
}

export default defineConfig({
  video: false,
  e2e: {
    baseUrl: CYPRESS_BASE_URL,
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',
    defaultCommandTimeout: 10_000,
    setupNodeEvents(on) {
      on('task', {
        /** Latest flight row for an aircraft tail (null if none). Used to verify what the UI really persisted. */
        async getFlightByTail(tail: string) {
          const db = createE2EDbClient()
          const { data, error } = await db.from('flight').select('*').eq('aircraft_id', tail).order('id', { ascending: false }).limit(1)
          if (error) throw new Error(`getFlightByTail: ${error.message}`)
          return data?.[0] ?? null
        },

        /** Aircraft row for a tail (null if none). */
        async getAircraft(tail: string) {
          const db = createE2EDbClient()
          const { data, error } = await db.from('aircraft').select('*').eq('tail_number', tail).maybeSingle()
          if (error) throw new Error(`getAircraft: ${error.message}`)
          return data
        },

        /** Simulates "someone else saved this flight" (bumps modified_at via the DB trigger). */
        async touchFlight({ id, notes }: { id: number; notes: string }) {
          const db = createE2EDbClient()
          const { error } = await db.from('flight').update({ notes }).eq('id', id)
          if (error) throw new Error(`touchFlight: ${error.message}`)
          return null
        },

        /** Inserts a bare aircraft (no flight) so the create form can target an existing tail. */
        async seedAircraft(tail: string) {
          const db = createE2EDbClient()
          const { error } = await db
            .from('aircraft')
            .insert({ tail_number: tail, aircraft_type_icao: 'B738', aircraft_type_display: 'Boeing 737-800' })
          if (error) throw new Error(`seedAircraft: ${error.message}`)
          return null
        },

        /** Idempotently creates the two Quick Dev Login accounts (same as Playwright global-setup). */
        async seedDevUsers() {
          await seedDevUsers()
          return null
        },

        /** Inserts one aircraft + one flight via the service role. Returns the created flight id. */
        async seedFlight({ tail, arrivalInMin, departureInMin = 180, status = 'scheduled', services, isQuickTurn }: SeedFlightOptions) {
          const db = createE2EDbClient()
          const iso = (min: number) => new Date(Date.now() + min * 60_000).toISOString()

          const { error: userError } = await db
            .from('users')
            .upsert(
              { id: 1, username: 'default-flight-creator', password: 'not-a-real-password', first_name: 'Default', last_name: 'Creator', role: 'line' },
              { onConflict: 'id', ignoreDuplicates: true }
            )
          if (userError) throw new Error(`seedFlight: users.id 1: ${userError.message}`)

          const { error: aircraftError } = await db
            .from('aircraft')
            .insert({ tail_number: tail, aircraft_type_icao: 'B738', aircraft_type_display: 'Boeing 737-800' })
          if (aircraftError) throw new Error(`seedFlight: aircraft: ${aircraftError.message}`)

          const { data, error: flightError } = await db
            .from('flight')
            .insert({
              created_by_id: 1,
              aircraft_id: tail,
              origin: 'KAAA',
              destination: 'KBBB',
              scheduled_arrival_time: arrivalInMin === undefined ? null : iso(arrivalInMin),
              scheduled_departure_time: departureInMin === null ? null : iso(departureInMin),
              ...(isQuickTurn ? { is_quick_turn: true } : {}),
              flight_status: status,
              ...(services ? { services } : {}),
            })
            .select('id')
            .single()
          if (flightError) throw new Error(`seedFlight: flight: ${flightError.message}`)
          return data.id
        },

        /** Sets a flight's destination (an UPDATE a second screen would make). */
        async setFlightDestination({ id, destination }: { id: number; destination: string }) {
          const db = createE2EDbClient()
          const { error } = await db.from('flight').update({ destination }).eq('id', id)
          if (error) throw new Error(`setFlightDestination: ${error.message}`)
          return null
        },

        /** Soft-deletes a flight (sets deleted_at), as the app's delete does. */
        async softDeleteFlight({ id }: { id: number }) {
          const db = createE2EDbClient()
          const { error } = await db.from('flight').update({ deleted_at: new Date().toISOString() }).eq('id', id)
          if (error) throw new Error(`softDeleteFlight: ${error.message}`)
          return null
        },

        /** Removes the flights and aircraft seeded for the given tails. */
        async cleanFlights(tails: string[]) {
          const db = createE2EDbClient()
          const { error: flightError } = await db.from('flight').delete().in('aircraft_id', tails)
          if (flightError) throw new Error(`cleanFlights: flight: ${flightError.message}`)
          const { error: aircraftError } = await db.from('aircraft').delete().in('tail_number', tails)
          if (aircraftError) throw new Error(`cleanFlights: aircraft: ${aircraftError.message}`)
          return null
        },

      })
    },
  },
})
