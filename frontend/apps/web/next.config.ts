import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@frontend/types', '@frontend/ui'],
  // Migrated from webpack to Turbopack (Next.js 16 default)
  turbopack: {
    root: '../..',  // Set root to monorepo root (frontend/)
    resolveAlias: {
      '@/components': '../../packages/ui/components',
      '@/lib': '../../packages/ui/lib',
      '@/hooks': '../../packages/ui/hooks',
    },
  },
}

export default nextConfig
