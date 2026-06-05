/**
 * Genera el set completo de iconos + OG image desde los PNG source.
 *
 * Source:
 *   public/Logo_DC_Bikes_Circular.png  (logo circular)  -> favicons + og-image (1200x630 letterbox)
 *
 * Out (todos en public/):
 *   favicon-16.png, favicon-32.png, favicon-192.png, favicon-512.png
 *   apple-touch-icon.png  (180x180)
 *   og-image.webp         (1200x630, q82, ~50KB)
 *   og-image.jpg          (1200x630, q82, fallback)
 *
 * Se ejecuta en `prebuild` para que Vite los copie a dist/ en `vite build`.
 */

import sharp from 'sharp'
import { existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const PUB   = join(__dir, '..', 'public')

// Fuente única: el logo circular de marca (favicons de la pestaña/PWA + og-image).
const SRC_LOGO = join(PUB, 'Logo_DC_Bikes_Circular.png')
const SRC_OG   = join(PUB, 'Logo_DC_Bikes_Circular.png')

if (!existsSync(SRC_LOGO)) {
  console.error(`[generate-images] Falta el source: ${SRC_LOGO}`)
  process.exit(1)
}
if (!existsSync(SRC_OG)) {
  console.error(`[generate-images] Falta el source: ${SRC_OG}`)
  process.exit(1)
}

const BG = { r: 10, g: 14, b: 26, alpha: 1 } // #0a0e1a (theme oscuro)

// palette: true (PNG-8) ahorra bytes en tamaños pequeños sin halos visibles.
// En tamaños ≥180px con bordes suaves puede producir banding, así que usamos PNG-24 ahí.
const FAVICONS = [
  { size:  16, out: 'favicon-16.png',         palette: true  },
  { size:  32, out: 'favicon-32.png',         palette: true  },
  { size: 180, out: 'apple-touch-icon.png',   palette: false },
  { size: 192, out: 'favicon-192.png',        palette: false },
  { size: 512, out: 'favicon-512.png',        palette: false },
]

async function buildFavicons() {
  for (const { size, out, palette } of FAVICONS) {
    const target = join(PUB, out)
    await sharp(SRC_LOGO)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9, palette })
      .toFile(target)
    const kb = (statSync(target).size / 1024).toFixed(1)
    console.log(`  favicons  ${out.padEnd(22)} ${size}x${size}  ${kb}KB`)
  }
}

async function buildOgImage() {
  // 1200x630 con letterbox sobre el bg de marca para evitar deformación
  const fitted = await sharp(SRC_OG)
    .resize(1100, 530, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer()

  const webp = join(PUB, 'og-image.webp')
  const jpg  = join(PUB, 'og-image.jpg')

  await sharp({ create: { width: 1200, height: 630, channels: 4, background: BG } })
    .composite([{ input: fitted, gravity: 'center' }])
    .webp({ quality: 82, effort: 6 })
    .toFile(webp)

  await sharp({ create: { width: 1200, height: 630, channels: 4, background: BG } })
    .composite([{ input: fitted, gravity: 'center' }])
    .jpeg({ quality: 82, progressive: true, mozjpeg: true })
    .toFile(jpg)

  const kbWebp = (statSync(webp).size / 1024).toFixed(1)
  const kbJpg  = (statSync(jpg).size  / 1024).toFixed(1)
  console.log(`  og-image  og-image.webp           1200x630  ${kbWebp}KB`)
  console.log(`  og-image  og-image.jpg            1200x630  ${kbJpg}KB`)
}

try {
  console.log('\nGenerando assets de marca...')
  await buildFavicons()
  await buildOgImage()
  console.log('OK\n')
} catch (err) {
  console.error('\n[generate-images] FAIL:', err.message)
  process.exit(1)
}
