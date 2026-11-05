// Image cleanup before OCR (server only). sharp ships with Next, so it is always installed.
import sharp from 'sharp'

/** Auto-rotate by EXIF, grayscale, stretch contrast, bring the width into a range Tesseract reads well. Returns PNG. */
export async function preprocessForOcr(bytes: Buffer, rotateDegrees = 0): Promise<Buffer> {
  let img = sharp(bytes, { failOn: 'none' }).rotate() // EXIF orientation
  if (rotateDegrees) img = img.rotate(rotateDegrees, { background: '#ffffff' })
  const buf = await img.grayscale().normalize().toBuffer()
  const { width = 0 } = await sharp(buf).metadata()
  const target = width < 2000 ? 2000 : width > 3600 ? 3200 : 0 // modest upscale for small photos, cap huge ones
  const pipeline = sharp(buf)
  if (target) pipeline.resize({ width: target })
  return pipeline.sharpen().png().toBuffer()
}

/** JPEG for the cloud engine: EXIF-rotated and capped at 3000 px so the request stays far under the 10 MB limit. */
export async function preprocessForCloud(bytes: Buffer): Promise<Buffer> {
  try {
    return await sharp(bytes, { failOn: 'none' }).rotate().resize({ width: 3000, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()
  } catch {
    return bytes
  }
}
