export type BoardView = 'split' | 'calendar' | 'arrivals' | 'departures'

// D4: the calendar is mouse-drag only and desktop-first, so a phone never shows it. A saved
// preference of 'calendar' stays saved (it applies again on a larger screen) but renders as split.
export function effectiveView(view: BoardView, isMobile: boolean): BoardView {
  return isMobile && view === 'calendar' ? 'split' : view
}
