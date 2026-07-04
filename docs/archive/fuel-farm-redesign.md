---
title: Restyle fuel-farm page to match FBO Manager design system
status: implemented
---

> Archived: this plan has already been fully implemented — `tank-visual-card.tsx` uses design
> tokens (`bg-card`, `text-foreground`, `border-border`, etc.) throughout, `app/fuel-farm/page.tsx`
> uses the `Fuel` icon from `lucide-react` with a "Fuel Dispatch" link in the header, and the
> gallons figure renders below the percentage line on each tank card. Kept for historical
> reference only.

## Context

The fuel-farm page (`/app/fuel-farm/page.tsx`) and its `TankVisualCard` component were ported from an older standalone app. They use hardcoded Tailwind color classes (`bg-white/95`, `text-gray-800`, `border-gray-200`, `from-blue-500`, etc.) instead of the FBO Manager's design-token CSS variables (`bg-card`, `text-foreground`, `border-border`, `bg-primary`, etc.). The result is white cards that look jarring against the app's dark purple theme and don't adapt to light/dark mode.

The goal is a clean, minimal diff that swaps every hardcoded color to the right design token — matching the patterns already used in `fuel-dispatch/dispatch-card.tsx`.

---

## Changes

### 1. `components/fuel-farm/tank-visual-card.tsx` — primary fix

Replace hardcoded colors with design tokens throughout:

| Current (hardcoded) | Replace with (token) |
|---|---|
| `bg-white/95 backdrop-blur-sm` | `bg-card` |
| T7: `bg-yellow-50/98 border-2 border-yellow-400` | `border-2 border-warning/40 bg-warning/5` |
| `text-gray-800` (tank ID, level reading) | `text-foreground` |
| `bg-gray-100 border-3 border-gray-300 rounded-lg` (tank container) | `bg-muted border-2 border-border rounded-lg` |
| `bg-gray-600` (level markers) | `bg-muted-foreground/50` |
| `text-gray-600` (percentage line) | `text-muted-foreground` |
| `border-t border-gray-200` (update section divider) | `border-t border-border` |
| `bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700` (Update button) | Remove custom className — default `Button` already uses `bg-primary` |
| `text-gray-500` (last updated) | `text-muted-foreground` |

Keep the Avgas/Jet A fill gradients (`from-orange-500 to-yellow-400` / `from-cyan-600 to-cyan-400`) — they're meaningful visual encodings, not cosmetic colors.

Also add gallons display below the percentage line (was in old app, currently missing):
```tsx
const currentGallons = Math.round((currentLevel / maxLevel) * parseFloat(tank.capacity_gallons))
// render: <div className="text-sm text-muted-foreground">{currentGallons.toLocaleString()} gal</div>
```

Also keep the Avgas/Jet A badge color coding (cyan/yellow) — these are semantic fuel-type indicators.

### 2. `app/fuel-farm/page.tsx` — minor header cleanup

- Replace `⛽` emoji with `<Fuel className="w-8 h-8 text-primary" />` icon from `lucide-react` (consistent with fuel-dispatch's header pattern)
- Remove unused `useTheme` import (it's imported but never used in JSX)
- Add a "Fuel Dispatch" `Link` button in the header controls area alongside "New Tank" (the old app prominently featured this navigation shortcut)

---

## Files to modify

- `frontend/components/fuel-farm/tank-visual-card.tsx`
- `frontend/app/fuel-farm/page.tsx`

## Reference patterns

- Design tokens in use: `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-muted`, `bg-primary`, `border-warning/40`, `bg-warning/5`
- Pattern model: `frontend/components/fuel-dispatch/dispatch-card.tsx`
- `cn()` utility: `frontend/lib/utils.ts`

## Verification

1. Open localhost:3000/fuel-farm — cards should use `bg-card` (dark in dark mode, adapts in light mode), text should be readable against the background
2. T7 card should have a subtle warning-colored highlight border (amber/yellow) but not white background
3. Update button should use the app's primary blue (not a custom gradient)
4. Toggle dark/light mode — all tank card colors should respond correctly
5. Gallons figure should appear below the percentage line on each card
