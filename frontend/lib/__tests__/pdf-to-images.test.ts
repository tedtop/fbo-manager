import { describe, expect, it, vi } from 'vitest'
import {
  MAX_PAGE_SIDE_PX,
  MAX_PDF_PAGES,
  expandPdfs,
  isPdfFile,
  pageCapMessage,
  pageFileName,
  pdfErrorMessage,
  renderScale,
} from '../pdf-to-images'

const file = (name: string, type: string) => new File(['x'], name, { type })

describe('pdf-to-images helpers', () => {
  it('names pages after the pdf', () => {
    expect(pageFileName('Truck Sheets.pdf', 2)).toBe('Truck Sheets-p2.jpg')
    expect(pageFileName('.PDF', 1)).toBe('scan-p1.jpg')
  })

  it('detects pdfs by type or by extension when the type is empty', () => {
    expect(isPdfFile(file('a.pdf', 'application/pdf'))).toBe(true)
    expect(isPdfFile(file('a.PDF', ''))).toBe(true)
    expect(isPdfFile(file('a.jpg', 'image/jpeg'))).toBe(false)
  })

  it('scales the longest side to the cap', () => {
    const s = renderScale(612, 792)
    expect(792 * s).toBeCloseTo(MAX_PAGE_SIDE_PX)
    expect(renderScale(0, 0)).toBe(1)
  })

  it('maps pdfjs errors to clear messages', () => {
    expect(pdfErrorMessage({ name: 'PasswordException' }, 'a.pdf')).toMatch(/password-protected/)
    expect(pdfErrorMessage({ name: 'InvalidPDFException' }, 'a.pdf')).toMatch(/could not be read/)
    expect(pdfErrorMessage(new Error('boom'), 'a.pdf')).toMatch(/Could not prepare a.pdf/)
  })

  it('page cap message names the cap', () => {
    expect(pageCapMessage('a.pdf', 30)).toContain(`first ${MAX_PDF_PAGES}`)
  })
})

describe('expandPdfs', () => {
  it('passes images through and expands pdfs in order, collecting notices', async () => {
    const img = file('a.jpg', 'image/jpeg')
    const pdf = file('b.pdf', 'application/pdf')
    const convert = vi.fn(async () => ({
      files: [file('b-p1.jpg', 'image/jpeg'), file('b-p2.jpg', 'image/jpeg')],
      notice: 'capped',
    }))
    const out = await expandPdfs([img, pdf, file('c.png', 'image/png')], undefined, convert)
    expect(out.files.map((f) => f.name)).toEqual(['a.jpg', 'b-p1.jpg', 'b-p2.jpg', 'c.png'])
    expect(out.notices).toEqual(['capped'])
    expect(convert).toHaveBeenCalledTimes(1)
  })

  it('propagates conversion errors', async () => {
    const convert = vi.fn(async () => {
      throw new Error('locked')
    })
    await expect(expandPdfs([file('b.pdf', 'application/pdf')], undefined, convert)).rejects.toThrow('locked')
  })
})
