import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { headingsOf, parseDoc } from '../parse'

// Every Help button on the flight board and form points at a heading in the Arrivals / Departures guide.
// If someone renames a heading, this fails instead of the Help button silently opening at the wrong place.
const FRONTEND = process.cwd()
const read = (f: string) => readFileSync(path.join(FRONTEND, f), 'utf8')
const guide = parseDoc(read('content/docs/flight-operations/usage-guide.md'))
const headingIds = new Set(headingsOf(guide.body).map((h) => h.id))

function helpAnchorsIn(file: string): string[] {
  const out: string[] = []
  for (const m of read(file).matchAll(/<HelpButton[^>]*?module="flight-operations"[^>]*?\/>/g)) {
    const a = m[0].match(/anchor="([^"]+)"/)
    if (a) out.push(a[1])
  }
  return out
}

describe('flight-operations Help links', () => {
  const form = helpAnchorsIn('components/flight-operations/flight-form-dialog.tsx')

  it('the form has Help buttons, including one for adding a flight', () => {
    expect(form).toContain('add-flight')
    expect(form.length).toBeGreaterThanOrEqual(3)
  })

  it('every form Help anchor is a heading in the guide', () => {
    for (const anchor of form) expect(headingIds.has(anchor), `no heading #${anchor}`).toBe(true)
  })

  it('the toolbar has a Help button that opens the guide at the top', () => {
    expect(read('components/flight-operations/compact-toolbar.tsx')).toMatch(
      /<HelpButton[^>]*module="flight-operations"/
    )
  })

  it('the guide covers every topic the board documents', () => {
    for (const id of ['add-flight', 'quick-turn', 'times', 'hangar-pull', 'services', 'status', 'filters', 'conflicts', 'airports'])
      expect(headingIds.has(id), `guide lacks #${id}`).toBe(true)
  })
})
