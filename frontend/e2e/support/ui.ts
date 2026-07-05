import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Asserts the currently-open form panel follows the house UI conventions
 * (docs/ui-conventions.md): create/edit forms are right-side `Sheet` slide-outs, and the
 * panel renders in the active theme. The theme half is not cosmetic pedantry — sheets
 * portal to <body>, so a theme class scoped too low in the tree (the 2026-07-04 bug: the
 * `dark` class lived on <main>) leaves every slide-out rendering light-themed in dark
 * mode. Comparing the sheet's computed background to the themed app background catches
 * that class of regression in whatever theme the test happens to run under.
 *
 * Returns the sheet locator so specs can keep using it for form interaction.
 */
export async function expectConventionalSheet(page: Page): Promise<Locator> {
  const sheet = page.locator('[data-slot="sheet-content"][data-state="open"]')
  await expect(sheet).toBeVisible()

  const viewport = page.viewportSize()
  if (!viewport) throw new Error('expectConventionalSheet: page has no viewport size')

  // Right slide-out geometry: flush against the right edge once the slide-in animation
  // settles, full height, and a panel (not a full-screen takeover or a centered modal).
  await expect
    .poll(async () => {
      const box = await sheet.boundingBox()
      return box ? Math.round(box.x + box.width) : -1
    })
    .toBeLessThanOrEqual(viewport.width + 2)
  const box = await sheet.boundingBox()
  if (!box) throw new Error('expectConventionalSheet: sheet has no bounding box')
  expect(Math.abs(box.x + box.width - viewport.width)).toBeLessThanOrEqual(2)
  expect(box.height).toBeGreaterThanOrEqual(viewport.height - 2)
  expect(box.x).toBeGreaterThan(0)

  // Theme consistency: the panel's background must be the same themed token the app
  // shell resolves — if the app is dark and the panel is light (or vice versa), these
  // computed values diverge.
  const appBg = await page
    .locator('main div.bg-background')
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor)
  const sheetBg = await sheet.evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(sheetBg, 'sheet background must match the active theme').toBe(appBg)

  return sheet
}

/** Reads the app's current theme from the <html> class the ThemeProvider maintains. */
export async function currentTheme(page: Page): Promise<'dark' | 'light'> {
  const isDark = await page.evaluate(() =>
    document.documentElement.classList.contains('dark')
  )
  return isDark ? 'dark' : 'light'
}

/** Toggles the theme via the real nav button, waiting for the <html> class to flip. */
export async function toggleTheme(page: Page): Promise<'dark' | 'light'> {
  const before = await currentTheme(page)
  await page.getByRole('button', { name: 'Toggle theme' }).click()
  const after = before === 'dark' ? 'light' : 'dark'
  await expect
    .poll(() => currentTheme(page))
    .toBe(after)
  return after
}
