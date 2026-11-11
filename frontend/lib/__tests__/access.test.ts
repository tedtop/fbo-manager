import {
  type AccessState,
  evaluateGate,
  firstAccessibleHref,
  isRouteOrChild,
  NAV_ITEMS,
  moduleForPath,
  normalizePath,
  parseAccessState,
  safeNextPath
} from '@/lib/access'
import { describe, expect, it } from 'vitest'

const admin: AccessState = {
  status: 'active',
  roles: ['Administrator'],
  access: {
    equipment: 'manage',
    invoicing: 'manage',
    training: 'manage',
    parking: 'manage',
    flight_operations: 'manage',
    line_schedule: 'manage',
    truck_sheets: 'manage',
    fuel_farm: 'manage',
    users: 'manage'
  }
}

const line: AccessState = {
  status: 'active',
  roles: ['Line Department'],
  access: {
    equipment: 'manage',
    fuel_farm: 'manage',
    truck_sheets: 'manage',
    training: 'view',
    line_schedule: 'view',
    flight_operations: 'view',
    parking: 'view'
  }
}

const noRole: AccessState = { status: 'active', roles: [], access: {} }
const customer: AccessState = { status: 'active', roles: ['Customer'], access: {} }
const disabled: AccessState = { ...admin, status: 'disabled' }

describe('moduleForPath', () => {
  it('maps the board root and nested module pages', () => {
    expect(moduleForPath('/')).toBe('flight_operations')
    expect(moduleForPath('/fuel-farm/tanks')).toBe('fuel_farm')
    expect(moduleForPath('/fuel-dispatch')).toBe('fuel_farm')
    expect(moduleForPath('/users/roles')).toBe('users')
    expect(moduleForPath('/flight-operations')).toBe('flight_operations')
  })

  it('does not match on a shared string prefix', () => {
    expect(moduleForPath('/parkingx')).toBeNull()
    expect(moduleForPath('/users-export')).toBeNull()
  })

  it('maps dashboard and settings, and returns null for unknown pages', () => {
    expect(moduleForPath('/dashboard')).toBe('flight_operations')
    expect(moduleForPath('/settings')).toBe('users')
    expect(moduleForPath('/some-new-page')).toBeNull()
  })
})

describe('normalizePath', () => {
  it('decodes, collapses slashes, drops the trailing slash and lowercases', () => {
    expect(normalizePath('/%75sers')).toBe('/users')
    expect(normalizePath('//users')).toBe('/users')
    expect(normalizePath('/Users/')).toBe('/users')
    expect(normalizePath('/users/roles/')).toBe('/users/roles')
    expect(normalizePath('/')).toBe('/')
  })

  it('maps undecodable input to a path that matches nothing', () => {
    expect(normalizePath('/%E0%A4%A')).toBe('/__invalid__')
  })
})

describe('evaluateGate path tricks', () => {
  it('cannot reach a module the role lacks via encoded, doubled or mixed-case paths', () => {
    for (const path of ['/%75sers', '//users', '/USERS', '/users/', '/%55sers/roles', '/invoicing/']) {
      expect(evaluateGate(path, line)).toEqual({ kind: 'redirect', to: '/' })
    }
  })

  it('still holds a role-less user on /pending for the same tricks', () => {
    expect(evaluateGate('/%75sers', noRole).kind).toBe('redirect')
    expect(evaluateGate('//profile/../users', noRole).kind).toBe('redirect')
  })
})

describe('evaluateGate', () => {
  it('holds a user with no role on /pending', () => {
    expect(evaluateGate('/', noRole)).toEqual({
      kind: 'redirect',
      to: '/pending?reason=no-role'
    })
    expect(evaluateGate('/users', noRole)).toEqual({
      kind: 'redirect',
      to: '/pending?reason=no-role'
    })
  })

  it('tells a role-holder with no module access apart from a role-less user', () => {
    expect(evaluateGate('/', customer)).toEqual({
      kind: 'redirect',
      to: '/pending?reason=no-access'
    })
  })

  it('lets a pending user reach /pending and their account pages', () => {
    expect(evaluateGate('/pending', noRole)).toEqual({ kind: 'allow' })
    expect(evaluateGate('/profile', noRole)).toEqual({ kind: 'allow' })
    expect(evaluateGate('/change-password', customer)).toEqual({ kind: 'allow' })
  })

  it('blocks a disabled user everywhere except /pending, whatever their roles', () => {
    expect(evaluateGate('/', disabled)).toEqual({
      kind: 'redirect',
      to: '/pending?reason=disabled'
    })
    expect(evaluateGate('/profile', disabled)).toEqual({
      kind: 'redirect',
      to: '/pending?reason=disabled'
    })
    expect(evaluateGate('/pending', disabled)).toEqual({ kind: 'allow' })
  })

  it('fails closed when the access snapshot is missing', () => {
    expect(evaluateGate('/', null)).toEqual({
      kind: 'redirect',
      to: '/pending?reason=error'
    })
    expect(evaluateGate('/pending', null)).toEqual({ kind: 'allow' })
  })

  it('treats a user with no profile row as not active', () => {
    expect(evaluateGate('/', { status: 'none', roles: [], access: {} }).kind).toBe(
      'redirect'
    )
  })

  it('lets an admin open everything', () => {
    for (const path of ['/', '/users', '/users/roles', '/fuel-farm', '/settings', '/dashboard']) {
      expect(evaluateGate(path, admin)).toEqual({ kind: 'allow' })
    }
  })

  it('keeps line crew out of invoicing and users but lets them into their modules', () => {
    expect(evaluateGate('/invoicing', line)).toEqual({ kind: 'redirect', to: '/' })
    expect(evaluateGate('/users', line)).toEqual({ kind: 'redirect', to: '/' })
    expect(evaluateGate('/equipment', line)).toEqual({ kind: 'allow' })
    expect(evaluateGate('/', line)).toEqual({ kind: 'allow' })
  })

  it('denies pages with no mapped module, even for an admin (default deny)', () => {
    expect(evaluateGate('/some-new-page', admin)).toEqual({ kind: 'redirect', to: '/' })
  })

  it('keeps line crew out of settings', () => {
    expect(evaluateGate('/settings', line)).toEqual({ kind: 'redirect', to: '/' })
  })

  it('sends an approved user away from /pending to their first page', () => {
    expect(evaluateGate('/pending', admin)).toEqual({ kind: 'redirect', to: '/' })
  })
})

