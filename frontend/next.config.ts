import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  // OCR for the schedule-sheet import: tesseract.js starts a worker thread from a script file and loads wasm, and sharp
  // is native, so they stay external (traced into standalone from the dynamic import). The bundled eng.traineddata is
  // read at runtime, so it is listed explicitly. Do not add `node_modules/**` globs here: this repo has a
  // node_modules/node_modules symlink that makes Turbopack's trace loop forever.
  serverExternalPackages: ['tesseract.js', 'tesseract.js-core', 'sharp'],
  outputFileTracingIncludes: {
    '/api/ocr/schedule-sheet': ['./ocr-data/**/*']
  },
  // Lets e2e runs use their own build dir when another `next dev` already holds `.next` (NEXT_DIST_DIR=.next-e2e).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // TEMPORARY: unblock Railway deploys. See docs/deployment-railway.md.
  // Next 16 removed the `eslint` key; `pnpm tsc --noEmit` is now clean, so this
  // can be dropped once the deploy is confirmed stable.
  typescript: {
    ignoreBuildErrors: true,
  },
}

export default nextConfig
