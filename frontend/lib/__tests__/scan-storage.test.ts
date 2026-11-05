import { describe, expect, it } from 'vitest'
import { buildScheduleSheetPath, buildTruckSheetPath, extensionFor, hash8, sanitizeTruckNo, validDate } from '../scan-storage'

const SHA = 'ab12cd34ef56'.padEnd(64, '0')

describe('scan storage paths', () => {
  const base = { date: '2026-07-14', truckNo: '5282', sha256: SHA }

  it('builds the dated per-truck page, thumb and original paths with the 8-char hash', () => {
    const dir = 'truck_sheet/2026/07/2026-07-14/truck-5282'
    expect(buildTruckSheetPath({ ...base, folder: 'pages', page: 2 })).toBe(`${dir}/pages/2026-07-14_truck-5282_p2_ab12cd34.jpg`)
    expect(buildTruckSheetPath({ ...base, folder: 'thumbs', page: 2 })).toBe(`${dir}/thumbs/2026-07-14_truck-5282_p2_ab12cd34.jpg`)
    expect(buildTruckSheetPath({ ...base, folder: 'original', ext: 'pdf' })).toBe(`${dir}/original/2026-07-14_truck-5282_scan-ab12cd34.pdf`)
  })

  it('is idempotent for identical bytes and different for different bytes', () => {
    const a = buildTruckSheetPath({ ...base, folder: 'pages', page: 1 })
    expect(buildTruckSheetPath({ ...base, folder: 'pages', page: 1 })).toBe(a)
    expect(buildTruckSheetPath({ ...base, sha256: 'ff'.repeat(32), folder: 'pages', page: 1 })).not.toBe(a)
  })

  it('hash8 takes the first 8 hex chars and rejects anything else', () => {
    expect(hash8(SHA.toUpperCase())).toBe('ab12cd34')
    expect(() => hash8('../../x')).toThrow()
  })

  it('sanitizes the truck number so it cannot escape the folder', () => {
    expect(sanitizeTruckNo(' 52/../82 ')).toBe('5282')
    expect(sanitizeTruckNo('jet-1')).toBe('JET1')
    expect(sanitizeTruckNo('../')).toBeNull()
    expect(sanitizeTruckNo('')).toBeNull()
    const p = buildTruckSheetPath({ ...base, truckNo: '../../etc', folder: 'pages' })
    expect(p).toBe('truck_sheet/2026/07/2026-07-14/truck-ETC/pages/2026-07-14_truck-ETC_p1_ab12cd34.jpg')
    expect(p).not.toContain('..')
  })

  it('accepts only real calendar dates', () => {
    expect(validDate('2026-02-29')).toBeNull()
    expect(validDate('2028-02-29')).toBe('2028-02-29')
    expect(validDate('2026-13-01')).toBeNull()
    expect(validDate('../2026-07-14')).toBeNull()
    expect(validDate(null)).toBeNull()
  })

  it('uses the unassigned holding folder when date or truck is not valid', () => {
    expect(buildTruckSheetPath({ ...base, date: null, folder: 'pages', page: 1, scanDay: '2026-11-05' })).toBe(
      'truck_sheet/unassigned/2026-11-05/pages/2026-11-05_p1_ab12cd34.jpg'
    )
    expect(buildTruckSheetPath({ ...base, truckNo: '', folder: 'original', ext: 'jpg', scanDay: '2026-11-05' })).toBe(
      'truck_sheet/unassigned/2026-11-05/original/2026-11-05_scan-ab12cd34.jpg'
    )
  })

  it('lays out schedule sheets by date with the same subfolders', () => {
    expect(buildScheduleSheetPath({ folder: 'original', date: '2026-11-04', sha256: SHA, ext: 'jpg' })).toBe(
      'schedule_sheet/2026/11/2026-11-04/original/2026-11-04_schedule_scan-ab12cd34.jpg'
    )
    expect(buildScheduleSheetPath({ folder: 'thumbs', date: '2026-11-04', sha256: SHA, page: 3 })).toBe(
      'schedule_sheet/2026/11/2026-11-04/thumbs/2026-11-04_schedule_p3_ab12cd34.jpg'
    )
  })

  it('whitelists extensions', () => {
    expect(extensionFor('application/pdf')).toBe('pdf')
    expect(extensionFor('', 'IMG_1.JPEG')).toBe('jpg')
    expect(extensionFor('application/x-evil', 'a.exe')).toBe('bin')
  })
})
