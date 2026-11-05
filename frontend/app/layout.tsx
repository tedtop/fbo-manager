import { NavigationWrapper } from '@/components/navigation-wrapper'
import { Toaster } from '@/components/ui/toaster'
import { AuthProvider } from '@/providers/auth-provider'
import { DocsProvider } from '@/providers/docs-provider'
import { QueryProvider } from '@/providers/query-provider'
import type { Metadata } from 'next'
import { Geist, Geist_Mono, Source_Serif_4 } from 'next/font/google'

import '@/styles/globals.css'
import 'maplibre-gl/dist/maplibre-gl.css'

const geist = Geist({
  subsets: ['latin'],
  weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
  variable: '--font-sans'
})
const geistMono = Geist_Mono({
  subsets: ['latin'],
  weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
  variable: '--font-mono'
})
const sourceSerif4 = Source_Serif_4({
  subsets: ['latin'],
  weight: ['200', '300', '400', '500', '600', '700', '800', '900'],
  variable: '--font-serif'
})

export const metadata: Metadata = {
  title: { default: 'FBO Manager', template: '%s | FBO Manager' }
}

export default function RootLayout({
  children
}: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${geist.variable} ${geistMono.variable} ${sourceSerif4.variable} font-sans antialiased`}
      >
        <QueryProvider>
          <AuthProvider>
            <DocsProvider>
              <NavigationWrapper>{children}</NavigationWrapper>
            </DocsProvider>
            <Toaster />
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
