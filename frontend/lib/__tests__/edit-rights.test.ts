import { describe, expect, it } from 'vitest'
import { canManageLineSchedule, canManageModule, canManageTraining } from '../edit-rights'

// Access maps as resolved from roles by findModuleAccessForUser / get_my_access.
const administrator = {
  equipment: 'manage', invoicing: 'manage', training: 'manage', parking: 'manage', flight_operations: 'manage',
  line_schedule: 'manage', truck_sheets: 'manage', fuel_farm: 'manage', users: 'manage'
} as const
const lineDepartment = { flight_operations: 'view', parking: 'view', line_schedule: 'view', training: 'view' } as const

describe('edit rights from roles (B140)', () => {
  it('Administrator edits line schedule and training; needs no legacy users row', () => {
    expect(canManageLineSchedule({ ...administrator })).toBe(true)
    expect(canManageTraining({ ...administrator })).toBe(true)
  })

  it('a manager of one module does not get the other', () => {
    expect(canManageLineSchedule({ line_schedule: 'manage' })).toBe(true)
    expect(canManageTraining({ line_schedule: 'manage' })).toBe(false)
  })

  it('a line department user (view only) cannot manage either module', () => {
    expect(canManageLineSchedule({ ...lineDepartment })).toBe(false)
    expect(canManageTraining({ ...lineDepartment })).toBe(false)
  })

  it('no role, no access or still loading means no edit rights', () => {
    expect(canManageLineSchedule({})).toBe(false)
    expect(canManageTraining(undefined)).toBe(false)
    expect(canManageModule(null, 'users')).toBe(false)
  })
})
