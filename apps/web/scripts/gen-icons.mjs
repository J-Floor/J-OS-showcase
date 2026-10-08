// Generate the PWA icon suite from public/pwa-source.svg (a dark "J" mark on a
// white square). Deterministic and self-contained on `sharp` (already a
// devDependency) — the @vite-pwa/assets-generator "transparent" preset forces
// an alpha channel we do not want, so we render every variant here instead.
//
// Run from apps/web with `bun run icons:gen`, or from the repo root with
// `bun run --filter @j-os/web icons:gen`.
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import sharp from 'sharp'

const dir = path.dirname(fileURLToPath(import.meta.url))
const pub = path.join(dir, '..', 'public')
const source = path.join(pub, 'pwa-source.svg')
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 }

async function flat(size, out) {
  await sharp(source, { density: 512 })
    .resize(size, size, { fit: 'contain', background: WHITE })
    .flatten({ background: WHITE })
    .png()
    .toFile(path.join(pub, out))
}

// Maskable: glyph inside the 80% safe zone, white bleed to the edges.
async function maskable(size, out) {
  const inner = Math.round(size * 0.8)
  const glyph = await sharp(source, { density: 512 })
    .resize(inner, inner, { fit: 'contain', background: WHITE })
    .flatten({ background: WHITE })
    .png()
    .toBuffer()
  await sharp({
    create: { width: size, height: size, channels: 3, background: WHITE },
  })
    .composite([{ input: glyph, gravity: 'centre' }])
    .png()
    .toFile(path.join(pub, out))
}

await flat(64, 'pwa-64x64.png')
await flat(192, 'pwa-192x192.png')
await flat(512, 'pwa-512x512.png')
await flat(180, 'apple-touch-icon-180x180.png')
await maskable(512, 'maskable-icon-512x512.png')
console.log('PWA icons generated')
