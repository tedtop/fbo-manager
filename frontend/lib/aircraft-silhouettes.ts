import type { SilhouetteCategory } from '@/lib/aircraft-dimensions'

/**
 * Top-down aircraft outlines, nose up, as SVG path data. ORIGINAL WORK drawn for this project;
 * none of it is copied or traced from Flightradar24, ADS-B Exchange / tar1090 (GPL) or any
 * other icon set.
 *
 * Every outline lives in a 100 x 100 box: x spans the full wingspan, y the full length. The
 * renderer stretches that box to the real wingspan x length of the type (non-uniform scale),
 * so a category outline takes the true proportions of each type it draws. Outlines are
 * written for the right half only (x from the centreline 50 outwards) and mirrored here.
 */

export type SilhouettePart = {
  d: string
  /**
   * body/part: filled outline; canopy: dark glass; line: stroke only (propeller);
   * disc: translucent rotor disc.
   */
  role: 'body' | 'part' | 'canopy' | 'line' | 'disc'
}

type Point = [number, number]

const n = (v: number) => Math.round(v * 10) / 10

/** Closed symmetric path from the right half, listed nose to tail on the centreline. */
function outline(half: Point[]): string {
  const left = [...half]
    .reverse()
    .slice(1, -1)
    .map(([x, y]): Point => [100 - x, y])
  const pts = [...half, ...left]
  return `M ${pts.map(([x, y]) => `${n(x)} ${n(y)}`).join(' L ')} Z`
}

/** Pod (engine nacelle) with a rounded front, drawn on both sides of the centreline. */
function pods(offset: number, y0: number, y1: number, w: number): string {
  return [50 - offset, 50 + offset]
    .map((cx) => {
      const l = cx - w / 2
      const r = cx + w / 2
      const c = y0 + w * 0.5
      const t = w * 0.18 // the back narrows a little
      return `M ${n(l + t)} ${n(y1)} L ${n(l)} ${n(c)} Q ${n(l)} ${n(y0)} ${n(cx)} ${n(y0)} Q ${n(r)} ${n(y0)} ${n(r)} ${n(c)} L ${n(r - t)} ${n(y1)} Z`
    })
    .join(' ')
}

/** Windshield / cockpit glass. */
function canopy(y0: number, y1: number, hw: number): string {
  const mid = y0 + (y1 - y0) * 0.35
  return `M 50 ${n(y0)} C ${n(50 + hw)} ${n(y0)} ${n(50 + hw)} ${n(mid)} ${n(50 + hw * 0.8)} ${n(y1)} L ${n(50 - hw * 0.8)} ${n(y1)} C ${n(50 - hw)} ${n(mid)} ${n(50 - hw)} ${n(y0)} 50 ${n(y0)} Z`
}

/** Propeller disc seen edge-on as a bar. */
function prop(cx: number, y: number, w: number): string {
  return `M ${n(cx - w / 2)} ${n(y)} L ${n(cx + w / 2)} ${n(y)}`
}

// Cessna 172 style: straight constant-chord high wing, short fuselage, small tail.
const SINGLE_HIGH: SilhouettePart[] = [
  {
    role: 'body',
    d: outline([
      [50, 0],
      [53, 0.8],
      [55, 3.5],
      [55.4, 12],
      [55, 22],
      [55.2, 26.5],
      [93, 26.5],
      [98.5, 27.5],
      [100, 30],
      [100, 43],
      [98.5, 45.5],
      [93, 46.5],
      [55.2, 46.5],
      [54, 58],
      [53, 72],
      [52.8, 82],
      [64, 83.5],
      [66, 85.5],
      [66, 94],
      [64, 95.5],
      [52, 96],
      [51.2, 100],
      [50, 100]
    ])
  },
  { role: 'canopy', d: canopy(24, 36, 4) },
  { role: 'line', d: prop(50, 1.2, 17) }
]

