import { describe, expect, it } from 'vitest'
import { completionRecorderName, isMissingProfileAttributionColumn } from '../completion-recorder'

describe('completionRecorderName', () => {
  it('prefers the profile over the legacy user', () => {
    expect(
      completionRecorderName({
        recorded_by_profile: { first_name: 'Pat', last_name: 'Profile' },
        recorded_by: { first_name: 'Old', last_name: 'Legacy', username: 'old' }
      })
    ).toBe('Pat Profile')
  })

  it('falls back to the legacy user (old completions), then to the username', () => {
    expect(completionRecorderName({ recorded_by_profile: null, recorded_by: { first_name: 'Old', last_name: 'Legacy', username: 'old' } })).toBe('Old Legacy')
    expect(completionRecorderName({ recorded_by: { first_name: '', last_name: '', username: 'old' } })).toBe('old')
  })

  it('uses the legacy user when the profile has no name, and null when unattributed', () => {
    expect(
      completionRecorderName({
        recorded_by_profile: { first_name: '', last_name: '' },
        recorded_by: { first_name: 'Old', last_name: 'Legacy', username: 'old' }
      })
    ).toBe('Old Legacy')
    expect(completionRecorderName({})).toBeNull()
    expect(completionRecorderName({ recorded_by_profile: null, recorded_by: null })).toBeNull()
  })
})

describe('isMissingProfileAttributionColumn', () => {
  it('recognises the errors PostgREST gives before the B141 migration is applied', () => {
    expect(isMissingProfileAttributionColumn({ code: 'PGRST204', message: "Could not find the 'recorded_by_profile_id' column of 'training_completion' in the schema cache" })).toBe(true)
    expect(isMissingProfileAttributionColumn({ code: '42703', message: 'column training_completion.recorded_by_profile_id does not exist' })).toBe(true)
    expect(isMissingProfileAttributionColumn({ code: 'PGRST200', message: "Could not find a relationship between 'training_completion' and 'recorded_by_profile_id'" })).toBe(true)
  })

  it('ignores unrelated errors', () => {
    expect(isMissingProfileAttributionColumn({ code: '23503', message: 'violates foreign key recorded_by_profile_id' })).toBe(false)
    expect(isMissingProfileAttributionColumn({ code: 'PGRST204', message: "Could not find the 'notes' column" })).toBe(false)
    expect(isMissingProfileAttributionColumn(null)).toBe(false)
  })
})
