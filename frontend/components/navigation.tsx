'use client'

import { useMyPermissions } from '@/hooks/use-permissions'
import { NAV_ITEMS } from '@/lib/access'
import { useAuth } from '@/providers/auth-provider'
import { accessAtLeast } from '@/types/domain/users'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Menu, Moon, Sun, User } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'


interface NavigationProps {
  theme?: 'dark' | 'light'
  onThemeChange?: (theme: 'dark' | 'light') => void
}

export function Navigation({ theme = 'dark', onThemeChange }: NavigationProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { supabase } = useAuth()
  const { access, loading: accessLoading } = useMyPermissions()
  // Show only the pages this user's roles open. While permissions load, show none rather than
  // flashing links that would bounce them; the middleware is what actually enforces access.
  const navigation = accessLoading
    ? []
    : NAV_ITEMS.filter((item) => accessAtLeast(access, item.module, 'view'))

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <nav className="border-b border-border bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-12 items-center justify-between">
          <div className="flex items-center space-x-6">
            <Link href="/" className="flex items-center gap-2 text-lg font-bold text-foreground">
              <img
                src="/fbo-manager-logo.png"
                alt="Logo"
                width={32}
                height={32}
                className="rounded-lg"
              />
              FBO Manager
            </Link>
            {/* Inline links need ~830px: below lg they are hidden and the menu button on the right lists them. */}
            {navigation.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`text-sm font-medium max-lg:hidden ${isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  {item.name}
                </Link>
              )
            })}
          </div>
          <div className="flex items-center space-x-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="text-foreground lg:hidden"
                  aria-label="Open navigation menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="lg:hidden">
                {navigation.map((item) => (
                  <DropdownMenuItem
                    key={item.name}
                    asChild
                    className={pathname === item.href ? 'text-primary' : ''}
                  >
                    <Link href={item.href}>{item.name}</Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {onThemeChange && (
              <Button
                variant="outline"
                size="icon"
                onClick={() =>
                  onThemeChange(theme === 'dark' ? 'light' : 'dark')
                }
                aria-label={
                  theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
                }
              >
                {theme === 'dark' ? (
                  <Sun className="h-5 w-5 text-yellow-400" />
                ) : (
                  <Moon className="h-5 w-5" />
                )}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="text-foreground"
                  aria-label="Account menu"
                >
                  <User className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href="/profile">Profile</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings">Settings</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </nav>
  )
}
