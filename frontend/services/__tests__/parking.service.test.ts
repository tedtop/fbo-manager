import { beforeEach, describe, expect, it } from 'vitest'
import { createTestClient } from '@/tests/support/client'
import { resetDatabase } from '@/tests/support/reset'
import { createAircraft, findAircraftByTailNumber } from '@/repositories/aircraft.repo'
import { addArea, archiveArea, editArea, listAreas, placeAircraft, unparkAircraft } from '@/services/parking.service'
import { toGeoJsonPolygon } from '@/lib/parking-geometry'

const db = createTestClient()

const ramp = toGeoJsonPolygon([
  [-114.1, 46.9],
  [-114.0, 46.9],
  [-114.0, 47.0],
  [-114.1, 47.0],
  [-114.1, 46.9],
])
const tieDownRow = toGeoJsonPolygon([
  [-114.06, 46.94],
  [-114.04, 46.94],
  [-114.04, 46.96],
  [-114.06, 46.96],
  [-114.06, 46.94],
])

beforeEach(async () => {
  await resetDatabase(db)
})

describe('parking.service', () => {
  it('adds, edits, lists and archives areas', async () => {
    const area = await addArea(db, { code: 'RAMP', name: 'Ramp', polygon: ramp })
    await editArea(db, area.id, { name: 'Main ramp' })
    expect((await listAreas(db)).map((a) => a.name)).toEqual(['Main ramp'])

    await archiveArea(db, area.id)
    expect(await listAreas(db)).toEqual([])
    expect(await listAreas(db, { includeInactive: true })).toHaveLength(1)
  })

  it('placeAircraft resolves the smallest containing area and unparkAircraft clears it', async () => {
    await addArea(db, { code: 'RAMP', name: 'Ramp', polygon: ramp })
    const row = await addArea(db, { code: 'TD-A', name: 'Row A', kind: 'tie_down', polygon: tieDownRow })
    await createAircraft(db, { tail_number: 'N1SVC' })
    const areas = await listAreas(db)

    const inRow = await placeAircraft(db, 'N1SVC', 46.95, -114.05, 180, areas)
    expect(inRow.parked_area_id).toBe(row.id)

    const inRampOnly = await placeAircraft(db, 'N1SVC', 46.91, -114.09, 90, areas)
    expect(inRampOnly.parked_area_id).not.toBe(row.id)
    expect(inRampOnly.parked_area_id).not.toBeNull()

    const outside = await placeAircraft(db, 'N1SVC', 40, -100, 0, areas)
    expect(outside.parked_area_id).toBeNull()

    await unparkAircraft(db, 'N1SVC')
    expect((await findAircraftByTailNumber(db, 'N1SVC'))?.parked_lat).toBeNull()
  })
})

describe('parking.service boundary edits refresh parked_area_id', () => {
  it('re-resolves planes when a polygon is saved', async () => {
    const area = await addArea(db, { code: 'RAMP', name: 'Ramp', polygon: tieDownRow })
    await createAircraft(db, { tail_number: 'N1IN' })
    await createAircraft(db, { tail_number: 'N1OUT' })
    const before = await listAreas(db)
    // Parked while the area was small: N1IN is inside the ramp, N1OUT outside.
    await placeAircraft(db, 'N1IN', 46.95, -114.05, 0, before)
    await placeAircraft(db, 'N1OUT', 46.91, -114.09, 0, before)
    expect((await findAircraftByTailNumber(db, 'N1IN'))?.parked_area_id).toBe(area.id)
    expect((await findAircraftByTailNumber(db, 'N1OUT'))?.parked_area_id).toBeNull()

    // The boundary grows over N1OUT and shrinks away from N1IN.
    await editArea(db, area.id, { polygon: toGeoJsonPolygon([[-114.1, 46.9], [-114.08, 46.9], [-114.08, 46.92], [-114.1, 46.92], [-114.1, 46.9]]) })
    expect((await findAircraftByTailNumber(db, 'N1OUT'))?.parked_area_id).toBe(area.id)
    expect((await findAircraftByTailNumber(db, 'N1IN'))?.parked_area_id).toBeNull()
  })

  it('does not touch planes when a non-boundary field changes', async () => {
    const area = await addArea(db, { code: 'RAMP', name: 'Ramp', polygon: tieDownRow })
    await createAircraft(db, { tail_number: 'N1IN' })
    await placeAircraft(db, 'N1IN', 46.95, -114.05, 0, await listAreas(db))
    const parkedAt = (await findAircraftByTailNumber(db, 'N1IN'))?.parked_area_id
    await editArea(db, area.id, { name: 'Renamed' })
    expect((await findAircraftByTailNumber(db, 'N1IN'))?.parked_area_id).toBe(parkedAt)
  })
})