describe('firstAccessibleHref', () => {
  it('picks the first nav page the user can view', () => {
    expect(firstAccessibleHref({ equipment: 'view' })).toBe('/equipment')
    expect(firstAccessibleHref({ users: 'manage' })).toBe('/users')
  })

  it('falls back to /pending with no access', () => {
    expect(firstAccessibleHref({})).toBe('/pending')
  })
})

describe('parseAccessState', () => {
  it('parses a well-formed snapshot', () => {
    expect(
      parseAccessState({
        status: 'active',
        roles: ['Front Desk'],
        access: { invoicing: 'manage', parking: 'view' }
      })
    ).toEqual({
      status: 'active',
      roles: ['Front Desk'],
      access: { invoicing: 'manage', parking: 'view' }
    })
  })

  it('drops unknown access levels and rejects a bad status', () => {
    expect(
      parseAccessState({ status: 'active', roles: [], access: { users: 'root' } })
    ).toEqual({ status: 'active', roles: [], access: {} })
    expect(parseAccessState({ status: 'admin', roles: [], access: {} })).toBeNull()
    expect(parseAccessState(null)).toBeNull()
    expect(parseAccessState('active')).toBeNull()
  })
})

describe('safeNextPath', () => {
  it('keeps same-site paths', () => {
    expect(safeNextPath('/parking?x=1')).toBe('/parking?x=1')
  })

  it('rejects absolute and protocol-relative URLs', () => {
    expect(safeNextPath('https://evil.example')).toBe('/')
    expect(safeNextPath('//evil.example')).toBe('/')
    expect(safeNextPath('/\\evil.example')).toBe('/')
    expect(safeNextPath(null)).toBe('/')
  })

  it('rejects tab, newline and carriage-return tricks that URL parsers strip', () => {
    for (const raw of ['/\t/evil.example', '/\n/evil.example', '/\r/evil.example', '/\u0000/x']) {
      expect(safeNextPath(raw)).toBe('/')
    }
  })

  it('normalises to path, query and hash', () => {
    expect(safeNextPath('/parking?x=1#top')).toBe('/parking?x=1#top')
  })
})

describe('isRouteOrChild', () => {
  it('matches the route and its children but not look-alikes', () => {
    expect(isRouteOrChild('/login', '/login')).toBe(true)
    expect(isRouteOrChild('/auth/callback', '/auth/callback')).toBe(true)
    expect(isRouteOrChild('/login/x', '/login')).toBe(true)
    expect(isRouteOrChild('/login-x', '/login')).toBe(false)
    expect(isRouteOrChild('/auth/callback-x', '/auth/callback')).toBe(false)
    expect(isRouteOrChild('/login%2F..%2Fusers', '/login')).toBe(false)
  })
})

describe('evaluateGate docs (D11)', () => {
  it('lets every user with a module read /docs and its children', () => {
    for (const state of [admin, line]) {
      expect(evaluateGate('/docs', state)).toEqual({ kind: 'allow' })
      expect(evaluateGate('/docs/flight-operations', state)).toEqual({ kind: 'allow' })
    }
  })

  it('still holds pending and disabled users, and does not open look-alikes', () => {
    expect(evaluateGate('/docs', noRole).kind).toBe('redirect')
    expect(evaluateGate('/docs', customer).kind).toBe('redirect')
    expect(evaluateGate('/docs', disabled).kind).toBe('redirect')
    expect(evaluateGate('/docs-x', line).kind).toBe('redirect')
    expect(evaluateGate('/%64ocs/../users', line).kind).toBe('redirect')
  })
})

describe('Administrator holds every module (B106)', () => {
  it('an admin snapshot passes the gate for every nav page and extra path', () => {
    const modules = [...new Set(NAV_ITEMS.map((i) => i.module))]
    const access = Object.fromEntries(modules.map((m) => [m, 'manage'])) as AccessState['access']
    const admin: AccessState = { status: 'active', roles: ['Administrator'], access }
    for (const path of [...NAV_ITEMS.map((i) => i.href), '/settings', '/dispatch', '/dashboard', '/flight-operations']) {
      expect(evaluateGate(path, admin), path).toEqual({ kind: 'allow' })
    }
  })
})
