import { expect, test } from '@playwright/test'
import { createE2EDbClient, waitForDbRow } from './support/db'
import { uniqueValue } from './support/unique'

const db = createE2EDbClient()

/**
 * Truck sheets have no manual-entry form — the only creation path is the AI import
 * flow (/truck-sheets/new): photo upload → OCR extraction → an editable review table
 * (this IS the module's manual entry surface) → commit. The OCR endpoint calls an
 * external AI service, so that single fetch is stubbed with a route mock; everything
 * downstream — the review UI, a manual correction, truck auto-creation in the
 * equipment registry, and the truck_sheets/truck_meter_readings writes — is real.
 */
test.describe('Truck sheets — import review commits real rows', () => {
  test('reviewed sheet (with a manual correction) lands in truck_sheets + readings', async ({
    page,
  }) => {
    const truckNumber = uniqueValue('E2E').toUpperCase()
    const today = new Date().toISOString().split('T')[0]

    const extraction = {
      sheet_date: today,
      truck_number: truckNumber,
      fuel_type: 'jet_a',
      gallons_down: '120',
      starting_gallons: '5000',
      front_meter_start: '108413.4',
      rear_meter_start: '',
      fueler_initials: 'ZZ',
      readings: [
        {
          reading_type: 'fueling',
          customer: 'OCR Misread Co',
          tail_number: 'N771E2',
          aircraft_type: 'C172',
          fuel_type_confirmed: true,
          meter: 'front',
          meter_start: '108413.4',
          meter_end: '108460.6',
          gallons_pumped: '47.2',
          gallons_remaining: '4952.8',
          prist: 'yes',
          req_gals_or_lbs: 'T/O',
          line_tech_initials: 'AB',
          invoice_number: uniqueValue('INV'),
          service_time: '0545',
          notes: '',
        },
        {
          reading_type: 'tank_fill',
          customer: 'T2',
          tail_number: '',
          aircraft_type: '',
          fuel_type_confirmed: false,
          meter: 'front',
          meter_start: '108460.6',
          meter_end: '108460.6',
          gallons_pumped: '',
          gallons_remaining: '5000',
          prist: '',
          req_gals_or_lbs: 'Fill',
          line_tech_initials: 'AB',
          invoice_number: '',
          service_time: '',
          notes: '',
        },
      ],
    }

    await page.route('**/api/ocr/truck-sheet', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(extraction) })
    )

    await page.goto('/truck-sheets/new')
    await page.locator('input[type="file"]').setInputFiles({
      name: 'e2e-sheet.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('not-a-real-photo'),
    })

    // Review table renders from the extraction; correct the OCR-misread customer by
    // editing the cell directly (the module's manual-entry affordance).
    await expect(page.getByText(`Truck ${truckNumber}`).first()).toBeVisible({ timeout: 15_000 })
    const firstRow = page.locator('tbody tr').first()
    const customerCell = firstRow.locator('td').nth(3).locator('input')
    await customerCell.fill('E2E Corrected Co')

    await page.getByRole('button', { name: 'Import 1 sheet' }).click()
    await expect(page.getByText('Imported 1 truck sheet')).toBeVisible({ timeout: 15_000 })

    // Sheet header row persisted.
    const sheet = await waitForDbRow(async () => {
      const { data } = await db
        .from('truck_sheets')
        .select('*, truck_meter_readings(*)')
        .eq('truck_number', truckNumber)
        .maybeSingle()
      return data
    })
    expect(sheet.fuel_type).toBe('jet_a')
    expect(sheet.sheet_date).toBe(today)
    expect(Number(sheet.starting_gallons)).toBe(5000)
    expect(Number(sheet.front_meter_start)).toBeCloseTo(108413.4, 1)
    expect(sheet.fueler_initials).toBe('ZZ')

    // Both readings persisted, with the manual correction — not the OCR value.
    const readings = sheet.truck_meter_readings as Array<Record<string, unknown>>
    expect(readings).toHaveLength(2)
    const fueling = readings.find((r) => r.reading_type === 'fueling')
    expect(fueling?.customer).toBe('E2E Corrected Co')
    expect(fueling?.tail_number).toBe('N771E2')
    expect(Number(fueling?.gallons_pumped)).toBeCloseTo(47.2, 1)
    expect(fueling?.prist).toBe(true)
    const tankFill = readings.find((r) => r.reading_type === 'tank_fill')
    expect(tankFill?.customer).toBe('T2')

    // The unknown truck number was auto-created in the equipment registry.
    const { data: truck } = await db
      .from('equipment')
      .select('*')
      .eq('equipment_id', truckNumber)
      .single()
    expect(truck?.equipment_type).toBe('fuel_truck')
  })
})
