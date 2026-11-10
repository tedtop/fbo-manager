// Documentation registry (D11, B27a). Plain data with no server-only imports, so client code, server code
// and the docs test can all import it. Each module id has a folder content/docs/<id>/ holding one Markdown
// file per slug in `docs`. `helpAnchors` are the heading ids that code (Help buttons, B27c) may link to.

export type DocModule = {
  id: string
  title: string
  /** App route of the module the docs describe ("Open module" link). */
  route: string
  /** Slugs of the files under content/docs/<id>/ (without .md), in reading order. */
  docs: readonly string[]
  helpAnchors: readonly string[]
}

export const DOC_MODULES: readonly DocModule[] = [
  {
    id: 'flight-operations',
    title: 'Arrivals / Departures',
    route: '/',
    docs: ['usage-guide'],
    helpAnchors: [
      'add-flight',
      'quick-turn',
      'times',
      'hangar-pull',
      'services',
      'status',
      'delete',
      'filters',
      'airports',
      'conflicts',
      'hide'
    ]
  },
  {
    id: 'equipment',
    title: 'Equipment',
    route: '/equipment',
    docs: ['usage-guide'],
    helpAnchors: ['open-equipment', 'log-maintenance-item', 'resolve-maintenance-item', 'meter-readings', 'scans']
  },
  {
    id: 'fuel-farm',
    title: 'Fuel Farm',
    route: '/fuel-farm',
    docs: ['usage-guide'],
    helpAnchors: ['reading', 'gauge', 'ullage', 'unusable', 'trend', 'gravity', 'edit-tank']
  },
  {
    id: 'users',
    title: 'Users and sign-in',
    route: '/users',
    docs: ['usage-guide'],
    helpAnchors: ['sign-in', 'promote', 'set-real-email', 'link-signup', 'invite']
  },
  {
    id: 'fuel-dispatch',
    title: 'Fuel Dispatch',
    route: '/fuel-dispatch',
    docs: ['usage-guide'],
    helpAnchors: ['status', 'cards', 'changes', 'countdowns', 'filter', 'density', 'weather', 'fuel-sheet']
  },
  {
    id: 'equipment',
    title: 'Equipment',
    route: '/equipment',
    docs: ['usage-guide'],
    helpAnchors: ['open-equipment', 'log-maintenance-item', 'resolve-maintenance-item', 'out-of-service', 'daily-readings', 'filter-changes', 'equipment-notes', 'meter-readings', 'scans']
  }
]

export function getDocModule(id: string): DocModule | undefined {
  return DOC_MODULES.find((m) => m.id === id)
}
