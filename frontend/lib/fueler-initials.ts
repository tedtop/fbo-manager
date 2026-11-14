import { ADMIN_ROLE_NAME } from '@/lib/user-guards'

const LINE_ROLE_NAME = 'Line Department'

/** B68: a possible fueler: an active user in the Line Department role (an Administrator includes it). */
export interface FuelerCandidate {
  id: string
  first_name: string
  last_name: string
  initials: string | null
}

export type FuelerResolution =
  | { status: 'resolved'; user: FuelerCandidate }
  | { status: 'ambiguous'; candidates: FuelerCandidate[] }
  | { status: 'unresolved' }

/** Uppercase letters only, at most four (what the profiles.initials check allows). */
export function normalizeInitials(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)
}

/** Error text for an initials draft, or null when it is blank (cleared) or valid. */
export function initialsError(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  return /^[A-Za-z]{1,4}$/.test(v) ? null : 'Initials are 1 to 4 letters'
}

/** Friendly message for a unique-index violation on initials, else null. */
export function initialsConflictMessage(
  err: { code?: string; message?: string } | null | undefined,
): string | null {
  if (!err) return null
  if (err.code === '23505' && (err.message ?? '').includes('uq_profiles_initials_active')) {
    return 'Another active user already has those initials'
  }
  return null
}

/** Match scanned initials to the Line Department users who could have fueled. Never guesses on a tie. */
export function resolveFuelerInitials(
  initials: string,
  activeLineUsers: FuelerCandidate[],
): FuelerResolution {
  const wanted = normalizeInitials(initials)
  if (!wanted) return { status: 'unresolved' }
  const matches = activeLineUsers.filter((u) => u.initials && normalizeInitials(u.initials) === wanted)
  if (matches.length === 1) return { status: 'resolved', user: matches[0] }
  if (matches.length > 1) return { status: 'ambiguous', candidates: matches }
  return { status: 'unresolved' }
}

type ProfileLike = FuelerCandidate & {
  status: string
  roles: { name: string }[]
}

/** Active users holding Line Department (or Administrator, which includes it), sorted by name. */
export function fuelerCandidates(profiles: ProfileLike[]): FuelerCandidate[] {
  return profiles
    .filter(
      (p) =>
        p.status === 'active' &&
        p.roles.some((r) => r.name === ADMIN_ROLE_NAME || r.name === LINE_ROLE_NAME),
    )
    .map(({ id, first_name, last_name, initials }) => ({ id, first_name, last_name, initials }))
    .sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`))
}

export function fuelerLabel(u: FuelerCandidate): string {
  const name = `${u.first_name} ${u.last_name}`.trim()
  return u.initials ? `${name} (${u.initials})` : name
}
