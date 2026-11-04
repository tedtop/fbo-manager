import { describe, expect, it } from 'vitest'
import {
  DEFAULT_APP_SETTINGS,
  isBlankTail,
  normalizeTailPrefix,
  settingsFromRows,
  validateTailPrefix
} from '../app-settings'

describe('normalizeTailPrefix', () => {
  it('trims and upper-cases', () => {
    expect(normalizeTailPrefix(' c- ')).toBe('C-')
  })
})

describe('validateTailPrefix', () => {
  it.each(['N', 'C-', 'G-', 'D-', 'VH-', 'F-', ''])('accepts %j', (prefix) => {
    expect(validateTailPrefix(prefix)).toBeNull()
  })

  it('accepts lower case (it is normalized on save)', () => {
    expect(validateTailPrefix('c-')).toBeNull()
  })

  it('rejects more than 4 characters', () => {
    expect(validateTailPrefix('ABCDE')).toMatch(/at most 4/)
  })

  it.each(['N 1', 'N*', 'Ñ', 'N/'])('rejects %j', (prefix) => {
    expect(validateTailPrefix(prefix)).toMatch(/letters, numbers and hyphens/i)
  })
})

describe('settingsFromRows', () => {
  it('defaults to N with no rows', () => {
    expect(settingsFromRows([])).toEqual(DEFAULT_APP_SETTINGS)
    expect(DEFAULT_APP_SETTINGS.tailNumberPrefix).toBe('N')
  })

  it('reads the stored prefix', () => {
    expect(
      settingsFromRows([{ key: 'tail_number_prefix', value: 'C-' }])
        .tailNumberPrefix
    ).toBe('C-')
  })

  it('keeps an intentionally empty prefix (no prefill)', () => {
    expect(
      settingsFromRows([{ key: 'tail_number_prefix', value: '' }])
        .tailNumberPrefix
    ).toBe('')
  })

  it('falls back to the default for a mistyped or invalid stored value', () => {
    expect(
      settingsFromRows([{ key: 'tail_number_prefix', value: 42 }])
        .tailNumberPrefix
    ).toBe('N')
    expect(
      settingsFromRows([{ key: 'tail_number_prefix', value: 'TOO LONG!' }])
        .tailNumberPrefix
    ).toBe('N')
  })

  it('ignores unknown keys', () => {
    expect(settingsFromRows([{ key: 'something_else', value: 'x' }])).toEqual(
      DEFAULT_APP_SETTINGS
    )
  })
})

describe('isBlankTail', () => {
  it('is blank when empty, whitespace or only the prefix', () => {
    expect(isBlankTail('', 'N')).toBe(true)
    expect(isBlankTail(undefined, 'N')).toBe(true)
    expect(isBlankTail('  ', 'N')).toBe(true)
    expect(isBlankTail('N', 'N')).toBe(true)
    expect(isBlankTail('c-', 'C-')).toBe(true)
  })

  it('is not blank once anything follows the prefix', () => {
    expect(isBlankTail('N8', 'N')).toBe(false)
    expect(isBlankTail('C-GABC', 'C-')).toBe(false)
  })

  it('with no prefix, only an empty field is blank', () => {
    expect(isBlankTail('', '')).toBe(true)
    expect(isBlankTail('N', '')).toBe(false)
  })
})