// Cirrus / Piper style: tapered low wing, sleek fuselage.
const SINGLE_LOW: SilhouettePart[] = [
  {
    role: 'body',
    d: outline([
      [50, 0],
      [53, 0.8],
      [55, 4],
      [55.6, 12],
      [55.2, 24],
      [55.2, 29],
      [90, 37],
      [98, 38.5],
      [100, 41],
      [100, 49],
      [97, 50.5],
      [55.2, 53],
      [54, 60],
      [53, 73],
      [52.8, 82],
      [65, 83.5],
      [67, 85.5],
      [67, 93.5],
      [65, 95],
      [52, 96],
      [51.2, 100],
      [50, 100]
    ])
  },
  { role: 'canopy', d: canopy(26, 40, 4) },
  { role: 'line', d: prop(50, 1.2, 17) }
]

// Baron / Seneca style: low wing with two forward-reaching engine nacelles.
const TWIN_PISTON: SilhouettePart[] = [
  {
    role: 'body',
    d: outline([
      [50, 0],
      [52.5, 1],
      [54.5, 5],
      [55.5, 14],
      [55.3, 30],
      [55.3, 36],
      [90, 42],
      [98, 43],
      [100, 45],
      [100, 53],
      [97, 54.5],
      [55.3, 56],
      [54, 63],
      [53, 76],
      [52.8, 82],
      [64, 83.5],
      [66, 85.5],
      [66, 94],
      [64, 95.5],
      [52, 96.5],
      [51.2, 100],
      [50, 100]
    ])
  },
  { role: 'part', d: pods(22, 22, 56, 7) },
  { role: 'canopy', d: canopy(20, 34, 4) },
  { role: 'line', d: `${prop(28, 21, 15)} ${prop(72, 21, 15)}` }
]

// King Air style: straight wing, long nacelles with props, T-tail.
const TURBOPROP: SilhouettePart[] = [
  {
    role: 'body',
    d: outline([
      [50, 0],
      [52, 1],
      [53.8, 5],
      [54.6, 14],
      [54.6, 38],
      [78, 43],
      [95, 47],
      [100, 49],
      [100, 54],
      [96, 56],
      [78, 58],
      [54.6, 60],
      [53.6, 68],
      [52.8, 80],
      [52.2, 88],
      [51.5, 96],
      [51, 100],
      [50, 100]
    ])
  },
  { role: 'part', d: pods(16, 30, 60, 6) },
  {
    role: 'part',
    d: outline([
      [50, 89],
      [66, 91],
      [74, 93.5],
      [74, 97],
      [66, 98.5],
      [50, 98.5]
    ])
  },
  { role: 'canopy', d: canopy(14, 26, 3.6) },
  { role: 'line', d: `${prop(34, 29, 15)} ${prop(66, 29, 15)}` }
]

// Citation / Phenom style: small, mildly swept wing, rear-fuselage engine pods, T-tail.
const LIGHT_JET: SilhouettePart[] = [
  {
    role: 'body',
    d: outline([
      [50, 0],
      [51.8, 1.5],
      [53.6, 6],
      [54.8, 14],
      [54.8, 40],
      [78, 45],
      [100, 50],
      [100, 56],
      [78, 58],
      [54.8, 60],
      [54.5, 70],
      [53.4, 82],
      [52, 92],
      [51, 100],
      [50, 100]
    ])
  },
  { role: 'part', d: pods(8.5, 62, 86, 6) },
  {
    role: 'part',
    d: outline([
      [50, 88],
      [62, 91],
      [68, 93],
      [68, 96.5],
      [62, 97.5],
      [50, 97.5]
    ])
  },
  { role: 'canopy', d: canopy(10, 20, 3.4) }
]

