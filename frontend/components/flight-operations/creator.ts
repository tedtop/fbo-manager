// B17: who a flight is attributed to. The creator comes from the joined `users` row (flight.created_by_id);
// there is no hard-coded "ADM/Admin" or "USR/User". A row with no creator data (legacy / unreadable) gets the
// neutral LEGACY_CREATOR so the card never claims a person.

export interface FlightCreator {
  initials: string
  name: string
  department: string
}

export const LEGACY_CREATOR: FlightCreator = {
  initials: '--',
  name: 'Unknown creator',
  department: 'No creator recorded'
}

interface CreatorUser {
  first_name?: string | null
  last_name?: string | null
  username?: string | null
  role?: string | null
}

const DEPARTMENTS: Record<string, string> = {
  line: 'Line Department',
  frontdesk: 'Front Desk',
  admin: 'Administration'
}

export function creatorFromUser(user: CreatorUser | null | undefined): FlightCreator {
  if (!user) return LEGACY_CREATOR
  const first = (user.first_name ?? '').trim()
  const last = (user.last_name ?? '').trim()
  const username = (user.username ?? '').trim()
  const fullName = `${first} ${last}`.trim()
  if (!fullName && !username) return LEGACY_CREATOR
  const initials = `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase() || username.slice(0, 2).toUpperCase()
  return {
    initials: initials || LEGACY_CREATOR.initials,
    name: fullName || username,
    department: DEPARTMENTS[user.role ?? ''] ?? (user.role || LEGACY_CREATOR.department)
  }
}
