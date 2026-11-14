import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { headingsOf, parseDoc } from '../parse'
import { getDocModule } from '../registry'

// Every Help button in Manage Users points at a heading in the users guide, and the sign-in sections link
// back to the Users module (module -> Help opens section; section -> link opens module).
const read = (f: string) => readFileSync(path.join(process.cwd(), f), 'utf8')
const guide = parseDoc(read('content/docs/users/usage-guide.md'))
const headingIds = new Set(headingsOf(guide.body).map((h) => h.id))

function helpAnchorsIn(file: string): (string | null)[] {
  const out: (string | null)[] = []
  for (const m of read(file).matchAll(/<HelpButton[^>]*?module="users"[^>]*?\/>/g)) {
    out.push(m[0].match(/anchor="([^"]+)"/)?.[1] ?? null)
  }
  return out
}

describe('users Help links', () => {
  const page = helpAnchorsIn('app/users/page.tsx')
  const sheet = helpAnchorsIn('components/users/user-sheet.tsx')

  it('the Users header opens the guide at the top and the user sheet opens Roles', () => {
    expect(page).toContain(null)
    expect(sheet).toContain('roles')
  })

  it('every Help anchor is a heading in the guide and a registered helpAnchor', () => {
    const registered = new Set(getDocModule('users')?.helpAnchors)
    for (const a of [...page, ...sheet].filter((x): x is string => x !== null)) {
      expect(headingIds.has(a), `no heading #${a}`).toBe(true)
      expect(registered.has(a), `#${a} not in registry`).toBe(true)
    }
  })

  it('covers how access works, the roles and Awaiting access, and names all four roles', () => {
    for (const id of ['how-access-works', 'roles', 'awaiting-access']) expect(headingIds.has(id)).toBe(true)
    for (const role of ['Administrator', 'Front Desk', 'Line Department', 'Customer']) expect(guide.body).toContain(role)
  })

  it('the sign-in sections link back to the Users module', () => {
    expect(guide.body).toContain('(module:users)')
  })

  it('the waiting page carries its own explainer (the docs API is closed to role-less users)', () => {
    expect(read('components/pending-access.tsx')).toContain('pending-explainer')
  })
})
