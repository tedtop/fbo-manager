import type { NextConfig } from 'next'

// .env.local is now at frontend/apps/web/.env.local — loaded automatically by Next.js

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@frontend/types', '@frontend/ui'],
  // Migrated from webpack to Turbopack (Next.js 16 default)
  turbopack: {
    root: '../..',
  },
}

export default nextConfig
