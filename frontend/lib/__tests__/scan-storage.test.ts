import { describe, expect, it } from 'vitest'
import { buildScheduleSheetPath, buildTruckSheetOriginalPath, buildTruckSheetPagePath, extensionFor, sanitizeTruckNo, validDate } from '../scan-storage'

describe('scan storage paths', () => {
  it('builds the dated per-truck page path', () => {
    expect(buildTruckSheetPagePath({ date: '2026-07-14', truckNo: '5282', page: 2 })).toBe(
      'truck_sheet/2026/07/2026-07-14/truck-5282/2026-07-14_truck-5282_p2.jpg'
    )
  })

  it('puts the original under original/ with the short id and extension', () => {
    expect(buildTruckSheetOriginalPath({ date: '2026-07-14', truckNo: '5282', shortId: 'ab12cd34', ext: 'pdf' })).toBe(
      'truck_sheet/2026/07/2026-07-14/truck-5282/original/2026-07-14_truck-5282_ab12cd34.pdf'
    )
  })

  it('adds a suffix instead of reusing a taken name', () => {
    expect(buildTruckSheetPagePath({ date: '2026-07-14', truckNo: '5282', page: 1, suffix: 'x9' })).toMatch(/_p1-x9\.jpg$/)
  })

  it('sanitizes the truck number so it cannot escape the folder', () => {
    expect(sanitizeTruckNo(' 52/../82 ')).toBe('5282')
    expect(sanitizeTruckNo('jet-1')).toBe('JET1')
    expect(sanitizeTruckNo('../')).toBeNull()
    expect(sanitizeTruckNo('')).toBeNull()
    const p = buildTruckSheetPagePath({ date: '2026-07-14', truckNo: '../../etc', page: 1 })
    expect(p).toBe('truck_sheet/2026/07/2026-07-14/truck-ETC/2026-07-14_truck-ETC_p1.jpg')
    expect(p).not.toContain('..')
  })

  it('accepts only real calendar dates', () => {
    expect(validDate('2026-02-29')).toBeNull()
    expect(validDate('2028-02-29')).toBe('2028-02-29')
    expect(validDate('2026-13-01')).toBeNull()
    expect(validDate('26-07-14')).toBeNull()
    expect(validDate('../2026-07-14')).toBeNull()
    expect(validDate(null)).toBeNull()
  })

  it('uses the unassigned holding folder when date or truck is not valid', () => {
    expect(buildTruckSheetPagePath({ date: null, truckNo: '5282', page: 1, scanDay: '2026-11-05', suffix: 'abc' })).toBe(
      'truck_sheet/unassigned/2026-11-05/2026-11-05_abc_p1.jpg'
    )
    expect(buildTruckSheetPagePath({ date: '2026-07-14', truckNo: '', page: 3, scanDay: '2026-11-05' })).toMatch(
      /^truck_sheet\/unassigned\/2026-11-05\/2026-11-05_[0-9a-f]{8}_p3\.jpg$/
    )
    expect(buildTruckSheetOriginalPath({ date: 'nope', truckNo: '1', shortId: 'q1', ext: 'jpg', scanDay: '2026-11-05' })).toBe(
      'truck_sheet/unassigned/2026-11-05/original/2026-11-05_q1.jpg'
    )
  })

  it('lays out schedule sheets by date', () => {
    expect(buildScheduleSheetPath({ date: '2026-11-04', shortId: 'a1b2', ext: 'jpg' })).toBe(
      'schedule_sheet/2026/11/2026-11-04/2026-11-04_schedule_a1b2.jpg'
    )
  })

  it('whitelists extensions', () => {
    expect(extensionFor('application/pdf')).toBe('pdf')
    expect(extensionFor('', 'IMG_1.JPEG')).toBe('jpg')
    expect(extensionFor('application/x-evil', 'a.exe')).toBe('bin')
  })
})
