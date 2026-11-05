// Client-only helpers: render a scanned page upright as a JPEG and hash it.
import { type Rotation, fitScale, rotatedSize } from '@/lib/truck-sheet/rotation'

export const UPRIGHT_MAX_SIDE_PX = 3000
export const UPRIGHT_JPEG_QUALITY = 0.92
export const THUMB_WIDTH_PX = 400
export const THUMB_JPEG_QUALITY = 0.8

/**
 * Draws `source` (a photo or a rendered PDF page; the browser applies EXIF orientation, like the server's sharp.rotate())
 * turned clockwise by `rotation`, as a JPEG whose longest side is at most `maxSide` (never enlarged).
 */
export async function renderUpright(
  source: Blob,
  rotation: Rotation,
  maxSide = UPRIGHT_MAX_SIDE_PX
): Promise<{ blob: Blob; thumb: Blob; width: number; height: number }> {
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
      // thumbnail from the same canvas pass (400 px wide, never enlarged)
      const tw = Math.min(THUMB_WIDTH_PX, out.width)
      const th = Math.max(1, Math.round((out.height * tw) / out.width))
      const small = document.createElement('canvas')
      small.width = tw
      small.height = th
      const sctx = small.getContext('2d')
      if (!sctx) throw new Error('canvas not available')
      sctx.drawImage(canvas, 0, 0, tw, th)
      const thumb = await new Promise<Blob | null>((resolve) => small.toBlob(resolve, 'image/jpeg', THUMB_JPEG_QUALITY))
      small.width = 0
      small.height = 0
      if (!thumb) throw new Error('canvas export failed')
      return { blob, thumb, width: out.width, height: out.height }
    } finally {
      canvas.width = 0
      canvas.height = 0
    }
  } finally {
    bitmap.close()
  }
}

export { sha256Hex } from '@/lib/scan-storage'
