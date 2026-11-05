// Client-only helpers: render a scanned page upright as a JPEG and hash it.
import { type Rotation, fitScale, rotatedSize } from '@/lib/truck-sheet/rotation'

export const UPRIGHT_MAX_SIDE_PX = 3000
export const UPRIGHT_JPEG_QUALITY = 0.85

/**
 * Draws `source` (a photo or a rendered PDF page; the browser applies EXIF orientation, like the server's sharp.rotate())
 * turned clockwise by `rotation`, as a JPEG whose longest side is at most `maxSide` (never enlarged).
 */
export async function renderUpright(
  source: Blob,
  rotation: Rotation,
  maxSide = UPRIGHT_MAX_SIDE_PX
): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(source)
  try {
    const scale = fitScale(bitmap.width, bitmap.height, maxSide)
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const out = rotatedSize(w, h, rotation)
    const canvas = document.createElement('canvas')
    canvas.width = out.width
    canvas.height = out.height
    try {
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('canvas not available')
      ctx.translate(out.width / 2, out.height / 2)
      ctx.rotate((rotation * Math.PI) / 180)
      ctx.drawImage(bitmap, -w / 2, -h / 2, w, h)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', UPRIGHT_JPEG_QUALITY))
      if (!blob) throw new Error('canvas export failed')
      return { blob, width: out.width, height: out.height }
    } finally {
      canvas.width = 0
      canvas.height = 0
    }
  } finally {
    bitmap.close()
  }
}

/** Lower-case hex SHA-256 of the blob's bytes. */
export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
