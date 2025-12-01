'use client'

import { NavigationWrapper } from '@/components/navigation-wrapper'
import { AuthProvider } from '@/providers/auth-provider'
import { QueryProvider } from '@/providers/query-provider'
import { Geist, Geist_Mono, Source_Serif_4 } from 'next/font/google'

import '@frontend/ui/styles/globals.css'
import 'mapbox-gl/dist/mapbox-gl.css'

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
            <NavigationWrapper>{children}</NavigationWrapper>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
