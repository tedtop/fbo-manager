import { describe, expect, it } from 'vitest'
import type { MemberWithUser } from '@/repositories/departments.repo'
import type { ScheduleShiftRow } from '@/repositories/schedule.repo'
import {
  addDaysISO,
  canEditAnyShift,
  canEditShiftFor,
  canEditWholeDepartment,
  coverageForDate,
  formatShiftRange,
  hoursByUser,
  isOvernight,
  shiftCategory,
  shiftDurationHours,
  shiftTouchesDate,
  type SchedulePermissionContext,
} from '@/services/schedule.service'

let id = 0
const shift = (over: Partial<ScheduleShiftRow>): ScheduleShiftRow => ({
  id: ++id,
  department_id: 1,
  user_id: 10,
  shift_date: '2026-11-09',
  start_time: '05:00:00',
  end_time: '15:00:00',
  notes: '',
  created_by: null,
  updated_by: null,
  created_at: '',
  updated_at: '',
  ...over,
} as ScheduleShiftRow)

const member = (dept_role: 'lead' | 'supervisor' | 'member'): MemberWithUser =>
  ({ id: 1, department_id: 1, user_id: 10, dept_role, is_active: true, user: null }) as unknown as MemberWithUser

const ctx = (over: Partial<SchedulePermissionContext>): SchedulePermissionContext => ({
  currentUser: { id: 10, role: 'line' },
  membership: member('member'),
  settings: {},
  ...over,
})

describe('shift time math', () => {
  it('treats end <= start as an overnight shift', () => {
    expect(isOvernight('22:00', '08:00')).toBe(true)
    expect(isOvernight('08:00', '08:00')).toBe(true)
    expect(isOvernight('05:00', '15:00')).toBe(false)
  })

  it('computes durations, wrapping past midnight', () => {
    expect(shiftDurationHours('05:00', '15:00')).toBe(10)
    expect(shiftDurationHours('22:00', '08:00')).toBe(10)
    expect(shiftDurationHours('14:00', '21:30')).toBe(7.5)
  })

  it('formats ranges the way line crews write them', () => {
    expect(formatShiftRange('05:00:00', '15:00:00')).toBe('0500–1500')
    expect(formatShiftRange('22:00', '08:00')).toBe('2200–0800')
  })

  it('shifts by calendar day across month and year ends', () => {
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28')
  })

  it.each([
    ['05:00', 'morning'],
    ['09:00', 'day'],
    ['13:00', 'swing'],
    ['20:00', 'night'],
    ['02:00', 'night'],
  ])('%s starts a %s shift', (start, category) => {
    expect(shiftCategory(start)).toBe(category)
  })
})

describe('hoursByUser', () => {
  it('sums per user over the range and ignores shifts outside it', () => {
    const shifts = [
      shift({ user_id: 1, shift_date: '2026-11-09', start_time: '05:00', end_time: '15:00' }),
      shift({ user_id: 1, shift_date: '2026-11-10', start_time: '22:00', end_time: '08:00' }),
      shift({ user_id: 2, shift_date: '2026-11-09', start_time: '14:00', end_time: '21:30' }),
      shift({ user_id: 2, shift_date: '2026-11-16', start_time: '05:00', end_time: '15:00' }), // next week
      shift({ user_id: 2, shift_date: '2026-11-08', start_time: '05:00', end_time: '15:00' }), // the day before
    ]
    const totals = hoursByUser(shifts, '2026-11-09', '2026-11-15')
    expect(totals.get(1)).toBe(20)
    expect(totals.get(2)).toBe(7.5)
  })
})

describe('coverageForDate', () => {
  it('counts a day shift in the hours it covers, end hour excluded', () => {
    const c = coverageForDate([shift({ start_time: '05:00', end_time: '15:00' })], '2026-11-09')
    expect(c.slice(0, 5)).toEqual([0, 0, 0, 0, 0])
    expect(c[5]).toBe(1)
    expect(c[14]).toBe(1)
    expect(c[15]).toBe(0)
  })

  it('splits an overnight shift: the evening on its own day, the morning tail on the next', () => {
    const overnight = shift({ shift_date: '2026-11-09', start_time: '22:00', end_time: '08:00' })
    const sameDay = coverageForDate([overnight], '2026-11-09')
    const nextDay = coverageForDate([overnight], '2026-11-10')
    expect(sameDay[21]).toBe(0)
    expect(sameDay[22]).toBe(1)
    expect(sameDay[23]).toBe(1)
    expect(nextDay[0]).toBe(1)
    expect(nextDay[7]).toBe(1)
    expect(nextDay[8]).toBe(0)
  })

  it('stacks overlapping shifts into a headcount', () => {
    const c = coverageForDate(
      [shift({ start_time: '05:00', end_time: '15:00' }), shift({ user_id: 11, start_time: '10:00', end_time: '20:00' })],
      '2026-11-09'
    )
    expect(c[4]).toBe(0)
    expect(c[9]).toBe(1)
    expect(c[12]).toBe(2)
    expect(c[17]).toBe(1)
  })

  it('touches the next date only for overnight shifts', () => {
    const overnight = shift({ shift_date: '2026-11-09', start_time: '22:00', end_time: '08:00' })
    const day = shift({ shift_date: '2026-11-09', start_time: '05:00', end_time: '15:00' })
    expect(shiftTouchesDate(overnight, '2026-11-10')).toBe(true)
    expect(shiftTouchesDate(day, '2026-11-10')).toBe(false)
    expect(shiftTouchesDate(day, '2026-11-09')).toBe(true)
  })
})

describe('permissions', () => {
  it('lets an admin edit anyone, with or without a membership', () => {
    const c = ctx({ currentUser: { id: 1, role: 'admin' }, membership: null })
    expect(canEditShiftFor(c, 99)).toBe(true)
    expect(canEditAnyShift(c)).toBe(true)
    expect(canEditWholeDepartment(c)).toBe(true)
  })

  it('lets a lead or supervisor edit the whole department by default', () => {
    for (const role of ['lead', 'supervisor'] as const) {
      const c = ctx({ membership: member(role) })
      expect(canEditShiftFor(c, 99)).toBe(true)
      expect(canEditWholeDepartment(c)).toBe(true)
    }
  })

  it('lets a plain member edit only their own shifts (self-edit on by default)', () => {
    const c = ctx({})
    expect(canEditShiftFor(c, 10)).toBe(true)
    expect(canEditShiftFor(c, 99)).toBe(false)
    expect(canEditAnyShift(c)).toBe(true)
    expect(canEditWholeDepartment(c)).toBe(false)
  })

  it('removes self-edit when the department turns it off', () => {
    const c = ctx({ settings: { allow_self_edit: false } })
    expect(canEditShiftFor(c, 10)).toBe(false)
    expect(canEditAnyShift(c)).toBe(false)
  })

  it('honours custom edit_roles', () => {
    const memberCanEdit = ctx({ settings: { edit_roles: ['member'] } })
    expect(canEditWholeDepartment(memberCanEdit)).toBe(true)
    const leadCannot = ctx({ membership: member('lead'), settings: { edit_roles: ['supervisor'], allow_self_edit: false } })
    expect(canEditAnyShift(leadCannot)).toBe(false)
  })

  it('gives a signed-out visitor nothing, and a non-member no self-service', () => {
    expect(canEditShiftFor(ctx({ currentUser: null }), 10)).toBe(false)
    expect(canEditAnyShift(ctx({ currentUser: null }))).toBe(false)
    expect(canEditAnyShift(ctx({ membership: null }))).toBe(false)
  })
})