// Challenger / Gulfstream / regional jet style: strongly swept wing, rear engines, T-tail.
const MID_JET: SilhouettePart[] = [
  {
    role: 'body',
    d: outline([
      [50, 0],
      [51.6, 1.5],
      [53.2, 6],
      [54.4, 14],
      [54.4, 38],
      [78, 50],
      [98, 62],
      [100, 64],
      [100, 70],
      [96, 70.5],
      [54.5, 58],
      [54.2, 72],
      [53, 84],
      [52, 94],
      [51, 100],
      [50, 100]
    ])
  },
  { role: 'part', d: pods(8.5, 66, 90, 6) },
  {
    role: 'part',
    d: outline([
      [50, 89],
      [60, 91],
      [72, 95],
      [72, 98],
      [60, 98.5],
      [50, 98.5]
    ])
  },
  { role: 'canopy', d: canopy(9, 19, 3.2) }
]

// 737 / A320 / 777 style: wide fuselage, swept wing, underwing engines, conventional tail.
const AIRLINER: SilhouettePart[] = [
  {
    role: 'body',
    d: outline([
      [50, 0],
      [52.4, 0.8],
      [54.4, 3.5],
      [55.2, 9],
      [55.2, 38],
      [78, 50],
      [98, 61],
      [100, 63],
      [100, 67.5],
      [97, 68],
      [55.2, 60],
      [55.2, 84],
      [58, 86],
      [72, 93],
      [73, 96],
      [56, 97.5],
      [53.5, 98.5],
      [52, 100],
      [50, 100]
    ])
  },
  { role: 'part', d: pods(16, 34, 52, 6.5) },
  { role: 'canopy', d: canopy(5, 11, 3.6) }
]

// Helicopter: the body plus a rotor disc whose diameter is the wingspan. The box is
// wingspan x overall length, so the disc is a circle only if drawn as an ellipse in box
// units; `aspect` (wingspan / length) sets that ellipse.
function helicopter(aspect: number): SilhouettePart[] {
  const ry = Math.min(50 * aspect, 50)
  const cy = ry
  const ny = cy * 0.55
  const u = 100 - ny
  return [
    {
      role: 'disc',
      d: `M 0 ${n(cy)} A 50 ${n(ry)} 0 1 0 100 ${n(cy)} A 50 ${n(ry)} 0 1 0 0 ${n(cy)} Z`
    },
    {
      role: 'body',
      d: outline([
        [50, ny],
        [54.5, ny + 0.04 * u],
        [56.8, ny + 0.12 * u],
        [57, ny + 0.25 * u],
        [55, ny + 0.42 * u],
        [52.4, ny + 0.52 * u],
        [51.4, ny + 0.8 * u],
        [51.4, 90],
        [55, 94],
        [55, 99.5],
        [50, 100]
      ])
    },
    { role: 'canopy', d: canopy(ny + 0.03 * u, ny + 0.2 * u, 5) },
    // skids and their cross tubes, then the tail rotor
    {
      role: 'line',
      d: `M 40.5 ${n(ny + 0.1 * u)} L 40.5 ${n(ny + 0.42 * u)} M 59.5 ${n(ny + 0.1 * u)} L 59.5 ${n(ny + 0.42 * u)} M 40.5 ${n(ny + 0.17 * u)} L 59.5 ${n(ny + 0.17 * u)} M 40.5 ${n(ny + 0.35 * u)} L 59.5 ${n(ny + 0.35 * u)} M 57 94 L 57 100`
    }
  ]
}

const FIXED: Record<
  Exclude<SilhouetteCategory, 'helicopter'>,
  SilhouettePart[]
> = {
  'single-high': SINGLE_HIGH,
  'single-low': SINGLE_LOW,
  'twin-piston': TWIN_PISTON,
  turboprop: TURBOPROP,
  'light-jet': LIGHT_JET,
  'mid-jet': MID_JET,
  airliner: AIRLINER
}

/** Drawing parts of a category's outline in the 100 x 100 box (`aspect` matters for helicopters). */
export function silhouetteParts(
  category: SilhouetteCategory,
  aspect = 1
): SilhouettePart[] {
  return category === 'helicopter' ? helicopter(aspect) : FIXED[category]
}
