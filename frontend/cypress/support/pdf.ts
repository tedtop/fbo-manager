// A tiny synthetic multi-page PDF built in the test (no fixture file, no customer data): each page is Letter size with
// a heavy border and the text "Page n of N", enough for pdfjs to render a non-blank page.
export function makePdf(pages: number): Uint8Array {
  const objs: string[] = []
  const kids = Array.from({ length: pages }, (_, i) => `${4 + i * 2} 0 R`).join(' ')
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objs[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pages} >>`
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  for (let i = 0; i < pages; i++) {
    const content = `8 w 40 40 532 712 re S BT /F1 36 Tf 80 700 Td (Page ${i + 1} of ${pages}) Tj ET`
    objs[4 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${5 + i * 2} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`
    objs[5 + i * 2] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
  }
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  for (let n = 1; n < objs.length; n++) {
    offsets[n] = out.length
    out += `${n} 0 obj\n${objs[n]}\nendobj\n`
  }
  const xref = out.length
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`
  for (let n = 1; n < objs.length; n++) out += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(out)
}

/** Filenames and content types of the multipart `file` parts in an intercepted request body. */
export function multipartFiles(body: unknown): { name: string; type: string }[] {
  const text = typeof body === 'string' ? body : new TextDecoder('latin1').decode(body as ArrayBuffer)
  const parts: { name: string; type: string }[] = []
  const re = /filename="([^"]+)"\r\nContent-Type: ([^\r\n]+)/g
  for (let m = re.exec(text); m; m = re.exec(text)) parts.push({ name: m[1], type: m[2] })
  return parts
}
