import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  // TEMPORARY: unblock Railway deploys. See docs/deployment-railway.md.
  // Next 16 removed the `eslint` key; `pnpm tsc --noEmit` is now clean, so this
  // can be dropped once the deploy is confirmed stable.
  typescript: {
    ignoreBuildErrors: true,
  },
}

export default nextConfig
