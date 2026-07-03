'use client'

import { useMyProfile } from '@/hooks/use-my-profile'
import { useMyPermissions } from '@/hooks/use-permissions'
import { MODULES } from '@/types/domain/users'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ErrorMessage } from '@/messages/error-message'
import { SuccessMessage } from '@/messages/success-message'
import { useEffect, useState } from 'react'

export default function ProfilePage() {
  const { profile, loading, updateProfile } = useMyProfile()
  const { access } = useMyPermissions()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!profile) return
    setFirstName(profile.first_name)
    setLastName(profile.last_name)
    setPhoneNumber(profile.phone_number)
  }, [profile])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess(false)
    setSaving(true)
    try {
      await updateProfile({
        first_name: firstName,
        last_name: lastName,
        phone_number: phoneNumber
      })
      setSuccess(true)
    } catch {
      setError('Failed to update profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-muted-foreground">Loading profile...</div>
      </div>
    )
  }

  if (!profile) {
    return (
      <ErrorMessage>
        Could not load your profile. Try signing in again.
      </ErrorMessage>
    )
  }

  const grantedModules = MODULES.filter((m) => access[m.key])

  return (
    <div className="w-full rounded-lg border border-border bg-card p-6 shadow-sm space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Update your basic information. Contact an administrator to change your
          email, roles, or employee ID.
        </p>
      </div>

      {success && <SuccessMessage>Profile updated successfully</SuccessMessage>}
      {error && <ErrorMessage>{error}</ErrorMessage>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={profile.email} disabled />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">First Name</Label>
            <Input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Last Name</Label>
            <Input
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="phoneNumber">Phone Number</Label>
          <Input
            id="phoneNumber"
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="(555) 555-1234"
          />
        </div>

        <div className="space-y-2">
          <Label>Employee ID</Label>
          <Input value={profile.employee_id ?? 'Not assigned'} disabled />
        </div>

        <Button type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </form>

      <div className="border-t border-border pt-4">
        <h2 className="text-sm font-semibold text-foreground">Your Access</h2>
        {grantedModules.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No roles assigned yet — you don&apos;t have access to any module.
            Contact an administrator.
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {grantedModules.map((m) => (
              <Badge
                key={m.key}
                variant={access[m.key] === 'manage' ? 'default' : 'secondary'}
              >
                {m.label}: {access[m.key] === 'manage' ? 'Manage' : 'View'}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
