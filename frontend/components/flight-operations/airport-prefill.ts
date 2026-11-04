// Which end of a new flight is the home airport (B50). Origin is where the aircraft came from and
// destination where it goes next, so only a flight that is one-sided on the ramp has a known home end:
//   arrival only    -> it lands here, destination = home (origin unknown)
//   departure only  -> a hangar pull leaves from here, origin = home (destination unknown)
//   both (a turn)   -> it came from and goes somewhere else, nothing is known
//   neither         -> nothing is known
// Times are the form's "HH:mm" strings, '' while empty or incomplete.

export type AirportPrefill = { origin: string; destination: string }

export function prefillAirports({
  arrival,
  departure,
  home
}: {
  arrival: string
  departure: string
  home: string
}): AirportPrefill {
  const homeCode = home.trim()
  const hasArrival = arrival.trim() !== ''
  const hasDeparture = departure.trim() !== ''
  if (!homeCode || hasArrival === hasDeparture) {
    return { origin: '', destination: '' }
  }
  return hasArrival
    ? { origin: '', destination: homeCode }
    : { origin: homeCode, destination: '' }
}
