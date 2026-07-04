import { expect, test } from '@playwright/test'
import { currentTheme, expectConventionalSheet, toggleTheme } from './support/ui'

/**
 * Proves the form slide-out panels follow the active theme in BOTH modes. Sheets portal
 * to <body>, so this breaks the moment the theme class is scoped anywhere below <html>
 * (exactly what happened when the `dark` class lived on <main>: every sheet rendered
 * light-themed in dark mode). Uses the equipment form as the representative sheet — all
 * sheets share components/ui/sheet.tsx, so one form covers the shell for all of them;
 * per-module specs assert their own sheet against whatever theme they run under.
 */
test.describe('Theme — form slide-outs match dark and light mode', () => {
  test('the same sheet renders themed backgrounds in dark mode and light mode', async ({
    page,
  }) => {
    await page.goto('/equipment')

    const openSheet = async () => {
      await page.getByRole('button', { name: 'Add Equipment' }).click()
      return expectConventionalSheet(page)
    }
    const closeSheet = async () => {
      await page.keyboard.press('Escape')
      await expect(page.locator('[data-slot="sheet-content"]')).not.toBeVisible()
    }

    const firstTheme = await currentTheme(page)
    const firstSheet = await openSheet()
    const firstBg = await firstSheet.evaluate((el) => getComputedStyle(el).backgroundColor)
    await closeSheet()

    const secondTheme = await toggleTheme(page)
    expect(secondTheme).not.toBe(firstTheme)

    const secondSheet = await openSheet()
    const secondBg = await secondSheet.evaluate((el) => getComputedStyle(el).backgroundColor)
    await closeSheet()

    // expectConventionalSheet already proved each background matches its theme's app
    // background; this proves toggling actually produced two different themes rather
    // than both checks passing against the same (stuck) palette.
    expect(secondBg).not.toBe(firstBg)
  })
})
