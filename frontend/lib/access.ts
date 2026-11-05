import {
  type AccessLevel,
  type ModuleAccessMap,
  type ModuleKey,
  accessAtLeast
} from '@/types/domain/users'

/** Snapshot returned by the `get_my_access()` RPC. */
export interface AccessState {
  /** 'none' means the user has no profiles row at all. */
  status: 'active' | 'disabled' | 'none'
  roles: string[]
  access: ModuleAccessMap
}

/** Top-level navigation, in display order. `module` is the permission that gates the page. */
export const NAV_ITEMS: { name: string; href: string; module: ModuleKey; inAccountMenu?: boolean }[] = [
  { name: 'Flight Ops', href: '/', module: 'flight_operations' },
  { name: 'Parking', href: '/parking', module: 'parking' },
  { name: 'Fuel Dispatch', href: '/fuel-dispatch', module: 'fuel_farm' },
  { name: 'Fuel Farm', href: '/fuel-farm', module: 'fuel_farm' },
  { name: 'Truck Sheets', href: '/truck-sheets', module: 'truck_sheets' },
  { name: 'Invoicing', href: '/invoicing', module: 'invoicing' },
  { name: 'Equipment', href: '/equipment', module: 'equipment' },
  { name: 'Line Schedule', href: '/line-schedule', module: 'line_schedule' },
  { name: 'Training', href: '/training', module: 'training' },
  // Lives in the account menu (under Settings) instead of the top bar.
  { name: 'Manage Users', href: '/users', module: 'users', inAccountMenu: true }
]

/** Pages that need a module on top of the nav items (same module as their parent area). */
const EXTRA_PATH_MODULES: [prefix: string, module: ModuleKey][] = [
  ['/flight-operations', 'flight_operations'],
  ['/dispatch', 'fuel_farm'],
  ['/dashboard', 'flight_operations'],
  ['/settings', 'users']
]

/** Signed-in, active users may always open these, even before they hold a role. */
const OPEN_PATHS = ['/pending', '/profile', '/change-password', '/delete-account']

/** Documentation (D11): readable by every user who holds at least one module, but not by pending users. */
const DOCS_PATH = '/docs'

/**
 * Canonical form used for every gate decision: percent-decoded, duplicate slashes collapsed, trailing
 * slash dropped, dot-segments resolved. Without this `/%75sers` or `//users` would reach the Users page while the gate sees an
 * unknown path. Undecodable input is returned as '/__invalid__' so it matches nothing it should not.
 */
export function normalizePath(pathname: string): string {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return '/__invalid__'
  }
  const segments: string[] = []
  for (const segment of decoded.replace(/\\/g, '/').split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') segments.pop()
    else segments.push(segment)
  }
  return `/${segments.join('/')}`.toLowerCase()
}

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

/** Which module gates this page, or null when no module is mapped (the gate then denies it). */
export function moduleForPath(rawPathname: string): ModuleKey | null {
  const pathname = normalizePath(rawPathname)
  if (pathname === '/') return 'flight_operations'
  for (const item of NAV_ITEMS) {
    if (item.href !== '/' && matchesPrefix(pathname, item.href)) return item.module
  }
  for (const [prefix, module] of EXTRA_PATH_MODULES) {
    if (matchesPrefix(pathname, prefix)) return module
  }
  return null
}

export function hasAnyAccess(access: ModuleAccessMap): boolean {
  return Object.keys(access).length > 0
}

/** First page in the nav the user may open, else the pending page. */
export function firstAccessibleHref(access: ModuleAccessMap): string {
  const item = NAV_ITEMS.find((i) => accessAtLeast(access, i.module, 'view'))
  return item?.href ?? '/pending'
}

export type PendingReason = 'no-role' | 'no-access' | 'disabled' | 'error'

export type GateResult =
  | { kind: 'allow' }
  | { kind: 'redirect'; to: string }

/**
 * Decide whether a signed-in user may open `pathname`.
 * Disabled, role-less and access-less users are held on /pending.
 */
export function evaluateGate(rawPathname: string, state: AccessState | null): GateResult {
  const pathname = normalizePath(rawPathname)
  const pending = (reason: PendingReason): GateResult =>
    pathname === '/pending'
      ? { kind: 'allow' }
      : { kind: 'redirect', to: `/pending?reason=${reason}` }

  if (!state) return pending('error')
  if (state.status !== 'active') return pending('disabled')

  if (!hasAnyAccess(state.access)) {
    // Account pages stay reachable so a pending user can still change their password or leave.
    if (OPEN_PATHS.some((p) => matchesPrefix(pathname, p))) return { kind: 'allow' }
    return pending(state.roles.length === 0 ? 'no-role' : 'no-access')
  }

  if (pathname === '/pending') return { kind: 'redirect', to: firstAccessibleHref(state.access) }
  if (OPEN_PATHS.some((p) => matchesPrefix(pathname, p))) return { kind: 'allow' }
  if (matchesPrefix(pathname, DOCS_PATH)) return { kind: 'allow' }

  // Default deny: a page with no module mapped above is not opened to anyone by accident.
  const module = moduleForPath(pathname)
  if (!module || !accessAtLeast(state.access, module, 'view')) {
    return { kind: 'redirect', to: firstAccessibleHref(state.access) }
  }
  return { kind: 'allow' }
}

/** Parse the jsonb returned by `get_my_access()`; anything malformed fails closed to null. */
export function parseAccessState(raw: unknown): AccessState | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const status = r.status
  if (status !== 'active' && status !== 'disabled' && status !== 'none') return null
  const roles = Array.isArray(r.roles) ? r.roles.filter((x): x is string => typeof x === 'string') : []
  const access: ModuleAccessMap = {}
  if (r.access && typeof r.access === 'object') {
    for (const [module, level] of Object.entries(r.access as Record<string, unknown>)) {
      if (level === 'view' || level === 'manage') access[module as ModuleKey] = level as AccessLevel
    }
  }
  return { status, roles, access }
}

/**
 * Only same-site relative paths survive; anything else becomes '/'. Control characters are rejected
 * outright because URL parsers strip tabs and newlines, so "/<TAB>/evil.com" would resolve off-site.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || /[\u0000-\u001f\u007f\\]/.test(raw) || !raw.startsWith('/') || raw.startsWith('//')) {
    return '/'
  }
  try {
    const url = new URL(raw, 'http://same-site.invalid')
    if (url.origin !== 'http://same-site.invalid') return '/'
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return '/'
  }
}

/** True when `pathname` is `route` or sits under it (segment match, not a string prefix). */
export function isRouteOrChild(pathname: string, route: string): boolean {
  const p = normalizePath(pathname)
  return p === route || p.startsWith(`${route}/`)
}
