// Copies MapLibre's worker script from node_modules into public/maplibre/, so the browser can
// load it from a plain same-origin URL (see lib/maplibre-worker.ts). Bundlers rewrite the
// worker URL MapLibre derives from `import.meta.url`, which leaves the map without a worker.
// Runs on postinstall, before `dev` and before `build`, so the copy always matches the
// installed maplibre-gl version. The output is git-ignored.
//
// The worker is a single self-contained module: maplibre-gl-worker.mjs has no imports and
// the maplibre-gl-shared*.mjs files in dist/ are empty, so nothing else needs to be served.
import { copyFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const FILE = 'maplibre-gl-worker.mjs'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(root, 'package.json'))

const source = path.join(
  path.dirname(require.resolve('maplibre-gl/package.json')),
  'dist',
  FILE
)
const targetDir = path.join(root, 'public', 'maplibre')
mkdirSync(targetDir, { recursive: true })
copyFileSync(source, path.join(targetDir, FILE))
console.log(`copied ${path.relative(root, source)} -> public/maplibre/${FILE}`)
