import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'resources')
mkdirSync(outDir, { recursive: true })

function inRoundedRect(x, y, size, radius) {
  const min = radius
  const max = size - 1 - radius
  if ((x >= min && x <= max) || (y >= min && y <= max)) return true
  const cx = x < min ? min : max
  const cy = y < min ? min : max
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius * radius
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  const lengthSq = dx * dx + dy * dy
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

function makeIcon(size) {
  const png = new PNG({ width: size, height: size })
  const radius = size * 0.22
  const stroke = size * 0.055
  const s = size

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const idx = (size * y + x) << 2
      if (!inRoundedRect(x, y, size, radius)) {
        png.data[idx + 3] = 0
        continue
      }

      const d1 = distToSegment(x, y, 0.28 * s, 0.52 * s, 0.44 * s, 0.68 * s)
      const d2 = distToSegment(x, y, 0.44 * s, 0.68 * s, 0.73 * s, 0.34 * s)
      const onCheck = Math.min(d1, d2) <= stroke

      if (onCheck) {
        png.data[idx] = 255
        png.data[idx + 1] = 255
        png.data[idx + 2] = 255
      } else {
        png.data[idx] = 47
        png.data[idx + 1] = 111
        png.data[idx + 2] = 237
      }
      png.data[idx + 3] = 255
    }
  }

  return PNG.sync.write(png)
}

writeFileSync(join(outDir, 'icon.png'), makeIcon(256))
writeFileSync(join(outDir, 'tray.png'), makeIcon(32))

console.log('icons written to resources/')
