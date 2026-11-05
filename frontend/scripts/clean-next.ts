// Removes the private Next.js build folders that test runs leave behind (`.next-e2e/`, `.next-*`).
// Never touches `.next`, which belongs to `pnpm dev`. Folders changed in the last 10 minutes are
// skipped because a test server may still be using them; pass --force to remove those too.
//   pnpm clean:next            remove stale private build folders
//   pnpm clean:next --force    remove them all, even recently used ones
//   pnpm clean:next --dry-run  only list what would be removed
import { readdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const force = process.argv.includes('--force')
const dryRun = process.argv.includes('--dry-run')
const RECENT_MS = 10 * 60 * 1000

function newestMtime(dir: string): number {
  let newest = statSync(dir).mtimeMs
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const full = path.join(dir, entry.name)
    try {
      newest = Math.max(newest, entry.isDirectory() ? newestMtime(full) : statSync(full).mtimeMs)
    } catch {
      // file vanished while scanning
    }
  }
  return newest
}

let removed = 0
let skipped = 0
for (const entry of readdirSync(root, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === '.next' || !entry.name.startsWith('.next-')) continue
  const full = path.join(root, entry.name)
  if (!force && Date.now() - newestMtime(full) < RECENT_MS) {
    console.log(`skip   ${entry.name} (used in the last 10 minutes; --force to remove)`)
    skipped++
    continue
  }
  if (!dryRun) rmSync(full, { recursive: true, force: true })
  console.log(`${dryRun ? 'would remove' : 'remove'} ${entry.name}`)
  removed++
}
console.log(`done: ${removed} removed, ${skipped} skipped`)
