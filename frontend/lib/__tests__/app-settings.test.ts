import { describe, expect, it } from 'vitest'
import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_EQUIPMENT_TYPES,
  equipmentTypeIcon,
  equipmentTypeLabel,
  slugifyEquipmentType,
  validateEquipmentTypes,
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

describe('equipment types', () => {
  it('default list has the renamed labels and Courtesy Vehicle', () => {
    const labels = DEFAULT_EQUIPMENT_TYPES.map((t) => t.label)
    expect(labels).toEqual(
      expect.arrayContaining(['GPU', 'Lavatory Cart', 'Water Cart', 'Air Stairs', 'Courtesy Vehicle'])
    )
    expect(validateEquipmentTypes(DEFAULT_EQUIPMENT_TYPES)).toBeNull()
  })

  it('requires Fuel Truck, a name on every type and unique names', () => {
    expect(validateEquipmentTypes(DEFAULT_EQUIPMENT_TYPES.slice(1))).toMatch(/Fuel Truck/)
    expect(
      validateEquipmentTypes([...DEFAULT_EQUIPMENT_TYPES, { value: 'x', label: ' ', icon: '' }])
    ).toMatch(/needs a name/)
    expect(
      validateEquipmentTypes([...DEFAULT_EQUIPMENT_TYPES, { value: 'x', label: 'tug', icon: '' }])
    ).toMatch(/twice/)
  })

  it('slugifies a label into a unique stored value', () => {
    expect(slugifyEquipmentType('De-icer Truck!', [])).toBe('de_icer_truck')
    expect(slugifyEquipmentType('Tug', ['tug'])).toBe('tug_2')
  })

  it('falls back for a type missing from the list', () => {
    expect(equipmentTypeLabel(DEFAULT_EQUIPMENT_TYPES, 'gpu')).toBe('GPU')
    expect(equipmentTypeLabel([], 'old_type')).toBe('Old Type')
    expect(equipmentTypeIcon([], 'old_type')).toBe('🔧')
  })

  it('reads a stored list, ignoring invalid ones', () => {
    const good = [{ value: 'fuel_truck', label: 'Fuel Truck', icon: '⛽' }, { value: 'deicer', label: 'Deicer', icon: '❄️' }]
    expect(settingsFromRows([{ key: 'equipment_types', value: good }]).equipmentTypes).toEqual(good)
    expect(settingsFromRows([{ key: 'equipment_types', value: 'nope' }]).equipmentTypes).toEqual(
      DEFAULT_EQUIPMENT_TYPES
    )
    expect(
      settingsFromRows([{ key: 'equipment_types', value: [{ value: 'tug', label: 'Tug', icon: '' }] }]).equipmentTypes
    ).toEqual(DEFAULT_EQUIPMENT_TYPES)
  })
})

describe('time zone setting (key timezone)', () => {
  it('defaults to America/Denver', () => {
    expect(DEFAULT_APP_SETTINGS.timeZone).toBe('America/Denver')
    expect(settingsFromRows([]).timeZone).toBe('America/Denver')
  })

  it('reads a stored IANA zone', () => {
    expect(
      settingsFromRows([{ key: 'timezone', value: 'America/Phoenix' }]).timeZone
    ).toBe('America/Phoenix')
    expect(
      settingsFromRows([{ key: 'timezone', value: 'UTC' }]).timeZone
    ).toBe('UTC')
  })

  it('falls back to the default for an unknown zone or a mistyped value', () => {
    expect(
      settingsFromRows([{ key: 'timezone', value: 'Mars/Olympus' }]).timeZone
    ).toBe('America/Denver')
    expect(
      settingsFromRows([{ key: 'timezone', value: 7 }]).timeZone
    ).toBe('America/Denver')
  })
})

describe('user_name_sort setting', () => {
  it('defaults to last name and reads first/last, ignoring junk', async () => {
    const { settingsFromRows, DEFAULT_APP_SETTINGS } = await import('@/lib/app-settings')
    expect(DEFAULT_APP_SETTINGS.userNameSort).toBe('last')
    expect(settingsFromRows([{ key: 'user_name_sort', value: 'first' }]).userNameSort).toBe('first')
    expect(settingsFromRows([{ key: 'user_name_sort', value: 'bogus' }]).userNameSort).toBe('last')
  })
})
