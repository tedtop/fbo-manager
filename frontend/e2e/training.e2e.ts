import { expect, test } from '@playwright/test'
import { createE2EDbClient, waitForDbRow } from './support/db'
import { expectConventionalSheet } from './support/ui'
import { uniqueValue } from './support/unique'

const db = createE2EDbClient()

/** The compliance matrix lists active department_member rows, so a testable staff member
 * needs a users row AND a department roster membership. */
async function seedStaffMember() {
  const lastName = uniqueValue('E2ETrainee')
  const { data: user, error: userError } = await db
    .from('users')
    .insert({
      username: uniqueValue('e2e-trainee-'),
      email: `${uniqueValue('trainee')}@e2e.local`,
      first_name: 'E2E',
      last_name: lastName,
      role: 'line',
      password: 'not-a-real-login',
    })
    .select()
    .single()
  if (userError) throw userError

  const { data: dept, error: deptError } = await db
    .from('department')
    .insert({ name: `E2E Dept ${lastName}`, slug: uniqueValue('e2e-dept-') })
    .select()
    .single()
  if (deptError) throw deptError

  const { error: memberError } = await db.from('department_member').insert({
    department_id: dept.id,
    user_id: user.id,
    title: 'E2E Line Tech',
  })
  if (memberError) throw memberError

  return { user, lastName }
}

test.describe('Training — courses and completions actually persist', () => {
  test('Add training form creates a real training_course row', async ({ page }) => {
    const courseName = uniqueValue('E2E Course ')

    await page.goto('/training')
    await page.getByRole('tab', { name: 'Manage trainings' }).click()
    await page.getByRole('button', { name: 'Add training' }).click()
    await expectConventionalSheet(page)

    await page.getByLabel('Name').fill(courseName)
    await page.getByLabel('Training material URL').fill('https://example.com/e2e-course')
    await page.getByLabel('Instructions').fill('E2E instructions')
    // Validity defaults to 12 months — left as-is deliberately so the default persists.
    await page.getByRole('button', { name: 'Add training' }).click()

    await expect(page.locator('[data-slot="sheet-content"]')).not.toBeVisible({ timeout: 10_000 })

    const course = await waitForDbRow(async () => {
      const { data } = await db.from('training_course').select('*').eq('name', courseName).maybeSingle()
      return data
    })
    expect(course.url).toBe('https://example.com/e2e-course')
    expect(course.instructions).toBe('E2E instructions')
    expect(course.validity_amount).toBe(12)
    expect(course.validity_unit).toBe('months')
  })

  test('recording a completion from the matrix persists and updates the cell', async ({
    page,
  }) => {
    const { user, lastName } = await seedStaffMember()
    const courseName = uniqueValue('E2E Cert ')
    const { data: course, error: courseError } = await db
      .from('training_course')
      .insert({
        name: courseName,
        url: '',
        instructions: '',
        validity_amount: 12,
        validity_unit: 'months',
      })
      .select()
      .single()
    if (courseError) throw courseError

    await page.goto('/training')
    // Narrow the matrix to just the seeded staff member.
    await page.getByPlaceholder('Search staff...').fill(lastName)
    const row = page.locator('tbody tr').filter({ hasText: lastName })
    await expect(row).toHaveCount(1)

    // Cells carry no accessible name (status icon only), so locate the column by header
    // position: header cell N corresponds to the row's (N-1)th cell button ("Employee"
    // is the leading header).
    const headerTexts = await page.locator('thead th').allInnerTexts()
    const columnIndex = headerTexts.findIndex((t) => t.includes(courseName))
    expect(columnIndex).toBeGreaterThan(0)
    await row.getByRole('button').nth(columnIndex - 1).click()

    const sheet = await expectConventionalSheet(page)
    await expect(sheet.getByText(courseName)).toBeVisible()
    await sheet.getByRole('button', { name: 'Record completion' }).click()
    // Completion date defaults to today; add a note to prove text fields persist too.
    await sheet.getByLabel('Notes').fill('E2E recorded')
    await sheet.getByRole('button', { name: 'Save', exact: true }).click()

    const completion = await waitForDbRow(async () => {
      const { data } = await db
        .from('training_completion')
        .select('*')
        .eq('user_id', user.id)
        .eq('course_id', course.id)
        .maybeSingle()
      return data
    })
    expect(completion.notes).toBe('E2E recorded')
    expect(completion.completed_on).toBe(new Date().toISOString().split('T')[0])
    // 12-month validity means an expiry date must have been computed and stored.
    expect(completion.expires_on).not.toBeNull()

    // The sheet stays open showing the recorded status; close it so the matrix behind
    // it is interactable/visible to role queries again.
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-slot="sheet-content"]')).not.toBeVisible()

    // The matrix cell must now reflect the persisted completion (status flips from the
    // "missing" plus-icon to a dated "current" cell) — proving the UI re-reads the DB.
    const today = new Date()
    const cellDate = `${today.getMonth() + 1}/${today.getDate()}/${String(today.getFullYear()).slice(2)}`
    await expect(row.getByRole('button').nth(columnIndex - 1)).toContainText(cellDate)
  })
})
