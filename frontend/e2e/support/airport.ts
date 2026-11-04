import { type Page, expect } from '@playwright/test'

// The flight form's Origin / Destination are airport comboboxes (button id = field), not text inputs.

/** Pick a real airport by its code: the exact match is the option that starts with the code (KTEB · TEB ...). */
export async function pickAirport(
  page: Page,
  field: 'origin' | 'destination',
  code: string
) {
  await page.locator(`#${field}`).click()
  await page.getByPlaceholder(/Code or name/).fill(code)
  await page
    .getByRole('option', { name: new RegExp(`^${code}\\b`) })
    .first()
    .click()
  await expect(page.getByPlaceholder(/Code or name/)).toHaveCount(0) // closed: the next pick finds one input
}

/** Use text that is not an airport (a strip, a typo) as typed: stored as is. */
export async function typeAirport(
  page: Page,
  field: 'origin' | 'destination',
  text: string
) {
  await page.locator(`#${field}`).click()
  await page.getByPlaceholder(/Code or name/).fill(text)
  await page.getByRole('option', { name: `Use "${text}" as typed` }).click()
  await expect(page.getByPlaceholder(/Code or name/)).toHaveCount(0)
}
