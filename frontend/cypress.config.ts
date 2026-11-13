import { defineConfig } from 'cypress'
import { createE2EDbClient } from './cypress/tasks/db'
import { seedDevUsers } from './cypress/tasks/seed'
import { equipmentTasks } from './cypress/tasks/equipment.tasks'
import { fuelDispatchTasks } from './cypress/tasks/fuel-dispatch.tasks'
import { fuelFarmTasks } from './cypress/tasks/fuel-farm.tasks'
import { invoicingTasks } from './cypress/tasks/invoicing.tasks'
import { lineScheduleTasks } from './cypress/tasks/line-schedule.tasks'
import { parkingTasks } from './cypress/tasks/parking.tasks'
import { scheduleImportTasks } from './cypress/tasks/schedule-import.tasks'
import { settingsTasks } from './cypress/tasks/settings.tasks'
import { trainingTasks } from './cypress/tasks/training.tasks'
import { truckSheetTasks } from './cypress/tasks/truck-sheets.tasks'
import { usersTasks } from './cypress/tasks/users.tasks'

// Cypress is the repo's only browser-test tool (docs/PLAN.md D14; vitest covers unit and repository tests).
// The Node-side Supabase helpers live in cypress/tasks/*; the local-stack safety guard
// (assertSafeE2ETarget) applies to every task. Own port (4210) so it never collides with the dev server (4000).
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
  /** Minutes from now for flight.hidden_at (negative = already hidden); omit for a flight that is not hidden. */
  hiddenInMin?: number
  /** Airport codes stored on the row (default KAAA -> KBBB). */
  origin?: string
  destination?: string
  /** Explicit ISO instants; they win over arrivalInMin / departureInMin. */
  arrivalAt?: string
  departureAt?: string
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
        ...equipmentTasks,
        ...fuelDispatchTasks,
        ...fuelFarmTasks,
        ...invoicingTasks,
        ...lineScheduleTasks,
        ...parkingTasks,
        ...scheduleImportTasks,
        ...settingsTasks,
        ...trainingTasks,
        ...truckSheetTasks,
        ...usersTasks,

        /** Latest flight row for an aircraft tail (null if none). Used to verify what the UI really persisted. */
        async getFlightByTail(tail: string) {
          const db = createE2EDbClient()
          const { data, error } = await db.from('flight').select('*').eq('tail_number', tail).order('id', { ascending: false }).limit(1)
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

        /** Simulates "someone else saved this flight" (bumps updated_at via the DB trigger). */
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

        /** Inserts an aircraft whose type is still Unknown (as created before the registry lookup existed). */
        async seedUnknownAircraft(tail: string) {
          const db = createE2EDbClient()
          const { error } = await db
            .from('aircraft')
            .insert({ tail_number: tail, aircraft_type_icao: 'UNKN', aircraft_type_display: 'Unknown' })
          if (error) throw new Error(`seedUnknownAircraft: ${error.message}`)
          return null
        },

        /** Idempotently creates the two Quick Dev Login accounts (the two dev accounts the login form's Quick Dev Login buttons use). */
        async seedDevUsers() {
          await seedDevUsers()
          return null
        },

        /** Inserts one aircraft + one flight via the service role. Returns the created flight id. */
        async seedFlight({ tail, arrivalInMin, departureInMin = 180, status = 'scheduled', services, isQuickTurn, hiddenInMin, origin = 'KAAA', destination = 'KBBB', arrivalAt, departureAt }: SeedFlightOptions) {
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
              tail_number: tail,
              origin,
              destination,
              scheduled_arrival_time: arrivalAt ?? (arrivalInMin === undefined ? null : iso(arrivalInMin)),
              scheduled_departure_time: departureAt ?? (departureInMin === null ? null : iso(departureInMin)),
              ...(isQuickTurn ? { is_quick_turn: true } : {}),
              flight_status: status,
              ...(hiddenInMin === undefined ? {} : { hidden_at: iso(hiddenInMin) }),
            })
            .select('id')
            .single()
          if (flightError) throw new Error(`seedFlight: flight: ${flightError.message}`)
          // B26: services live in flight_service; the RPC also keeps the legacy flight.services column in sync.
          if (services?.length) {
            const { error: servicesError } = await db.rpc('set_flight_services', { p_flight_id: data.id, p_services: services })
            if (servicesError) throw new Error(`seedFlight: services: ${servicesError.message}`)
          }
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

        /** Sorted service keys in the flight_service junction for the latest flight of a tail (the source of truth). */
        async getFlightServiceKeys(tail: string) {
          const db = createE2EDbClient()
          const { data: flights, error: flightError } = await db.from('flight').select('id').eq('tail_number', tail).order('id', { ascending: false }).limit(1)
          if (flightError) throw new Error(`getFlightServiceKeys: flight: ${flightError.message}`)
          if (!flights?.length) return null
          const { data, error } = await db.from('flight_service').select('service_id').eq('flight_id', flights[0].id)
          if (error) throw new Error(`getFlightServiceKeys: ${error.message}`)
          const { data: services, error: serviceError } = await db.from('service').select('key').in('id', (data ?? []).map((r) => r.service_id))
          if (serviceError) throw new Error(`getFlightServiceKeys: service: ${serviceError.message}`)
          return (services ?? []).map((r) => r.key).sort()
        },

        /** flight_service.quantity of one service (by key) on the latest flight of a tail; null when absent. */
        async getFlightServiceQuantity({ tail, key }: { tail: string; key: string }) {
          const db = createE2EDbClient()
          const { data: flights, error: flightError } = await db.from('flight').select('id').eq('tail_number', tail).order('id', { ascending: false }).limit(1)
          if (flightError) throw new Error(`getFlightServiceQuantity: flight: ${flightError.message}`)
          if (!flights?.length) return null
          const { data: service, error: serviceError } = await db.from('service').select('id').eq('key', key).single()
          if (serviceError) throw new Error(`getFlightServiceQuantity: service: ${serviceError.message}`)
          const { data, error } = await db.from('flight_service').select('quantity').eq('flight_id', flights[0].id).eq('service_id', service.id).maybeSingle()
          if (error) throw new Error(`getFlightServiceQuantity: ${error.message}`)
          return data?.quantity ?? null
        },

        /** Number of active rows in the service catalog. */
        async countActiveServices() {
          const db = createE2EDbClient()
          const { data, error } = await db.from('service').select('key').eq('active', true)
          if (error) throw new Error(`countActiveServices: ${error.message}`)
          return data?.length ?? 0
        },

        /** Inserts a billable-only fee product (never a board service). Returns its id. */
        async seedFeeProduct({ name, sku }: { name: string; sku: string }) {
          const db = createE2EDbClient()
          const { data, error } = await db.from('product').insert({ name, sku, price: 25, product_type: 'fee' }).select('id').single()
          if (error) throw new Error(`seedFeeProduct: ${error.message}`)
          return data.id
        },

        async deleteProduct(id: number) {
          const db = createE2EDbClient()
          const { error } = await db.from('product').delete().eq('id', id)
          if (error) throw new Error(`deleteProduct: ${error.message}`)
          return null
        },

        /** Removes the flights and aircraft seeded for the given tails. */
        async cleanFlights(tails: string[]) {
          const db = createE2EDbClient()
          const { error: flightError } = await db.from('flight').delete().in('tail_number', tails)
          if (flightError) throw new Error(`cleanFlights: flight: ${flightError.message}`)
          const { error: aircraftError } = await db.from('aircraft').delete().in('tail_number', tails)
          if (aircraftError) throw new Error(`cleanFlights: aircraft: ${aircraftError.message}`)
          return null
        },

      })
    },
  },
})
