import {
  Bus,
  Car,
  Coffee,
  Droplet,
  Droplets,
  Fuel,
  type LucideIcon,
  Snowflake,
  Sparkles,
  Tag,
  Users,
  UtensilsCrossed,
  Warehouse,
  Wind,
  Wrench,
  Zap
} from 'lucide-react'

// Board service visuals (B26c). The catalog table stores a lucide icon NAME (kebab-case) and a colour TOKEN
// per service; Tailwind cannot see class strings built at runtime, so both are resolved here through static
// maps. Unknown names, tokens and keys fall back to a generic pill instead of failing.

const ICONS: Record<string, LucideIcon> = {
  fuel: Fuel,
  warehouse: Warehouse,
  'utensils-crossed': UtensilsCrossed,
  zap: Zap,
  droplet: Droplet,
  droplets: Droplets,
  wind: Wind,
  car: Car,
  users: Users,
  coffee: Coffee,
  snowflake: Snowflake,
  sparkles: Sparkles,
  wrench: Wrench,
  bus: Bus
}

// Same classes the card's hard-coded serviceConfig used.
const COLORS: Record<string, string> = {
  blue: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  violet: 'bg-violet-500/10 text-violet-500 border-violet-500/20',
  green: 'bg-green-500/10 text-green-500 border-green-500/20',
  yellow: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  cyan: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
  purple: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  orange: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  rose: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
  indigo: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
  amber: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  sky: 'bg-sky-500/10 text-sky-500 border-sky-500/20',
  teal: 'bg-teal-500/10 text-teal-500 border-teal-500/20',
  emerald: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  slate: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
  pink: 'bg-pink-500/10 text-pink-500 border-pink-500/20',
  lime: 'bg-lime-500/10 text-lime-500 border-lime-500/20'
}

export const GENERIC_SERVICE_COLOR = 'bg-muted text-muted-foreground border-border'

// service.key -> icon name + colour token for the seeded catalog; used when a pill is drawn from a bare key
// (no catalog row loaded yet, or the row carries a name/token this build does not know).
const KEY_VISUALS: Record<string, { icon: string; color: string }> = {
  fuel: { icon: 'fuel', color: 'blue' },
  hangar: { icon: 'warehouse', color: 'violet' },
  catering: { icon: 'utensils-crossed', color: 'green' },
  gpu: { icon: 'zap', color: 'yellow' },
  lav: { icon: 'droplet', color: 'cyan' },
  oxygen: { icon: 'wind', color: 'purple' },
  courtesy_car: { icon: 'car', color: 'orange' },
  rental_car: { icon: 'car', color: 'rose' },
  passengers: { icon: 'users', color: 'indigo' },
  coffee: { icon: 'coffee', color: 'amber' },
  ice: { icon: 'snowflake', color: 'sky' },
  dishes: { icon: 'utensils-crossed', color: 'teal' },
  cleaning: { icon: 'sparkles', color: 'emerald' },
  maintenance: { icon: 'wrench', color: 'slate' },
  ground_transport: { icon: 'bus', color: 'pink' },
  tks_fluid: { icon: 'droplets', color: 'lime' }
}

export interface ServiceVisual {
  Icon: LucideIcon
  /** Tailwind classes for a selected / display pill (background, text, border). */
  color: string
}

/** Resolves the icon and colour for a service. `row` (the catalog row) wins over the key defaults. */
export function getServiceVisual(
  key: string,
  row?: { icon?: string | null; color?: string | null } | null
): ServiceVisual {
  const byKey = KEY_VISUALS[key]
  const Icon = ICONS[row?.icon ?? ''] ?? ICONS[byKey?.icon ?? ''] ?? Tag
  const color = COLORS[row?.color ?? ''] ?? COLORS[byKey?.color ?? ''] ?? GENERIC_SERVICE_COLOR
  return { Icon, color }
}

/** "ground_transport" -> "Ground Transport": the label for a key that has no catalog row. */
export function fallbackServiceLabel(key: string): string {
  return key
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
