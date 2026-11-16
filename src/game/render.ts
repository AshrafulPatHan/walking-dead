import {
  PALETTE,
  VIEW_H,
  VIEW_W,
  WEAPONS,
} from './constants'
import { GameEngine } from './engine'
import { hash01, hashRange } from './rng'
import { groundHeightAt } from './world'
import type { Particle, Pickup, Prop, Zombie } from './types'

// ─────────────────────────────────────────────────────────────
// Small pixel utilities
// ─────────────────────────────────────────────────────────────

const DIGITS: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '001', '001', '001'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  A: ['010', '101', '111', '101', '101'],
  B: ['110', '101', '110', '101', '110'],
  C: ['011', '100', '100', '100', '011'],
  D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'],
  F: ['111', '100', '110', '100', '100'],
  G: ['011', '100', '101', '101', '011'],
  H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'],
  J: ['001', '001', '001', '101', '010'],
  K: ['101', '101', '110', '101', '101'],
  L: ['100', '100', '100', '100', '111'],
  M: ['101', '111', '111', '101', '101'],
  N: ['101', '111', '111', '111', '101'],
  O: ['010', '101', '101', '101', '010'],
  P: ['110', '101', '110', '100', '100'],
  Q: ['010', '101', '101', '110', '011'],
  R: ['110', '101', '110', '101', '101'],
  S: ['011', '100', '010', '001', '110'],
  T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '011'],
  V: ['101', '101', '101', '101', '010'],
  W: ['101', '101', '111', '111', '101'],
  X: ['101', '101', '010', '101', '101'],
  Y: ['101', '101', '010', '010', '010'],
  Z: ['111', '001', '010', '100', '111'],
  '+': ['000', '010', '111', '010', '000'],
  '-': ['000', '000', '111', '000', '000'],
  '.': ['000', '000', '000', '000', '010'],
  '!': ['010', '010', '010', '000', '010'],
  ' ': ['000', '000', '000', '000', '000'],
}

function drawPixelText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  scale = 1,
  alpha = 1,
): void {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  let cursor = Math.round(x)
  const startY = Math.round(y)
  for (const raw of text.toUpperCase()) {
    const glyph = DIGITS[raw] ?? DIGITS[' ']
    for (let row = 0; row < glyph.length; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        if (glyph[row][col] === '1') {
          ctx.fillRect(cursor + col * scale, startY + row * scale, scale, scale)
        }
      }
    }
    cursor += 4 * scale
  }
  ctx.restore()
}

function textWidth(text: string, scale = 1): number {
  return Math.max(0, text.length * 4 - 1) * scale
}

const SKY_BANDS = [
  '#04060b',
  '#060a12',
  '#080e19',
  '#0b1422',
  '#101b2c',
  '#152235',
  '#1d2b3f',
  '#29364a',
  '#3a3b48',
  '#513f42',
  '#6d463d',
  '#8a4f3c',
  '#a35b41',
]

function drawSky(ctx: CanvasRenderingContext2D): void {
  const horizon = 206
  const weights = [0.14, 0.1, 0.11, 0.1, 0.1, 0.09, 0.08, 0.07, 0.06, 0.05, 0.04, 0.03, 0.03]
  let y = 0
  for (let i = 0; i < SKY_BANDS.length; i += 1) {
    const h = Math.ceil(weights[i] * horizon)
    ctx.fillStyle = SKY_BANDS[i]
    ctx.fillRect(0, y, VIEW_W, h + 1)
    y += h
    if (i === SKY_BANDS.length - 1) {
      ctx.fillRect(0, y - 1, VIEW_W, horizon - y + 1)
    }
  }
  ctx.fillStyle = SKY_BANDS[SKY_BANDS.length - 1]
  ctx.fillRect(0, horizon - 2, VIEW_W, VIEW_H - horizon + 2)
}

/** Warm dusk light trapped under the cloud deck. */
function drawHorizonHaze(ctx: CanvasRenderingContext2D, time: number): void {
  const bands = [
    { y: 158, h: 10, alpha: 0.04 },
    { y: 170, h: 10, alpha: 0.06 },
    { y: 182, h: 8, alpha: 0.09 },
    { y: 192, h: 6, alpha: 0.12 },
    { y: 199, h: 5, alpha: 0.18 },
  ]
  for (const band of bands) {
    ctx.fillStyle = `rgba(224,132,84,${band.alpha + Math.sin(time * 0.2 + band.y) * 0.01})`
    ctx.fillRect(0, band.y, VIEW_W, band.h)
  }
  // A smear of warm light behind the town skyline.
  ctx.globalAlpha = 0.12
  ctx.fillStyle = '#e08a55'
  ctx.fillRect(250, 188, 190, 8)
  ctx.fillRect(300, 184, 90, 4)
  ctx.globalAlpha = 1
}

function drawMoon(ctx: CanvasRenderingContext2D, time: number): void {
  const cx = 374
  const cy = 49
  const r = 17

  // Soft atmospheric glow. A gradient avoids the hard "grey disc" the stepped
  // halo rings used to leave around the moon.
  const halo = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 3.2)
  halo.addColorStop(0, 'rgba(255,226,180,0.2)')
  halo.addColorStop(0.32, 'rgba(247,206,156,0.09)')
  halo.addColorStop(0.66, 'rgba(214,168,124,0.03)')
  halo.addColorStop(1, 'rgba(190,148,108,0)')
  ctx.fillStyle = halo
  ctx.fillRect(cx - r * 3.3, cy - r * 3.3, r * 6.6, r * 6.6)

  // Body: one pixel per row so the limb reads as stepped, not sliced.
  for (let dy = -r; dy < r; dy += 1) {
    const half = Math.sqrt(Math.max(0, r * r - dy * dy))
    const t = (dy + r) / (2 * r)
    ctx.fillStyle = t < 0.62 ? PALETTE.moon : t < 0.86 ? '#e2d8b5' : '#cdc19b'
    ctx.fillRect(Math.round(cx - half), cy + dy, Math.round(half * 2), 1)
  }

  // Asymmetric crater field — avoids the accidental "face" pattern.
  ctx.fillStyle = '#c8bc96'
  ctx.fillRect(cx - 8, cy - 5, 5, 3)
  ctx.fillRect(cx + 3, cy - 7, 3, 2)
  ctx.fillRect(cx + 7, cy + 1, 2, 3)
  ctx.fillRect(cx - 2, cy + 4, 4, 2)
  ctx.fillRect(cx - 7, cy + 7, 3, 2)
  ctx.fillStyle = '#d7cca7'
  ctx.fillRect(cx - 7, cy - 4, 3, 1)
  ctx.fillRect(cx + 8, cy + 2, 1, 1)
  ctx.fillStyle = '#b3a781'
  ctx.fillRect(cx + 4, cy - 6, 1, 1)
  ctx.fillRect(cx - 1, cy + 5, 2, 1)
  ctx.fillRect(cx - 6, cy + 8, 1, 1)

  // A thin cloud snagging the lower limb, animated slowly.
  const drift = Math.round(Math.sin(time * 0.08) * 3)
  ctx.fillStyle = 'rgba(20,29,44,0.35)'
  ctx.fillRect(cx - r - 4 + drift, cy + 9, r * 2 + 8, 2)
  ctx.fillStyle = 'rgba(28,39,57,0.28)'
  ctx.fillRect(cx - r + 2 + drift, cy + 11, r * 2 - 4, 2)
}

function stepCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  for (let dy = -r; dy < r; dy += 3) {
    const half = Math.sqrt(Math.max(0, r * r - dy * dy))
    ctx.fillRect(Math.round(cx - half), Math.round(cy + dy), Math.round(half * 2), 3)
  }
}

const STARS = Array.from({ length: 78 }, (_, i) => ({
  x: hashRange(5001, i, 0, VIEW_W),
  y: hashRange(5002, i, 3, 152),
  size: hash01(5003, i) > 0.86 ? 2 : 1,
  phase: hashRange(5004, i, 0, Math.PI * 2),
  speed: hashRange(5005, i, 0.5, 2.2),
}))

function drawStars(ctx: CanvasRenderingContext2D, camX: number, time: number): void {
  for (const star of STARS) {
    const wrapped = ((star.x - camX * 0.015) % VIEW_W + VIEW_W) % VIEW_W
    const twinkle = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(time * star.speed + star.phase))
    ctx.globalAlpha = twinkle * 0.75
    ctx.fillStyle = star.size > 1 ? '#f5e6bd' : '#b9c4cf'
    ctx.fillRect(Math.round(wrapped), Math.round(star.y), star.size, star.size)
    if (star.size > 1) {
      ctx.globalAlpha = twinkle * 0.2
      ctx.fillRect(Math.round(wrapped) - 1, Math.round(star.y) + 1, 3, 1)
      ctx.fillRect(Math.round(wrapped) + 1, Math.round(star.y) - 1, 1, 3)
    }
  }
  ctx.globalAlpha = 1
}

const CLOUDS = Array.from({ length: 7 }, (_, i) => ({
  start: hashRange(6001, i, 0, 860),
  y: hashRange(6002, i, 38, 148),
  width: hashRange(6003, i, 54, 168),
  height: hashRange(6004, i, 4, 10),
  speed: hashRange(6005, i, 0.25, 0.75),
}))

function drawClouds(ctx: CanvasRenderingContext2D, camX: number, time: number): void {
  for (const cloud of CLOUDS) {
    const x = ((cloud.start - camX * 0.045 - time * cloud.speed) % 840 + 840) % 840 - 160
    ctx.globalAlpha = 0.52
    ctx.fillStyle = '#111a28'
    ctx.fillRect(Math.round(x), Math.round(cloud.y), Math.round(cloud.width), Math.round(cloud.height))
    ctx.fillRect(
      Math.round(x + cloud.width * 0.18),
      Math.round(cloud.y - 3),
      Math.round(cloud.width * 0.52),
      3,
    )
    ctx.fillRect(
      Math.round(x + cloud.width * 0.5),
      Math.round(cloud.y + cloud.height),
      Math.round(cloud.width * 0.3),
      2,
    )
    // Faint moonlit rim along the top of the bank.
    ctx.globalAlpha = 0.16
    ctx.fillStyle = '#587494'
    ctx.fillRect(Math.round(x + cloud.width * 0.06), Math.round(cloud.y), Math.round(cloud.width * 0.44), 1)
    ctx.fillRect(
      Math.round(x + cloud.width * 0.22),
      Math.round(cloud.y - 3),
      Math.round(cloud.width * 0.3),
      1,
    )
  }
  ctx.globalAlpha = 1
}

function ridgeHeight(seedOffset: number, x: number, base: number, amplitude: number): number {
  const scale = 74
  const v = x / scale
  const i = Math.floor(v)
  const t = v - i
  const a = hashRange(seedOffset, i, 0, 1)
  const b = hashRange(seedOffset, i + 1, 0, 1)
  const s = t * t * (3 - 2 * t)
  return base - (a + (b - a) * s) * amplitude
}

function drawRidge(
  ctx: CanvasRenderingContext2D,
  camX: number,
  time: number,
  parallax: number,
  seedOffset: number,
  base: number,
  amplitude: number,
  color: string,
): void {
  const offset = camX * parallax
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(0, VIEW_H)
  ctx.lineTo(0, ridgeHeight(seedOffset, offset, base, amplitude))
  for (let x = 0; x <= VIEW_W; x += 4) {
    ctx.lineTo(x, ridgeHeight(seedOffset, offset + x, base, amplitude))
  }
  ctx.lineTo(VIEW_W, VIEW_H)
  ctx.closePath()
  ctx.fill()
  void time
}

function drawHauntedVillage(ctx: CanvasRenderingContext2D, camX: number, time: number, seed: number): void {
  const s = seed >>> 0

  // Far hamlet: a low, almost abstract ridge of rooftops.
  const farParallax = 0.17
  const farSpacing = 152
  const farFirst = Math.floor((camX * farParallax - 100) / farSpacing)
  ctx.fillStyle = '#08111a'
  ctx.globalAlpha = 0.7
  for (let i = farFirst; i < farFirst + 6; i += 1) {
    if (hash01(s ^ 0x51a7, i) < 0.24) continue
    const x = Math.round(i * farSpacing - camX * farParallax + hashRange(s ^ 0x51a8, i, -40, 40))
    const w = Math.round(12 + hashRange(s ^ 0x51a9, i, 0, 30))
    const h = Math.round(8 + hashRange(s ^ 0x51aa, i, 0, 16))
    const baseY = 202 + Math.round(hashRange(s ^ 0x51ab, i, -2, 3))
    ctx.fillRect(x, baseY - h, w, h)
    if (hash01(s ^ 0x51ac, i) > 0.64) {
      ctx.fillRect(x + Math.round(w * 0.5), baseY - h - 5, 2, 5)
      // steeple
      ctx.fillRect(x + Math.round(w * 0.5) - 2, baseY - h - 4, 6, 1)
    }
    if (hash01(s ^ 0x51ad, i) > 0.72) {
      ctx.fillStyle = '#8f6534'
      ctx.fillRect(x + 3 + Math.round(hashRange(s ^ 0x51ae, i, 0, Math.max(1, w - 6))), baseY - h + 3, 1, 2)
      ctx.fillStyle = '#08111a'
    }
  }
  ctx.globalAlpha = 1

  // Near village clusters: crooked houses, a chapel, crooked fences,
  // graveyard markers, dead trees and drifting spectral lights.
  const parallax = 0.31
  const spacing = 330
  const first = Math.floor((camX * parallax - 300) / spacing)
  for (let ci = first; ci < first + 5; ci += 1) {
    if (hash01(s ^ 0x7a11, ci) < 0.22) continue
    const clusterX = ci * spacing - camX * parallax + hashRange(s ^ 0x7a12, ci, -54, 54)
    const baseY = 205.5 + hashRange(s ^ 0x7a13, ci, -2, 2)
    const houseCount = 1 + Math.floor(hash01(s ^ 0x7a14, ci) * 2)

    ctx.globalAlpha = 0.92
    // Crooked fence in front of some plots.
    if (hash01(s ^ 0x7a15, ci) > 0.45) {
      const fenceX = Math.round(clusterX - 34)
      ctx.fillStyle = '#080e14'
      for (let i = 0; i < 52; i += 7) {
        const h = 5 + Math.round(hash01(s ^ 0x7a16, ci + i) * 3)
        ctx.fillRect(fenceX + i, Math.round(baseY - h), 1, h)
      }
      ctx.fillRect(fenceX, Math.round(baseY - 3), 50, 1)
    }

    // A handful of headstones huddle beside the houses.
    const graves = Math.floor(hash01(s ^ 0x7a17, ci) * 5)
    for (let g = 0; g < graves; g += 1) {
      const gx = Math.round(clusterX + 54 + g * (5 + hashRange(s ^ 0x7a18, ci + g, 0, 5)))
      const gh = 3 + Math.round(hash01(s ^ 0x7a19, ci + g) * 3)
      ctx.fillStyle = '#0a1017'
      ctx.fillRect(gx, Math.round(baseY - gh), 2, gh)
      if (hash01(s ^ 0x7a1a, ci + g) > 0.5) ctx.fillRect(gx - 1, Math.round(baseY - gh + 1), 4, 1)
    }

    for (let hi = 0; hi < houseCount; hi += 1) {
      const hx = Math.round(clusterX + hi * (28 + hashRange(s ^ 0x7a1b, ci + hi, 0, 22)))
      const w = Math.round(17 + hashRange(s ^ 0x7a1c, ci + hi, 0, 22))
      const h = Math.round(14 + hashRange(s ^ 0x7a1d, ci + hi, 0, 20))
      const top = Math.round(baseY - h)
      const body = hi % 2 === 0 ? '#0a131d' : '#0c1621'
      ctx.fillStyle = body
      ctx.fillRect(hx, top, w, h)
      // Gabled / broken roofline.
      ctx.fillStyle = '#070d14'
      const peak = Math.round(w * 0.5)
      ctx.fillRect(hx - 2, top, w + 4, 2)
      ctx.fillRect(hx + peak - 3, top - 5, 6, 5)
      ctx.fillRect(hx + peak - 1, top - 9, 2, 4)
      ctx.fillStyle = 'rgba(148, 172, 184, 0.14)'
      ctx.fillRect(hx - 2, top, w + 4, 1)
      ctx.fillRect(hx + peak - 3, top - 5, 6, 1)
      if (hash01(s ^ 0x7a1e, ci + hi) > 0.6) {
        ctx.fillStyle = '#070d14'
        ctx.fillRect(hx + peak + 6, top - 7, 2, 7) // chimney
      }
      // Windows, some lit by something that should not be awake.
      const lit = hash01(s ^ 0x7a1f, ci + hi) > 0.42
      const flicker = 0.72 + 0.28 * Math.sin(time * 3 + ci * 2.1 + hi)
      if (lit) {
        ctx.fillStyle = `rgba(225,166,84,${0.55 + flicker * 0.35})`
        ctx.fillRect(hx + 3, top + 4, 2, 3)
        if (w > 24) ctx.fillRect(hx + w - 6, top + 4, 2, 3)
        const glow = getGlowSprite()
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        ctx.globalAlpha = 0.14 * flicker
        ctx.drawImage(glow, hx - 5, top - 2, 20, 20)
        ctx.restore()
        ctx.globalAlpha = 0.92
      } else {
        ctx.fillStyle = '#0e1a24'
        ctx.fillRect(hx + 3, top + 4, 2, 3)
        if (w > 24) ctx.fillRect(hx + w - 6, top + 4, 2, 3)
      }
      // Doorway and porch.
      ctx.fillStyle = '#060b10'
      ctx.fillRect(hx + Math.round(w * 0.46), top + h - 5, 3, 5)
      if (hash01(s ^ 0x7a20, ci + hi) > 0.55) {
        ctx.fillStyle = '#131b20'
        ctx.fillRect(hx + 2, baseY - 1, w - 4, 1)
      }
    }

    // Chapel every few clusters.
    if (hash01(s ^ 0x7a21, ci) > 0.62) {
      const cx = Math.round(clusterX + 34)
      const cw = 16
      const ch = 24
      const top = Math.round(baseY - ch)
      ctx.fillStyle = '#0a121b'
      ctx.fillRect(cx, top, cw, ch)
      ctx.fillStyle = '#070c12'
      ctx.fillRect(cx - 2, top, cw + 4, 2)
      // Crooked steeple + cross.
      ctx.fillRect(cx + cw - 6, top - 11, 7, 11)
      ctx.fillRect(cx + cw - 4, top - 16, 1, 5)
      ctx.fillRect(cx + cw - 6, top - 14, 5, 1)
      ctx.fillStyle = '#0e1822'
      ctx.fillRect(cx + 3, top + 4, 4, 6)
      if (hash01(s ^ 0x7a22, ci) > 0.4) {
        ctx.fillStyle = 'rgba(201, 141, 74, 0.6)'
        ctx.fillRect(cx + 4, top + 6, 2, 3)
      }
    }

    // A dead tree leaning over the roofs.
    const tx = Math.round(clusterX - 46)
    const th = 18 + Math.round(hashRange(s ^ 0x7a23, ci, 0, 12))
    ctx.fillStyle = '#070d13'
    ctx.fillRect(tx, Math.round(baseY - th), 1, th)
    ctx.fillRect(tx - 4, Math.round(baseY - th * 0.7), 4, 1)
    ctx.fillRect(tx + 1, Math.round(baseY - th * 0.82), 4, 1)
    ctx.fillRect(tx - 2, Math.round(baseY - th * 0.55), 3, 1)

    // Spectral lantern drifting between the graves.
    if (hash01(s ^ 0x7a24, ci) > 0.5) {
      const drift = Math.sin(time * 0.55 + ci * 1.7) * 14
      const lx = clusterX + 24 + drift
      const ly = baseY - 9 - Math.sin(time * 0.9 + ci) * 3
      const glow = getGlowSprite()
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = 0.22 + Math.sin(time * 2.2 + ci) * 0.06
      ctx.drawImage(glow, lx - 9, ly - 9, 18, 18)
      ctx.restore()
      ctx.fillStyle = 'rgba(168,214,182,0.7)'
      ctx.fillRect(Math.round(lx), Math.round(ly), 1, 2)
      ctx.globalAlpha = 0.92
    }
  }
  ctx.globalAlpha = 1

  // Fog creeping around the village foundations.
  ctx.fillStyle = 'rgba(86,108,116,0.055)'
  const fogShift = (camX * 0.12 + time * 2.4) % 80
  for (let x = -80; x < VIEW_W + 80; x += 80) {
    ctx.fillRect(Math.round(x - fogShift), 197, 62, 8)
  }
}

function drawPylons(ctx: CanvasRenderingContext2D, camX: number): void {
  const parallax = 0.19
  const spacing = 196
  const first = Math.floor((camX * parallax - 60) / spacing)
  ctx.strokeStyle = '#081019'
  ctx.fillStyle = '#081019'
  const points: Array<{ x: number; y: number }> = []
  for (let i = first; i < first + 4; i += 1) {
    const x = Math.round(i * spacing - camX * parallax)
    const top = 142 + hashRange(8100, i, -8, 6)
    const base = 202
    ctx.fillRect(x, Math.round(top), 2, base - Math.round(top))
    ctx.fillRect(x - 9, Math.round(top + 7), 20, 1)
    ctx.fillRect(x - 6, Math.round(top + 13), 14, 1)
    ctx.fillRect(x - 10, Math.round(top + 7), 1, 4)
    ctx.fillRect(x + 9, Math.round(top + 7), 1, 4)
    ctx.fillRect(x - 7, Math.round(top + 13), 1, 3)
    ctx.fillRect(x + 6, Math.round(top + 13), 1, 3)
    points.push({ x, y: top + 7 })
  }
  ctx.globalAlpha = 0.65
  ctx.lineWidth = 1
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]
    const b = points[i + 1]
    if (b.x - a.x > spacing * 1.6) continue
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    const midX = (a.x + b.x) / 2
    const sag = 9
    ctx.lineTo(midX, a.y + sag)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(a.x, a.y + 5)
    ctx.lineTo(midX, a.y + sag + 4)
    ctx.lineTo(b.x, b.y + 5)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}


function drawDistantTrees(
  ctx: CanvasRenderingContext2D,
  camX: number,
  parallax: number,
  color: string,
  spacing: number,
  minH: number,
  maxH: number,
): void {
  const seedBase = Math.round(parallax * 1000)
  const first = Math.floor((camX * parallax - 20) / spacing)
  for (let i = first; i < first + Math.ceil(VIEW_W / spacing) + 6; i += 1) {
    const x = Math.round(
      i * spacing - camX * parallax + hashRange(9100 + seedBase, i, -spacing * 0.3, spacing * 0.3),
    )
    const base = 209 + hashRange(9101 + seedBase, i, -5, 4)
    const h = minH + hashRange(9102 + seedBase, i, 0, maxH - minH)
    const half = 2 + hashRange(9103 + seedBase, i, 0, 3.4)
    
    ctx.fillStyle = color
    // Draw trunk/center vertical line
    ctx.fillRect(x, Math.round(base - h), 1, Math.round(h))
    
    // Draw foliage rows from top to bottom of the canopy section
    for (let row = 0; row < h * 0.74; row += 2) {
      // FIXED: spread increases as row increases (narrow top, wide base)
      const spread = Math.max(1, (row / (h * 0.74)) * (half + 4))
      const width = Math.round(spread)
      ctx.fillRect(x - width, Math.round(base - h + row + h * 0.26), width * 2 + 1, 2)
    }
  }
}


// ─────────────────────────────────────────────────────────────
// Cached glows
// ─────────────────────────────────────────────────────────────

let glowSprite: HTMLCanvasElement | null = null

function getGlowSprite(): HTMLCanvasElement {
  if (glowSprite) return glowSprite
  const canvas = document.createElement('canvas')
  canvas.width = 96
  canvas.height = 96
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(48, 48, 2, 48, 48, 47)
  gradient.addColorStop(0, 'rgba(255,208,138,0.75)')
  gradient.addColorStop(0.28, 'rgba(255,190,110,0.3)')
  gradient.addColorStop(0.65, 'rgba(240,160,80,0.08)')
  gradient.addColorStop(1, 'rgba(240,150,70,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 96, 96)
  glowSprite = canvas
  return canvas
}

function drawLampGlow(ctx: CanvasRenderingContext2D, x: number, y: number, strength: number): void {
  const sprite = getGlowSprite()
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = 0.85 * strength
  ctx.drawImage(sprite, Math.round(x - 38), Math.round(y - 38), 76, 76)
  ctx.globalAlpha = 0.4 * strength
  ctx.drawImage(sprite, Math.round(x - 20), Math.round(y - 20), 40, 40)
  ctx.restore()
}

// ─────────────────────────────────────────────────────────────
// Ground
// ─────────────────────────────────────────────────────────────

/** Very-near silhouettes that slide past faster than the world. */
function drawForegroundLayer(
  ctx: CanvasRenderingContext2D,
  camX: number,
  seed: number,
  time: number,
): void {
  const offset = camX * 1.16
  const spacing = 21
  const first = Math.floor(offset / spacing) - 2
  const count = Math.ceil(VIEW_W / spacing) + 6
  for (let i = first; i < first + count; i += 1) {
    const sx = Math.round(i * spacing - offset + hashRange(seed ^ 12100, i, -5, 5))
    if (sx < -12 || sx > VIEW_W + 12) continue
    const h = 4 + Math.round(hash01(seed ^ 12101, i) * 16)
    const dark = hash01(seed ^ 12102, i) > 0.45 ? '#050a08' : '#08100c'
    ctx.fillStyle = dark
    ctx.fillRect(sx, VIEW_H - h, 1, h)
    ctx.fillRect(sx + 3, VIEW_H - h + 4, 1, h - 4)
    ctx.fillRect(sx - 3, VIEW_H - h + 6, 1, h - 6)
    if (h > 12) {
      ctx.fillRect(sx + 1, VIEW_H - h + 2, 1, 2)
      ctx.fillStyle = '#0b1510'
      ctx.fillRect(sx + 6, VIEW_H - h + 8, 1, h - 8)
    }
    if (hash01(seed ^ 12103, i) > 0.86) {
      ctx.fillStyle = '#2c2417'
      ctx.fillRect(sx - 5, VIEW_H - h - 5, 1, h + 5)
      ctx.fillStyle = '#6b4b2c'
      ctx.fillRect(sx - 5, VIEW_H - h - 6, 2, 2)
    }
  }
  void time
}

function drawGround(ctx: CanvasRenderingContext2D, engine: GameEngine, camX: number): void {
  const left = camX - 12
  const right = camX + VIEW_W + 12
  const step = 3

  ctx.beginPath()
  ctx.moveTo(left, groundHeightAt(engine.seed, left))
  for (let x = left; x <= right; x += step) {
    ctx.lineTo(x, groundHeightAt(engine.seed, x))
  }
  ctx.lineTo(right, VIEW_H)
  ctx.lineTo(left, VIEW_H)
  ctx.closePath()
  ctx.fillStyle = PALETTE.dirt
  ctx.fill()

  // Deep dirt bands for a little vertical texture.
  ctx.fillStyle = PALETTE.dirtDark
  for (let x = left; x <= right; x += 10) {
    const gy = groundHeightAt(engine.seed, x) + 22
    const w = 6 + Math.round(hash01(engine.seed ^ 31, Math.floor(x / 10)) * 10)
    ctx.fillRect(x, Math.round(gy), w, 1)
  }
  // Embedded stones in the near bank keep the dark foreground from going flat.
  for (let x = Math.floor((left - 30) / 17) * 17; x <= right; x += 17) {
    const k = Math.floor(x / 17)
    if (hash01(engine.seed ^ 901, k) > 0.55) continue
    const gy = groundHeightAt(engine.seed, x)
    const y = Math.round(gy + 15 + hash01(engine.seed ^ 902, k) * 27)
    const w = 1 + Math.round(hash01(engine.seed ^ 903, k) * 3)
    ctx.fillStyle = hash01(engine.seed ^ 904, k) > 0.5 ? '#1e2329' : '#151a1f'
    ctx.fillRect(x, y, w, 1)
    if (w > 1) {
      ctx.fillStyle = '#2a3037'
      ctx.fillRect(x, y, w - 1, 1)
    }
  }

  ctx.fillStyle = 'rgba(6,8,12,0.42)'
  ctx.beginPath()
  ctx.moveTo(left, groundHeightAt(engine.seed, left) + 44)
  for (let x = left; x <= right; x += 8) {
    ctx.lineTo(x, groundHeightAt(engine.seed, x) + 44 + Math.sin(x * 0.04) * 2)
  }
  ctx.lineTo(right, VIEW_H)
  ctx.lineTo(left, VIEW_H)
  ctx.closePath()
  ctx.fill()

  // Ballast strip
  ctx.beginPath()
  ctx.moveTo(left, groundHeightAt(engine.seed, left) + 2)
  for (let x = left; x <= right; x += step) {
    ctx.lineTo(x, groundHeightAt(engine.seed, x) + 2)
  }
  for (let x = right; x >= left; x -= step) {
    ctx.lineTo(x, groundHeightAt(engine.seed, x) + 11)
  }
  ctx.closePath()
  ctx.fillStyle = PALETTE.ballast
  ctx.fill()

  // Gravel speckles
  for (let x = Math.floor((left - 40) / 7) * 7; x <= right; x += 7) {
    const seed = Math.floor(x / 7)
    const gy = groundHeightAt(engine.seed, x)
    const y = gy + 3 + Math.round(hash01(engine.seed ^ 77, seed) * 8)
    ctx.fillStyle = hash01(engine.seed ^ 78, seed) > 0.5 ? '#32363a' : '#191c20'
    ctx.fillRect(x + 2, Math.round(y), 2, 1)
  }

  // Sleepers
  for (let x = Math.floor((left - 30) / 21) * 21; x <= right; x += 21) {
    const gy = groundHeightAt(engine.seed, x)
    ctx.fillStyle = PALETTE.sleeper
    ctx.fillRect(x, Math.round(gy + 3), 5, 6)
    ctx.fillStyle = '#3a2b20'
    ctx.fillRect(x, Math.round(gy + 3), 5, 1)
  }

  // Rails, drawn as continuous stepped segments.
  for (let x = Math.floor((left - 30) / 8) * 8; x <= right; x += 8) {
    const gy = groundHeightAt(engine.seed, x)
    ctx.fillStyle = PALETTE.railRust
    ctx.fillRect(x, Math.round(gy + 7), 8, 1)
    ctx.fillStyle = PALETTE.railSteel
    ctx.fillRect(x, Math.round(gy + 6), 8, 1)
  }

  // Rain puddles catching the moon between the sleepers.
  for (let x = Math.floor((left - 60) / 53) * 53; x <= right; x += 53) {
    const seed = Math.floor(x / 53)
    if (hash01(engine.seed ^ 555, seed) > 0.42) continue
    const gy = groundHeightAt(engine.seed, x)
    const width = 5 + Math.round(hash01(engine.seed ^ 556, seed) * 8)
    ctx.fillStyle = 'rgba(105,136,150,0.16)'
    ctx.fillRect(x, Math.round(gy + 13), width, 2)
    ctx.fillStyle = 'rgba(170,198,205,0.3)'
    ctx.fillRect(x + 1, Math.round(gy + 13), Math.max(1, width - 3), 1)
  }

  // Surface line + dead grass rim
  ctx.beginPath()
  ctx.moveTo(left, groundHeightAt(engine.seed, left))
  for (let x = left; x <= right; x += step) {
    ctx.lineTo(x, groundHeightAt(engine.seed, x))
  }
  ctx.strokeStyle = PALETTE.groundEdge
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(left, groundHeightAt(engine.seed, left) - 1)
  for (let x = left; x <= right; x += step) {
    ctx.lineTo(x, groundHeightAt(engine.seed, x) - 1)
  }
  ctx.strokeStyle = PALETTE.groundGrass
  ctx.lineWidth = 1
  ctx.stroke()

  // Grass tufts (deterministic, cheap)
  for (let x = Math.floor((left - 20) / 13) * 13; x <= right; x += 13) {
    const seed = Math.floor(x / 13)
    if (hash01(engine.seed ^ 1234, seed) > 0.55) continue
    const gy = groundHeightAt(engine.seed, x)
    const h = 2 + Math.floor(hash01(engine.seed ^ 1235, seed) * 3)
    ctx.fillStyle = hash01(engine.seed ^ 1236, seed) > 0.5 ? '#4a5540' : '#384232'
    ctx.fillRect(x, Math.round(gy - h), 1, h)
    if (hash01(engine.seed ^ 1237, seed) > 0.5) {
      ctx.fillRect(x + 2, Math.round(gy - h + 1), 1, h - 1)
    }
  }
}

function drawForegroundGrass(ctx: CanvasRenderingContext2D, engine: GameEngine, camX: number): void {
  const left = camX - 12
  const right = camX + VIEW_W + 12
  for (let x = Math.floor((left - 18) / 18) * 18; x <= right; x += 18) {
    const seed = Math.floor(x / 18)
    if (hash01(engine.seed ^ 4321, seed) > 0.36) continue
    const gy = groundHeightAt(engine.seed, x)
    const h = 4 + Math.floor(hash01(engine.seed ^ 4322, seed) * 7)
    ctx.fillStyle = '#20281d'
    ctx.fillRect(x, Math.round(gy - h), 1, h)
    ctx.fillRect(x + 2, Math.round(gy - h + 2), 1, h - 2)
    ctx.fillRect(x - 2, Math.round(gy - h + 4), 1, h - 4)
    if (h > 7) {
      ctx.fillStyle = '#2c3726'
      ctx.fillRect(x + 1, Math.round(gy - h + 1), 1, 2)
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

function drawPine(ctx: CanvasRenderingContext2D, x: number, baseY: number, scale: number, seed: number): void {
  const h = Math.round((32 + seed * 26) * scale)
  const maxHalf = Math.round((7 + seed * 5) * scale)
  const trunk = Math.max(1, Math.round(scale))
  ctx.fillStyle = '#1a1511'
  ctx.fillRect(Math.round(x - trunk / 2), Math.round(baseY - h * 0.22), trunk, Math.round(h * 0.24))
  const tiers = 3
  for (let tier = 0; tier < tiers; tier += 1) {
    const top = baseY - h + tier * h * 0.22
    const tierH = h * 0.42
    const halfBase = maxHalf * (0.5 + tier * 0.26)
    for (let row = 0; row < tierH; row += 2) {
      const t = row / tierH
      const half = Math.max(1, Math.round(t * halfBase))
      ctx.fillStyle = tier === 0 ? '#12231f' : '#0e1c1a'
      ctx.fillRect(Math.round(x - half), Math.round(top + row), half * 2 + 1, 2)
    }
    ctx.fillStyle = 'rgba(55,78,66,0.28)'
    for (let row = 0; row < tierH; row += 4) {
      const t = row / tierH
      const half = Math.max(1, Math.round(t * halfBase))
      ctx.fillRect(Math.round(x - half), Math.round(top + row), 1, 2)
    }
  }
  ctx.fillStyle = 'rgba(7,12,12,0.5)'
  ctx.fillRect(Math.round(x), Math.round(baseY - h + 5), 1, Math.round(h * 0.5))
}

function drawDeadTree(ctx: CanvasRenderingContext2D, x: number, baseY: number, scale: number, seed: number): void {
  const h = Math.round((28 + seed * 22) * scale)
  ctx.fillStyle = '#151a19'
  ctx.fillRect(Math.round(x), Math.round(baseY - h), 2, h)
  const branch = (bx: number, by: number, dx: number, dy: number, len: number) => {
    for (let i = 0; i < len; i += 2) {
      ctx.fillRect(Math.round(bx + (dx * i) / len), Math.round(by + (dy * i) / len), 1, 1)
    }
  }
  branch(x, baseY - h * 0.55, -8, -10, 10)
  branch(x, baseY - h * 0.7, 7, -8, 8)
  branch(x + 1, baseY - h * 0.82, -5, -6, 6)
  branch(x, baseY - h * 0.4, 8, -4, 9)
  ctx.fillStyle = '#101514'
  ctx.fillRect(Math.round(x - 1), Math.round(baseY - h * 0.55), 4, 1)
  ctx.fillRect(Math.round(x - 1), Math.round(baseY - h * 0.7), 3, 1)
}

function drawHouse(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  scale: number,
  seed: number,
  variant: number,
  time: number,
): void {
  const w = Math.round(58 * scale)
  const h = Math.round(42 * scale)
  const left = Math.round(x)
  const top = Math.round(baseY - h)
  const body = variant === 2 ? '#131a21' : PALETTE.house
  const roof = PALETTE.roof
  ctx.fillStyle = body
  ctx.fillRect(left, top, w, h)
  ctx.fillStyle = '#0a0f16'
  ctx.fillRect(left, top + h - 2, w, 2)

  if (variant === 1) {
    // Flat-roofed storefront.
    ctx.fillStyle = roof
    ctx.fillRect(left - 2, top - 4, w + 4, 5)
    ctx.fillStyle = '#2c2720'
    ctx.fillRect(left + 3, top - 2, w - 6, 2)
    // striped awning
    for (let i = 0; i < w - 8; i += 6) {
      ctx.fillStyle = i % 12 === 0 ? '#79392a' : '#3a3428'
      ctx.fillRect(left + 4 + i, top + 9, 5, 3)
    }
    // sign
    ctx.fillStyle = '#1c232c'
    ctx.fillRect(left + 6, top + 1, w - 12, 5)
    ctx.fillStyle = PALETTE.windowDim
    ctx.fillRect(left + 9, top + 3, w - 18, 1)
    ctx.fillStyle = '#0a1016'
    ctx.fillRect(left + 6, top + 17, 10, h - 17)
    ctx.fillRect(left + 22, top + 17, w - 30, 14)
    ctx.fillStyle = PALETTE.windowDim
    ctx.fillRect(left + 24, top + 19, w - 34, 9)
    ctx.fillStyle = 'rgba(244,190,108,0.2)'
    ctx.fillRect(left + 26, top + 21, w - 38, 5)
  } else if (variant === 3) {
    // Boarded chapel with a little spire.
    ctx.fillStyle = roof
    ctx.fillRect(left - 3, top - 2, w + 6, 4)
    ctx.fillRect(left + w * 0.42, top - 20, 6, 18)
    ctx.fillRect(left + w * 0.32, top - 14, w * 0.34, 3)
    ctx.fillStyle = '#141c26'
    ctx.fillRect(left + w * 0.45, top - 15, 2, 4)
    for (let i = 0; i < 3; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? '#5a4631' : '#3f3326'
      ctx.fillRect(left + 8 + i * 14, top + 12, 10, 3)
    }
    ctx.fillStyle = PALETTE.windowDim
    ctx.fillRect(left + w * 0.38, top + 6, 5, 4)
  } else {
    // Gabled house.
    ctx.fillStyle = roof
    for (let row = 0; row < Math.round(h * 0.3); row += 2) {
      const inset = Math.round((1 - row / (h * 0.3)) * 8)
      ctx.fillRect(left - 3 + inset, top - 14 + row, w + 6 - inset * 2, 2)
    }
    ctx.fillRect(left + w * 0.68, top - 24, 5, 12)
    // chimney smoke
    ctx.fillStyle = 'rgba(120,137,145,0.18)'
    for (let i = 0; i < 4; i += 1) {
      const drift = (time * 4 + i * 6 + seed * 20) % 26
      ctx.fillRect(
        Math.round(left + w * 0.68 + 1 + drift * 0.35 + Math.sin(drift * 0.3) * 2),
        Math.round(top - 24 - drift),
        3,
        2,
      )
    }
  }

  // Windows + doorway.
  const lit = seed > 0.32
  const glow = getGlowSprite()
  if (lit) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.24
    const wy = top + Math.round(h * 0.38)
    ctx.drawImage(glow, left - 4, wy - 8, 28, 24)
    ctx.drawImage(glow, left + w - 30, wy - 8, 28, 24)
    ctx.restore()
  }
  ctx.fillStyle = lit ? PALETTE.window : '#141c24'
  ctx.fillRect(left + 9, top + Math.round(h * 0.38), 8, 9)
  ctx.fillRect(left + w - 19, top + Math.round(h * 0.38), 8, 9)
  if (lit) {
    ctx.fillStyle = 'rgba(240,180,90,0.16)'
    ctx.fillRect(left + 6, top + Math.round(h * 0.38) - 2, 14, 13)
    ctx.fillRect(left + w - 22, top + Math.round(h * 0.38) - 2, 14, 13)
  }
  ctx.fillStyle = '#080d13'
  ctx.fillRect(left + 9, top + Math.round(h * 0.38), 1, 9)
  ctx.fillRect(left + 12, top + Math.round(h * 0.38), 1, 9)
  ctx.fillRect(left + w - 19, top + Math.round(h * 0.38), 1, 9)
  ctx.fillRect(left + w - 16, top + Math.round(h * 0.38), 1, 9)
  ctx.fillStyle = '#0b1016'
  ctx.fillRect(left + Math.round(w * 0.44), top + h - 16, 9, 16)
  ctx.fillStyle = '#8b6533'
  ctx.fillRect(left + Math.round(w * 0.44) + 7, top + h - 9, 1, 1)
  // Porch step
  ctx.fillStyle = '#0d141c'
  ctx.fillRect(left + 4, top + h - 3, w - 8, 3)
  // Wall texture
  ctx.fillStyle = 'rgba(0,0,0,0.22)'
  for (let i = 0; i < 5; i += 1) {
    ctx.fillRect(left + 5 + ((seed * 31 + i * 17) % (w - 12)), top + 18 + ((seed * 13 + i * 7) % (h - 24)), 3, 1)
  }
}

function drawCarriage(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  scale: number,
  seed: number,
  variant: number,
): void {
  const w = Math.round(138 * scale)
  const h = Math.round(42 * scale)
  const left = Math.round(x)
  const top = Math.round(baseY - h - 8)
  ctx.fillStyle = '#111820'
  ctx.fillRect(left, top, w, h)
  ctx.fillStyle = '#1a232d'
  ctx.fillRect(left + 2, top + 2, w - 4, 5)
  ctx.fillStyle = '#0a0f15'
  ctx.fillRect(left + 2, top + 9, w - 4, 2)
  // Ribs
  ctx.fillStyle = 'rgba(7,11,16,0.5)'
  for (let i = 10; i < w - 8; i += 14) {
    ctx.fillRect(left + i, top + 12, 1, h - 22)
  }
  // Rust patches
  ctx.fillStyle = '#4a2a1d'
  ctx.fillRect(left + w * 0.18, top + 15, 12, 3)
  ctx.fillRect(left + w * 0.62, top + 24, 20, 2)
  ctx.fillStyle = '#5a3220'
  ctx.fillRect(left + w * 0.72, top + 16, 4, 2)
  // Doors + windows
  const windowCount = 3 + (variant % 2)
  for (let i = 0; i < windowCount; i += 1) {
    const wx = left + 10 + i * ((w - 30) / windowCount)
    ctx.fillStyle = '#080d12'
    ctx.fillRect(Math.round(wx), top + 16, 12, 9)
    if (hash01(seed * 97, i + 3) > 0.55) {
      ctx.fillStyle = '#c98d4a'
      ctx.globalAlpha = 0.7
      ctx.fillRect(Math.round(wx) + 2, top + 18, 8, 5)
      ctx.globalAlpha = 1
    } else {
      ctx.fillStyle = '#16212b'
      ctx.fillRect(Math.round(wx) + 2, top + 18, 8, 5)
    }
  }
  // Door
  ctx.fillStyle = '#0b1118'
  ctx.fillRect(left + w - 24, top + 14, 12, h - 22)
  // Graffiti tag
  ctx.fillStyle = '#6f5b3c'
  ctx.fillRect(left + 26, top + 30, 18, 1)
  ctx.fillRect(left + 30, top + 28, 3, 5)
  ctx.fillRect(left + 38, top + 28, 2, 5)
  ctx.fillStyle = '#3c5a58'
  ctx.fillRect(left + 52, top + 29, 12, 2)
  // Wheels
  for (let i = 0; i < 3; i += 1) {
    const wx = left + 20 + i * 44
    ctx.fillStyle = '#080c10'
    stepCircle(ctx, wx, baseY - 4, 5)
    ctx.fillStyle = '#3a2b22'
    ctx.fillRect(wx - 2, baseY - 6, 4, 2)
  }
  ctx.fillStyle = '#0b0f14'
  ctx.fillRect(left - 4, baseY - 5, w + 8, 2)
}

function drawWaterTower(ctx: CanvasRenderingContext2D, x: number, baseY: number, scale: number): void {
  const h = Math.round(70 * scale)
  const w = Math.round(26 * scale)
  const left = Math.round(x)
  ctx.fillStyle = '#0d151d'
  ctx.fillRect(left + 2, baseY - h * 0.6, 2, h * 0.6)
  ctx.fillRect(left + w - 4, baseY - h * 0.6, 2, h * 0.6)
  ctx.fillRect(left + 2, baseY - h * 0.3, w - 4, 1)
  ctx.fillRect(left - 2, baseY - h * 0.62, w + 4, Math.round(h * 0.3))
  ctx.fillStyle = '#111b25'
  ctx.fillRect(left - 1, baseY - h * 0.66, w + 2, 3)
  ctx.fillStyle = '#0a1118'
  ctx.fillRect(left + 4, baseY - h * 0.4, w - 8, 2)
  ctx.fillStyle = '#a13c2a'
  ctx.fillRect(left + Math.round(w / 2), baseY - h * 0.68, 1, 1)
}

function drawLamp(ctx: CanvasRenderingContext2D, x: number, baseY: number, scale: number, seed: number, time: number): void {
  const h = Math.round(46 * scale)
  const px = Math.round(x)
  const top = Math.round(baseY - h)
  ctx.fillStyle = '#1b232c'
  ctx.fillRect(px, top, 2, h)
  ctx.fillRect(px, baseY - 4, 4, 4)
  ctx.fillRect(px, top, 10, 2)
  ctx.fillRect(px + 8, top + 2, 2, 3)
  ctx.fillStyle = '#2d3844'
  ctx.fillRect(px, top + 1, 1, h - 4)
  // Lamp head
  const flicker = 0.82 + 0.18 * Math.sin(time * 11 + seed * 40)
  ctx.fillStyle = '#121920'
  ctx.fillRect(px + 6, top + 4, 6, 3)
  ctx.fillStyle = `rgba(255,208,138,${0.55 + flicker * 0.45})`
  ctx.fillRect(px + 8, top + 6, 3, 2)
  drawLampGlow(ctx, px + 9, top + 8, 0.55 + flicker * 0.45)
}

function drawFence(ctx: CanvasRenderingContext2D, x: number, baseY: number, scale: number, variant: number): void {
  const px = Math.round(x)
  const length = Math.round((34 + variant * 8) * scale)
  const h = Math.round(12 * scale)
  ctx.fillStyle = variant === 1 ? '#2b2f2c' : '#2a2119'
  for (let i = 0; i < length; i += 7) {
    const ph = h + ((i * 5) % 3)
    ctx.fillRect(px + i, Math.round(baseY - ph), 2, ph)
    ctx.fillStyle = variant === 1 ? '#202421' : '#1c1712'
    ctx.fillRect(px + i + 2, Math.round(baseY - ph), 1, ph)
    ctx.fillStyle = variant === 1 ? '#2b2f2c' : '#2a2119'
  }
  ctx.fillStyle = variant === 1 ? '#242925' : '#33281c'
  ctx.fillRect(px, Math.round(baseY - h + 3), length, 1)
  ctx.fillRect(px, Math.round(baseY - h + 7), length, 1)
}

function drawSign(ctx: CanvasRenderingContext2D, x: number, baseY: number, scale: number, seed: number): void {
  const px = Math.round(x)
  const h = Math.round(26 * scale)
  ctx.fillStyle = '#232b32'
  ctx.fillRect(px, Math.round(baseY - h), 2, h)
  const plateY = Math.round(baseY - h - 2)
  ctx.fillStyle = '#12181e'
  ctx.fillRect(px - 5, plateY, 17, 8)
  ctx.strokeStyle = '#515b5e'
  ctx.lineWidth = 1
  ctx.strokeRect(px - 4.5, plateY + 0.5, 16, 7)
  const number = Math.abs(Math.round(seed * 89)) % 100
  drawPixelText(ctx, String(number).padStart(2, '0'), px - 1, plateY + 2, '#c9c1a8', 1)
  ctx.fillStyle = '#5a3a28'
  ctx.fillRect(px, baseY - 2, 3, 2)
}

function drawBush(ctx: CanvasRenderingContext2D, x: number, baseY: number, scale: number, seed: number): void {
  const px = Math.round(x)
  const w = Math.round((8 + seed * 8) * scale)
  const h = Math.round((4 + seed * 4) * scale)
  ctx.fillStyle = '#17211a'
  ctx.fillRect(px - w / 2, baseY - h, w, h)
  ctx.fillRect(px - w / 2 + 2, baseY - h - 2, w - 4, 2)
  ctx.fillStyle = '#243326'
  ctx.fillRect(px - w / 2 + 1, baseY - h, 2, 2)
  ctx.fillRect(px + w / 4, baseY - h + 1, 1, 1)
}

function drawRock(ctx: CanvasRenderingContext2D, x: number, baseY: number, scale: number, seed: number): void {
  const px = Math.round(x)
  const w = Math.round((5 + seed * 7) * scale)
  const h = Math.round((3 + seed * 4) * scale)
  ctx.fillStyle = '#242a2e'
  ctx.fillRect(px - w / 2, baseY - h, w, h)
  ctx.fillStyle = '#343b3f'
  ctx.fillRect(px - w / 2 + 1, baseY - h, w - 2, 1)
  ctx.fillStyle = '#151a1d'
  ctx.fillRect(px - w / 2, baseY - 1, w, 1)
}

function drawBench(ctx: CanvasRenderingContext2D, x: number, baseY: number, scale: number, seed: number, variant: number): void {
  const px = Math.round(x)
  const w = Math.round(30 * scale)
  const left = px - Math.round(w / 2)
  const seatY = Math.round(baseY - 7 * scale)
  drawShadow(ctx, px, baseY + 1, w + 4, 0.3)

  // Iron frame.
  ctx.fillStyle = '#1b2024'
  ctx.fillRect(left + 2, seatY, 2, Math.round(baseY - seatY))
  ctx.fillRect(left + w - 4, seatY, 2, Math.round(baseY - seatY))
  ctx.fillRect(left + 1, seatY - 1, 3, 1)
  ctx.fillRect(left + w - 4, baseY - 2, 4, 2)
  ctx.fillStyle = '#2b3137'
  ctx.fillRect(left + 3, seatY, 1, Math.round(baseY - seatY) - 1)

  // Backrest.
  ctx.fillStyle = '#151b1f'
  ctx.fillRect(left + 2, Math.round(seatY - 13 * scale), 2, Math.round(13 * scale))
  ctx.fillRect(left + w - 4, Math.round(seatY - 13 * scale), 2, Math.round(13 * scale))
  for (let i = 0; i < 3; i += 1) {
    if (variant === 1 && i === 1) continue
    ctx.fillStyle = i === 0 ? '#4a3624' : '#3b2b1d'
    ctx.fillRect(left + 4, Math.round(seatY - 12 * scale + i * 4), w - 8, 2)
    ctx.fillStyle = 'rgba(190, 137, 82, 0.18)'
    ctx.fillRect(left + 4, Math.round(seatY - 12 * scale + i * 4), w - 8, 1)
  }
  // Seat slats.
  for (let i = 0; i < 3; i += 1) {
    ctx.fillStyle = i === 1 ? '#453221' : '#332619'
    ctx.fillRect(left + 2, seatY + 1 + i * 2, w - 4, 1)
  }
  ctx.fillStyle = '#5d4229'
  ctx.fillRect(left + 2, seatY, w - 4, 1)
  // Rust + a fallen leaf.
  ctx.fillStyle = '#6b3b25'
  ctx.fillRect(left + w - 8, seatY + 4, 2, 1)
  ctx.fillStyle = seed > 0.5 ? '#6b4b2c' : '#3f3425'
  ctx.fillRect(left + Math.round(seed * (w - 10)) + 4, seatY - 1, 2, 1)
}

function drawTrashCan(ctx: CanvasRenderingContext2D, x: number, baseY: number, scale: number, seed: number, variant: number): void {
  const px = Math.round(x)
  const w = Math.round(10 * scale)
  const h = Math.round(14 * scale)
  drawShadow(ctx, px, baseY + 1, w + 5, 0.28)

  if (variant === 2) {
    // Toppled bin with a spill of rubbish.
    ctx.save()
    ctx.translate(px, baseY - 3)
    ctx.rotate(-0.32)
    ctx.fillStyle = '#2b3236'
    ctx.fillRect(-Math.round(w / 2), -h + 2, w, h - 2)
    ctx.fillStyle = '#3a4247'
    ctx.fillRect(-Math.round(w / 2), -h + 2, w, 2)
    ctx.fillStyle = '#1a1f22'
    ctx.fillRect(-Math.round(w / 2) + 1, -h + 5, w - 2, 1)
    ctx.restore()
    ctx.fillStyle = '#4b4030'
    ctx.fillRect(px + 3, baseY - 2, 2, 1)
    ctx.fillRect(px + 6, baseY - 3, 1, 2)
    ctx.fillStyle = '#5a4a35'
    ctx.fillRect(px + 1, baseY - 4, 2, 2)
    return
  }

  const left = px - Math.round(w / 2)
  const top = Math.round(baseY - h)
  // Body.
  ctx.fillStyle = '#262d31'
  ctx.fillRect(left, top + 1, w, h - 1)
  ctx.fillStyle = '#343c41'
  ctx.fillRect(left, top + 1, w, 2)
  ctx.fillStyle = '#1a1f22'
  ctx.fillRect(left, baseY - 2, w, 2)
  // Ribs.
  ctx.fillStyle = '#1d2326'
  ctx.fillRect(left + 1, top + 5, w - 2, 1)
  ctx.fillRect(left + 1, top + 9, w - 2, 1)
  ctx.fillStyle = '#3c464b'
  ctx.fillRect(left + 1, top + 4, w - 2, 1)
  ctx.fillRect(left + 1, top + 8, w - 2, 1)
  // Lid + handle.
  ctx.fillStyle = '#3f484d'
  ctx.fillRect(left - 1, top, w + 2, 2)
  ctx.fillStyle = '#586268'
  ctx.fillRect(left - 1, top, w + 2, 1)
  ctx.fillStyle = '#1b2024'
  ctx.fillRect(px - 2, top - 1, 4, 1)
  ctx.fillRect(px - 1, top - 2, 2, 1)
  // Leaning bag.
  if (seed > 0.56) {
    ctx.fillStyle = '#171d20'
    ctx.fillRect(left + w + 1, baseY - 4, 3, 4)
    ctx.fillRect(left + w + 2, baseY - 5, 2, 1)
    ctx.fillStyle = '#242c30'
    ctx.fillRect(left + w + 1, baseY - 4, 1, 2)
  }
  ctx.fillStyle = '#6b3b25'
  ctx.fillRect(left + 2, top + 6, 1, 2)
}

function drawBarrel(ctx: CanvasRenderingContext2D, x: number, baseY: number, scale: number, seed: number, variant: number): void {
  const px = Math.round(x)
  const w = Math.round(9 * scale)
  const h = Math.round(13 * scale)
  const left = px - Math.round(w / 2)
  const top = Math.round(baseY - h)
  drawShadow(ctx, px, baseY + 1, w + 4, 0.28)
  ctx.fillStyle = variant === 0 ? '#3b2a1c' : '#26301f'
  ctx.fillRect(left, top, w, h)
  ctx.fillStyle = '#50351f'
  ctx.fillRect(left + 1, top + 1, w - 2, h - 2)
  ctx.fillStyle = '#6d4a2a'
  ctx.fillRect(left + 1, top + 1, 1, h - 2)
  ctx.fillStyle = '#201811'
  ctx.fillRect(left, top, w, 1)
  ctx.fillRect(left, baseY - 1, w, 1)
  ctx.fillStyle = '#77838a'
  ctx.fillRect(left - 1, top + 3, w + 2, 1)
  ctx.fillRect(left - 1, top + h - 5, w + 2, 1)
  ctx.fillStyle = '#4a3a24'
  ctx.fillRect(left + 2, top + 6, 2, 2)
  if (seed > 0.5) {
    ctx.fillStyle = '#1e2820'
    ctx.fillRect(left + 4, top + 8, 3, 1)
  }
}

function drawCrate(ctx: CanvasRenderingContext2D, x: number, baseY: number, scale: number, seed: number, variant: number): void {
  const px = Math.round(x)
  const w = Math.round(12 * scale)
  const h = Math.round(10 * scale)
  const left = px - Math.round(w / 2)
  const top = Math.round(baseY - h)
  drawShadow(ctx, px, baseY + 1, w + 3, 0.28)
  ctx.fillStyle = '#3a2a1b'
  ctx.fillRect(left, top, w, h)
  ctx.fillStyle = '#4c3823'
  ctx.fillRect(left + 1, top + 1, w - 2, h - 2)
  ctx.fillStyle = '#2b1f14'
  ctx.fillRect(left + 1, top + Math.round(h / 2) - 1, w - 2, 1)
  ctx.fillRect(left + Math.round(w / 2) - 1, top + 1, 1, h - 2)
  if (variant === 0) {
    ctx.strokeStyle = '#5d462c'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(left + 1, top + h - 2)
    ctx.lineTo(left + w - 2, top + 1)
    ctx.stroke()
  }
  ctx.fillStyle = '#6b4f30'
  ctx.fillRect(left + 1, top + 1, w - 2, 1)
  if (seed > 0.6) {
    ctx.fillStyle = '#8d7b53'
    ctx.fillRect(left + 3, top + 3, 2, 1)
  }
}

function drawGravestone(ctx: CanvasRenderingContext2D, x: number, baseY: number, scale: number, seed: number, variant: number): void {
  const px = Math.round(x)
  const w = Math.max(3, Math.round(6 * scale))
  const h = Math.round((7 + seed * 5) * scale)
  const left = px - Math.round(w / 2)
  const top = Math.round(baseY - h)
  drawShadow(ctx, px, baseY + 1, w + 4, 0.24)
  ctx.fillStyle = '#3a4044'
  ctx.fillRect(left, top + 1, w, h - 1)
  ctx.fillStyle = '#4b5257'
  ctx.fillRect(left + 1, top, w - 2, 1)
  ctx.fillRect(left, top + 1, 1, h - 2)
  ctx.fillStyle = '#23292c'
  ctx.fillRect(left + w - 1, top + 1, 1, h - 2)
  ctx.fillRect(left, baseY - 1, w, 1)
  if (variant === 1) {
    // Cross marker.
    ctx.fillStyle = '#434a4e'
    ctx.fillRect(px - 1, top - 3, 2, 4)
    ctx.fillRect(px - 3, top - 2, 6, 1)
  } else {
    ctx.fillStyle = '#2a3033'
    ctx.fillRect(left + 1, top + Math.round(h * 0.4), w - 2, 1)
    ctx.fillRect(left + 1, top + Math.round(h * 0.55), Math.max(1, w - 4), 1)
  }
  ctx.fillStyle = '#313a2c'
  ctx.fillRect(left, baseY - 1, 1, 2)
}

function drawProp(ctx: CanvasRenderingContext2D, prop: Prop, seed: number, time: number): void {
  const baseY = groundHeightAt(seed, prop.x)
  const scale =
    prop.scale *
    (prop.kind === 'house'
      ? 1.24
      : prop.kind === 'pine'
        ? 1.18
        : prop.kind === 'lamp'
          ? 1.24
          : prop.kind === 'carriage'
            ? 1.08
            : prop.kind === 'waterTower'
              ? 1.14
              : prop.kind === 'fence'
                ? 1.12
                : 1)
  switch (prop.kind) {
    case 'house':
      drawHouse(ctx, prop.x, baseY + 2, scale, prop.seed, prop.variant, time)
      break
    case 'carriage':
      drawCarriage(ctx, prop.x, baseY + 3, scale, prop.seed, prop.variant)
      break
    case 'waterTower':
      drawWaterTower(ctx, prop.x, baseY + 2, scale)
      break
    case 'pine':
      drawPine(ctx, prop.x, baseY + 2, scale, prop.seed)
      break
    case 'deadTree':
      drawDeadTree(ctx, prop.x, baseY + 2, scale, prop.seed)
      break
    case 'lamp':
      drawLamp(ctx, prop.x, baseY + 2, scale, prop.seed, time)
      break
    case 'fence':
      drawFence(ctx, prop.x, baseY + 2, scale, prop.variant)
      break
    case 'sign':
      drawSign(ctx, prop.x, baseY + 2, scale, prop.seed)
      break
    case 'bush':
      drawBush(ctx, prop.x, baseY + 2, scale, prop.seed)
      break
    case 'rock':
      drawRock(ctx, prop.x, baseY + 2, scale, prop.seed)
      break
    case 'bench':
      drawBench(ctx, prop.x, baseY + 2, scale, prop.seed, prop.variant)
      break
    case 'trashCan':
      drawTrashCan(ctx, prop.x, baseY + 2, scale, prop.seed, prop.variant)
      break
    case 'barrel':
      drawBarrel(ctx, prop.x, baseY + 2, scale, prop.seed, prop.variant)
      break
    case 'crate':
      drawCrate(ctx, prop.x, baseY + 2, scale, prop.seed, prop.variant)
      break
    case 'gravestone':
      drawGravestone(ctx, prop.x, baseY + 2, scale, prop.seed, prop.variant)
      break
    default:
      break
  }
}

// ─────────────────────────────────────────────────────────────
// Characters
// ─────────────────────────────────────────────────────────────

function drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, strength = 0.35): void {
  ctx.fillStyle = `rgba(0,0,0,${strength})`
  ctx.fillRect(Math.round(x - width / 2), Math.round(y - 1), Math.round(width), 2)
  ctx.fillRect(Math.round(x - width / 2 + 2), Math.round(y + 1), Math.round(width - 4), 1)
}

function drawSurvivor(ctx: CanvasRenderingContext2D, engine: GameEngine): void {
  const p = engine.player
  const seed = engine.seed
  const time = engine.time
  const x = Math.round(p.x)
  const feet = Math.round(p.y)
  const groundY = groundHeightAt(seed, p.x)
  const airborne = !p.onGround

  drawShadow(ctx, x, groundY + 1, p.crouching ? 14 : 16, airborne ? 0.18 : 0.32)

  if (engine.phase === 'dead') {
    drawCorpse(ctx, engine)
    return
  }

  const dir = p.facing
  const crouch = p.crouching
  const moving = p.moving && p.onGround
  const phase = p.walkPhase
  const bob = moving ? Math.round(Math.abs(Math.sin(phase * 2)) * 1) : 0
  const breathe = Math.round(Math.sin(time * 2.1) * 0.5)
  const height = crouch ? 21 : 30
  const flicker = p.invuln > 0 && Math.floor(time * 22) % 2 === 0

  ctx.save()
  ctx.globalAlpha = flicker ? 0.45 : 1
  ctx.translate(x, feet + (crouch ? 0 : -bob))
  ctx.scale(dir, 1)

  const rect = (dx: number, dy: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color
    ctx.fillRect(Math.round(dx), Math.round(dy), w, h)
  }

  if (airborne) {
    // Tucked jump pose.
    rect(-5, -13, 3, 8, PALETTE.pants)
    rect(2, -15, 3, 8, PALETTE.pants)
    rect(-5, -6, 4, 3, PALETTE.boots)
    rect(2, -8, 4, 3, PALETTE.boots)
  } else if (crouch) {
    rect(-5, -9, 4, 7, PALETTE.pants)
    rect(1, -9, 4, 7, PALETTE.pants)
    rect(-5, -3, 4, 3, PALETTE.boots)
    rect(1, -3, 4, 3, PALETTE.boots)
  } else if (moving) {
    const swing = Math.sin(phase)
    const swing2 = Math.sin(phase + Math.PI)
    rect(-4 + Math.round(swing * 2), -13, 3, 10, PALETTE.pants)
    rect(1 + Math.round(swing2 * 2), -13, 3, 10, PALETTE.pants)
    rect(-5 + Math.round(swing * 2), -3, 4, 3, PALETTE.boots)
    rect(1 + Math.round(swing2 * 2), -3, 4, 3, PALETTE.boots)
  } else {
    rect(-4, -13, 3, 10, PALETTE.pants)
    rect(1, -13, 3, 10, PALETTE.pants)
    rect(-4, -3, 4, 3, PALETTE.boots)
    rect(1, -3, 4, 3, PALETTE.boots)
  }

  // Backpack + strap
  if (!crouch) {
    rect(-7, -23 + breathe, 3, 9, '#4b3a2a')
    rect(-7, -23 + breathe, 3, 1, '#6a5239')
    rect(-4, -23, 3, 1, '#7a5c3c')
  } else {
    rect(-7, -16, 3, 7, '#4b3a2a')
    rect(-4, -16, 3, 1, '#7a5c3c')
  }

  // Torso
  const torsoY = crouch ? -18 : -25 + breathe
  rect(-4, torsoY, 8, crouch ? 9 : 13, PALETTE.jacket)
  rect(-4, torsoY, 2, crouch ? 9 : 13, PALETTE.jacketDark)
  rect(2, torsoY + 2, 1, 7, '#5a6d60')
  // Belt
  rect(-4, torsoY + (crouch ? 7 : 11), 8, 2, '#242b25')

  // Scarf
  const scarfY = torsoY - 1
  rect(-4, scarfY, 8, 2, PALETTE.scarf)
  const trail = Math.round(Math.sin(time * 4 + 1) * 2)
  rect(-7, scarfY + 1 + trail, 3, 2, '#9c3a28')
  rect(-10, scarfY + 2 - trail, 3, 2, '#7d2f1f')
  if (moving || airborne) {
    rect(-13, scarfY + 1 + trail, 3, 1, '#6b281b')
  }

  // Head
  const headY = crouch ? -24 : -31 + breathe
  rect(-3, headY, 6, 7, PALETTE.skin)
  rect(-3, headY, 6, 2, PALETTE.hair)
  rect(-3, headY + 2, 2, 2, PALETTE.hair)
  rect(-3, headY + 5, 6, 2, PALETTE.skinShade)
  rect(1, headY + 3, 1, 1, '#1b1613')
  // scar
  rect(-1, headY + 4, 2, 1, '#a56a48')

  // Rear arm (front arm is drawn with the weapon).
  rect(-5, torsoY + 2, 2, 6, PALETTE.jacketDark)
  rect(-5, torsoY + 8, 2, 2, PALETTE.skinShade)

  ctx.restore()

  // Weapon hand is rendered in world space so it can aim freely.
  drawWeapon(ctx, p.x, p.y - (crouch ? 15 : 21), p.aim, engine)

  ctx.globalAlpha = 1
  void height
}

function drawWeapon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  aim: number,
  engine: GameEngine,
): void {
  const p = engine.player
  const def = WEAPONS[p.weapon]
  const cos = Math.cos(aim)
  const flip = cos < 0
  let angle = aim
  if (flip) angle = Math.PI - aim
  const recoil = p.recoil * (p.weapon === 'mg' ? 1 : 1.5)

  if (p.weapon === 'pipe' && p.attackAnim > 0) {
    const t = 1 - p.attackAnim / 0.2
    angle += p.attackDir * (-1.15 + t * 2.1)
  }

  ctx.save()
  ctx.translate(Math.round(x), Math.round(y))
  if (flip) ctx.scale(-1, 1)
  ctx.rotate(angle)
  ctx.translate(-recoil, 0)

  const rect = (dx: number, dy: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color
    ctx.fillRect(dx, dy, w, h)
  }

  // Sleeve + hand
  rect(0, -1, 5, 3, PALETTE.jacket)
  rect(4, -1, 2, 2, PALETTE.skin)
  rect(5, 0, 2, 1, PALETTE.skinShade)

  let muzzleX = 8

  if (p.weapon === 'pipe') {
    rect(5, -2, 16, 2, PALETTE.pipe)
    rect(5, -2, 16, 1, '#c1c9cf')
    rect(5, 0, 16, 1, '#5e6b76')
    rect(19, -3, 3, 3, '#6b7782')
    muzzleX = 21
    if (p.attackAnim > 0) {
      ctx.save()
      ctx.globalAlpha = 0.22
      ctx.strokeStyle = '#d6d3c0'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(0, 0, 20, -0.7, 0.7)
      ctx.stroke()
      ctx.restore()
    }
  } else if (p.weapon === 'pistol') {
    rect(5, -2, 8, 3, PALETTE.gun)
    rect(5, -2, 8, 1, '#4a545d')
    rect(6, 0, 3, 4, '#1c222a')
    rect(12, -1, 2, 1, '#7d8894')
    muzzleX = 14
  } else {
    rect(4, -3, 15, 4, PALETTE.gun)
    rect(4, -3, 15, 1, '#4a545d')
    rect(7, 1, 3, 5, '#1c222a')
    rect(14, 1, 4, 2, '#353e47')
    rect(17, -2, 3, 1, '#7d8894')
    rect(9, -2, 7, 1, '#5f6a74')
    muzzleX = 21
  }

  // Muzzle flash
  if (p.muzzle > 0 && def.kind === 'ranged') {
    const t = p.muzzle / 0.055
    ctx.globalAlpha = Math.min(1, t)
    ctx.fillStyle = '#fff0b8'
    ctx.fillRect(muzzleX, -2, 4, 3)
    ctx.fillStyle = PALETTE.amber
    ctx.fillRect(muzzleX + 3, -3, 2, 2)
    ctx.fillRect(muzzleX + 3, 0, 2, 2)
    ctx.fillRect(muzzleX + 5, -1, 2, 1)
    ctx.fillStyle = '#ffe7a0'
    ctx.fillRect(muzzleX + 1, -1, 2, 1)
    ctx.globalAlpha = 1
  }

  ctx.restore()
}

function drawCorpse(ctx: CanvasRenderingContext2D, engine: GameEngine): void {
  const p = engine.player
  const x = Math.round(p.x)
  const feet = Math.round(p.y)
  ctx.save()
  ctx.translate(x, feet)
  ctx.scale(p.facing, 1)
  ctx.fillStyle = 'rgba(70,20,15,0.4)'
  ctx.fillRect(-18, -3, 30, 3)
  ctx.fillStyle = PALETTE.pants
  ctx.fillRect(-12, -7, 12, 5)
  ctx.fillStyle = PALETTE.boots
  ctx.fillRect(-15, -5, 5, 4)
  ctx.fillStyle = PALETTE.jacket
  ctx.fillRect(-2, -10, 12, 7)
  ctx.fillStyle = PALETTE.jacketDark
  ctx.fillRect(-2, -10, 12, 2)
  ctx.fillStyle = PALETTE.scarf
  ctx.fillRect(-6, -9, 5, 2)
  ctx.fillStyle = PALETTE.skin
  ctx.fillRect(10, -11, 7, 6)
  ctx.fillStyle = PALETTE.hair
  ctx.fillRect(10, -11, 7, 2)
  ctx.fillStyle = '#1b1613'
  ctx.fillRect(14, -8, 1, 1)
  ctx.fillStyle = PALETTE.blood
  ctx.fillRect(16, -6, 2, 1)
  ctx.restore()
}

function drawZombie(ctx: CanvasRenderingContext2D, z: Zombie, time: number): void {
  const groundY = z.y
  const dying = z.state === 'die'
  const deathT = dying ? Math.min(1, z.timer / Math.max(0.01, z.deathDuration)) : 0
  const alpha = dying && deathT > 0.55 ? Math.max(0, 1 - (deathT - 0.55) / 0.45) : 1

  drawShadow(ctx, z.x, groundY + 1, z.w + 4, dying ? 0.15 : 0.28)
  if (dying) {
    ctx.fillStyle = `rgba(74,22,17,${0.24 + deathT * 0.2})`
    ctx.fillRect(Math.round(z.x - 7 - deathT * 4), Math.round(groundY - 1), Math.round(14 + deathT * 8), 2)
  }

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(Math.round(z.x), Math.round(groundY))
  ctx.scale(z.facing, dying ? Math.max(0.18, 1 - deathT * 0.82) : 1)

  const flash = z.hurt > 0
  const skin = flash ? '#efe6c6' : z.type === 'runner' ? '#9aa06b' : z.type === 'brute' ? '#7c8852' : PALETTE.zombieSkin
  const skinDark = flash ? '#cdbfa5' : PALETTE.zombieSkinDark
  const shirt =
    flash
      ? '#e0d7bd'
      : z.type === 'brute'
        ? '#3a3f38'
        : z.seed > 0.6
          ? '#4a3b3c'
          : z.type === 'runner'
            ? '#54393a'
            : '#3d4a50'
  const pants = flash ? '#c6b99f' : PALETTE.zombiePants
  const eye = flash ? '#622' : PALETTE.eye
  const rect = (dx: number, dy: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color
    ctx.fillRect(Math.round(dx), Math.round(dy), w, h)
  }

  const brute = z.type === 'brute'
  const runner = z.type === 'runner'
  const crouched = runner ? 2 : 0
  const sway = dying ? 0 : Math.sin(z.anim) * 1
  const leg = dying ? 0 : Math.sin(z.anim * 1.4) * 2
  const bodyW = brute ? 14 : 7
  const torsoH = brute ? 15 : 12
  const torsoY = -(brute ? 27 : 23) + crouched

  // Legs
  rect(-4 + Math.round(leg), -9, 3, 9, pants)
  rect(2 - Math.round(leg), -9, 3, 9, pants)
  rect(-4 + Math.round(leg), -1, 3, 2, '#14181b')
  rect(2 - Math.round(leg), -1, 3, 2, '#14181b')

  // Torso
  rect(-bodyW / 2, torsoY, bodyW, torsoH, shirt)
  rect(-bodyW / 2, torsoY, 2, torsoH, flash ? '#bbae94' : 'rgba(0,0,0,0.28)')
  rect(-bodyW / 2 + 2, torsoY + 3, 2, 2, flash ? '#9c3a28' : PALETTE.blood)

  // Head
  const headY = torsoY - (brute ? 7 : 6)
  const headW = brute ? 8 : 6
  rect(-headW / 2 + (runner ? 1 : 0), headY, headW, brute ? 7 : 6, skin)
  rect(-headW / 2 + (runner ? 1 : 0), headY, headW, 2, flash ? '#cdbfa5' : '#3a3b2a')
  rect(-2, headY + 2, 1, 1, eye)
  rect(1, headY + 2, 1, 1, eye)
  rect(-1, headY + 4, 2, 1, skinDark)
  // jaw
  rect(0, headY + (brute ? 5 : 4), 2, 1, '#423f2b')

  // Arms reaching forward
  const reach = dying ? 4 : z.state === 'attack' ? 5 + Math.sin(z.anim * 2.4) * 2 : 7
  const armLift = z.state === 'attack' && z.timer < 0.32 ? 5 : 1
  rect(3, torsoY + 2 - armLift, reach, 2, skin)
  rect(3 + reach, torsoY + 2 - armLift + 1, 2, 2, skinDark)
  rect(3, torsoY + 5, reach - 1, 2, skinDark)
  rect(2 + reach, torsoY + 5, 2, 2, skin)

  // Ribs + tattered cloth
  if (brute) {
    rect(-4, torsoY + 4, 8, 1, flash ? '#d8cbb1' : '#2b3029')
    rect(-4, torsoY + 7, 6, 1, flash ? '#d8cbb1' : '#2b3029')
    rect(-6, torsoY + 8, 3, 2, 'rgba(0,0,0,0.3)')
  } else {
    rect(-3, torsoY + 6, 5, 1, flash ? '#d8cbb1' : '#2b3029')
  }

  // Eye glow
  if (!flash && !dying) {
    ctx.globalAlpha = 0.18 + 0.12 * Math.sin(time * 5 + z.id)
    ctx.fillStyle = PALETTE.eye
    ctx.fillRect(-3, headY + 1, 3, 3)
    ctx.fillRect(0, headY + 1, 3, 3)
    ctx.globalAlpha = alpha
  }

  ctx.restore()
  ctx.globalAlpha = 1

  // Health pips above wounded zombies
  if (!dying && z.hp < z.maxHp && z.hp > 0) {
    const w = brute ? 20 : 12
    const bx = Math.round(z.x - w / 2)
    const by = Math.round(z.y - z.h - 7)
    ctx.fillStyle = 'rgba(5,8,13,0.8)'
    ctx.fillRect(bx - 1, by - 1, w + 2, 3)
    ctx.fillStyle = '#3a2a24'
    ctx.fillRect(bx, by, w, 1)
    ctx.fillStyle = z.type === 'brute' ? '#c96a3e' : '#b4472f'
    ctx.fillRect(bx, by, Math.max(1, Math.round((z.hp / z.maxHp) * w)), 1)
  }
}

// ─────────────────────────────────────────────────────────────
// Items, effects, minimap-ish details
// ─────────────────────────────────────────────────────────────

function drawPickup(
  ctx: CanvasRenderingContext2D,
  pickup: Pickup,
  time: number,
  seed: number,
): void {
  const bob = Math.round(Math.sin(time * 4 + pickup.bob) * 1.5)
  const x = Math.round(pickup.x)
  const y = Math.round(pickup.y + bob)
  const blink = pickup.age > 35 && Math.floor(time * 8) % 2 === 0
  if (blink) return

  ctx.globalAlpha = pickup.age < 0.2 ? 0.5 + (pickup.age / 0.2) * 0.5 : 1
  drawShadow(ctx, x, groundHeightAt(seed, pickup.x) + 1, 9, 0.22)
  const sprite = getGlowSprite()
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = 0.26 + Math.sin(time * 3 + pickup.bob) * 0.06
  ctx.drawImage(sprite, x - 12, y - 12, 24, 24)
  ctx.restore()
  ctx.globalAlpha = 1

  if (pickup.kind === 'materials') {
    ctx.fillStyle = '#5b3a22'
    ctx.fillRect(x - 4, y - 2, 8, 5)
    ctx.fillStyle = '#8b5a35'
    ctx.fillRect(x - 3, y - 3, 7, 5)
    ctx.fillStyle = '#c58a52'
    ctx.fillRect(x - 3, y - 3, 7, 1)
    ctx.fillRect(x - 1, y - 3, 1, 4)
    ctx.fillStyle = '#3d2a19'
    ctx.fillRect(x - 3, y, 7, 1)
    ctx.fillStyle = '#e2b26e'
    ctx.fillRect(x + 2, y - 2, 1, 1)
  } else if (pickup.kind === 'medkit') {
    ctx.fillStyle = '#d8d0b8'
    ctx.fillRect(x - 4, y - 3, 9, 7)
    ctx.fillStyle = '#b4472f'
    ctx.fillRect(x - 1, y - 2, 3, 5)
    ctx.fillRect(x - 3, y, 7, 1)
    ctx.fillStyle = '#8c8573'
    ctx.fillRect(x - 4, y + 3, 9, 1)
  } else {
    ctx.fillStyle = '#2e3a34'
    ctx.fillRect(x - 4, y - 3, 8, 6)
    ctx.fillStyle = '#788b6b'
    ctx.fillRect(x - 4, y - 4, 9, 2)
    ctx.fillStyle = pickup.kind === 'mg_ammo' ? '#c8a25a' : '#c9c0a7'
    ctx.fillRect(x - 2, y - 1, 5, 1)
    ctx.fillRect(x - 2, y + 1, 5, 1)
    ctx.fillStyle = '#1a2220'
    ctx.fillRect(x - 4, y + 3, 8, 1)
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]): void {
  for (const particle of particles) {
    const alpha = Math.max(0, Math.min(1, particle.life / particle.maxLife))
    ctx.globalAlpha = alpha
    ctx.fillStyle = particle.color
    if (particle.shape === 'spark') {
      const len = Math.max(1, Math.min(4, Math.hypot(particle.vx, particle.vy) * 0.035))
      const nx = particle.x - (particle.vx / (Math.abs(particle.vx) + Math.abs(particle.vy) + 0.01)) * len
      const ny = particle.y - (particle.vy / (Math.abs(particle.vx) + Math.abs(particle.vy) + 0.01)) * len
      ctx.strokeStyle = particle.color
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(Math.round(nx), Math.round(ny))
      ctx.lineTo(Math.round(particle.x), Math.round(particle.y))
      ctx.stroke()
    } else {
      const size = particle.shape === 'smoke' ? Math.max(1, Math.round(particle.size * (1 + (1 - alpha) * 2))) : particle.size
      ctx.fillRect(Math.round(particle.x), Math.round(particle.y), size, size)
    }
  }
  ctx.globalAlpha = 1
}

function drawBullets(ctx: CanvasRenderingContext2D, engine: GameEngine): void {
  for (const bullet of engine.bullets) {
    const x0 = Math.round(bullet.px)
    const y0 = Math.round(bullet.py)
    const x1 = Math.round(bullet.x)
    const y1 = Math.round(bullet.y)

    // Soft glow first so the shot reads against the dark rail bed.
    ctx.globalAlpha = 0.28
    ctx.strokeStyle = '#ffb85a'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()

    ctx.globalAlpha = 1
    ctx.strokeStyle = 'rgba(255,232,170,0.95)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
    ctx.fillStyle = '#fff7d6'
    ctx.fillRect(x1, y1, 1, 1)
  }
  ctx.globalAlpha = 1
}

// ─────────────────────────────────────────────────────────────
// Ambient + overlay
// ─────────────────────────────────────────────────────────────

function drawMotes(ctx: CanvasRenderingContext2D, camX: number, time: number): void {
  for (let i = 0; i < 16; i += 1) {
    const speed = 2 + hash01(3100, i) * 4
    const x = ((hashRange(3101, i, 0, VIEW_W) - camX * 0.15 + time * speed) % (VIEW_W + 20) + VIEW_W + 20) % (VIEW_W + 20) - 10
    const y = 120 + hashRange(3102, i, 0, 90) + Math.sin(time * 0.5 + i) * 5
    ctx.globalAlpha = 0.12 + 0.16 * (0.5 + 0.5 * Math.sin(time * 2 + i * 2))
    ctx.fillStyle = i % 3 === 0 ? '#f0b45a' : '#9fa9a0'
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1)
  }
  ctx.globalAlpha = 1
}

function drawReticle(ctx: CanvasRenderingContext2D, engine: GameEngine): void {
  if (engine.phase !== 'playing' || !engine.input.mouseActive) return
  const p = engine.player
  const x = Math.round(engine.input.aimX)
  const y = Math.round(engine.input.aimY)
  const pivot = engine.aimPivot()
  const distance = Math.hypot(engine.aimWorldX - pivot.x, engine.aimWorldY - pivot.y)
  const spread = Math.max(2, Math.min(26, Math.round(Math.tan(engine.weaponSpread()) * distance + p.recoil * 2)))
  const ammo = p.ammo[p.weapon]
  const empty = p.weapon !== 'pipe' && ammo <= 0
  const onTarget = engine.aimTargetId !== null
  const color = empty ? '#e85540' : onTarget ? '#ff8a66' : '#ffca78'

  const cross = (ox: number, oy: number, alpha: number, tint: string) => {
    ctx.globalAlpha = alpha
    ctx.fillStyle = tint
    ctx.fillRect(x + ox, y + oy, 1, 1)
    ctx.fillRect(x - spread + ox, y - 1 + oy, 1, 3)
    ctx.fillRect(x + spread + ox, y - 1 + oy, 1, 3)
    ctx.fillRect(x - 1 + ox, y - spread + oy, 3, 1)
    ctx.fillRect(x - 1 + ox, y + spread + oy, 3, 1)
    ctx.fillRect(x - spread - 2 + ox, y - 1 + oy, 1, 1)
    ctx.fillRect(x + spread + 2 + ox, y - 1 + oy, 1, 1)
    ctx.fillRect(x - 1 + ox, y - spread - 2 + oy, 1, 1)
    ctx.fillRect(x - 1 + ox, y + spread + 2 + oy, 1, 1)
  }

  // Dark underlay keeps the crosshair readable over lit windows and bone-white corpses.
  cross(1, 1, 0.5, '#04070c')
  cross(0, 0, 0.95, color)

  // Precise centre dot: what the barrel is actually pointing at.
  ctx.fillStyle = '#04070c'
  ctx.fillRect(x, y, 1, 1)
  ctx.globalAlpha = 1
  if (onTarget) {
    const r = spread + 5
    const arm = 4
    ctx.strokeStyle = color
    ctx.globalAlpha = 0.9
    ctx.lineWidth = 1
    // Corner brackets read as a target lock without boxing in the whole scene.
    ctx.beginPath()
    ctx.moveTo(x - r, y - r + arm)
    ctx.lineTo(x - r, y - r)
    ctx.lineTo(x - r + arm, y - r)
    ctx.moveTo(x + r - arm, y - r)
    ctx.lineTo(x + r, y - r)
    ctx.lineTo(x + r, y - r + arm)
    ctx.moveTo(x + r, y + r - arm)
    ctx.lineTo(x + r, y + r)
    ctx.lineTo(x + r - arm, y + r)
    ctx.moveTo(x - r + arm, y + r)
    ctx.lineTo(x - r, y + r)
    ctx.lineTo(x - r, y + r - arm)
    ctx.stroke()
    ctx.globalAlpha = 1
  }
}

function drawHitMarker(ctx: CanvasRenderingContext2D, marker: { x: number; y: number; life: number }): void {
  const alpha = Math.max(0, Math.min(1, marker.life / 0.14))
  const x = Math.round(marker.x)
  const y = Math.round(marker.y)
  ctx.globalAlpha = alpha
  ctx.fillStyle = '#fff1c2'
  ctx.fillRect(x - 4, y - 4, 2, 1)
  ctx.fillRect(x + 3, y - 4, 2, 1)
  ctx.fillRect(x - 4, y + 4, 2, 1)
  ctx.fillRect(x + 3, y + 4, 2, 1)
  ctx.fillRect(x - 4, y - 3, 1, 2)
  ctx.fillRect(x + 4, y - 3, 1, 2)
  ctx.fillRect(x - 4, y + 2, 1, 2)
  ctx.fillRect(x + 4, y + 2, 1, 2)
  ctx.globalAlpha = 1
}

function drawDamageFlash(ctx: CanvasRenderingContext2D, engine: GameEngine): void {
  if (engine.flash > 0) {
    ctx.fillStyle = `rgba(140,24,18,${engine.flash * 0.16})`
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
  }
  const hp = engine.player.hp
  if (hp > 0 && hp <= 30 && engine.phase === 'playing') {
    const pulse = 0.5 + 0.5 * Math.sin(engine.time * 6)
    const alpha = 0.06 + pulse * 0.06
    ctx.fillStyle = `rgba(140,20,16,${alpha})`
    ctx.fillRect(0, 0, VIEW_W, 6)
    ctx.fillRect(0, VIEW_H - 10, VIEW_W, 10)
    ctx.fillRect(0, 0, 6, VIEW_H)
    ctx.fillRect(VIEW_W - 6, 0, 6, VIEW_H)
  }
}

// ─────────────────────────────────────────────────────────────
// Main render entry
// ─────────────────────────────────────────────────────────────

export function renderGame(ctx: CanvasRenderingContext2D, engine: GameEngine, reducedMotion: boolean): void {
  const cam = Math.round(engine.cameraX)
  const time = engine.time
  const shake = reducedMotion ? 0 : engine.shake
  const shakeX = Math.round(Math.sin(time * 73) * shake)
  const shakeY = Math.round(Math.cos(time * 97) * shake * 0.6)

  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, VIEW_W, VIEW_H)

  drawSky(ctx)
  drawStars(ctx, cam, time)
  drawMoon(ctx, time)
  drawClouds(ctx, cam, time)
  drawRidge(ctx, cam, time, 0.08, 2001, 190, 36, '#101a2a')
  drawRidge(ctx, cam, time, 0.15, 2101, 199, 25, '#0c1622')
  drawPylons(ctx, cam)
  drawHorizonHaze(ctx, time)
  drawRidge(ctx, cam, time, 0.22, 2201, 207, 13, '#0a131c')
  drawDistantTrees(ctx, cam, 0.44, '#0a141d', 27, 20, 52)
  drawDistantTrees(ctx, cam, 0.63, '#071018', 18, 14, 32)
  drawHauntedVillage(ctx, cam, time, engine.seed)

  ctx.save()
  ctx.translate(-cam + shakeX, shakeY)

  const visibleChunks = [...engine.chunks.values()].sort((a, b) => a.index - b.index)

  // Back props
  for (const chunk of visibleChunks) {
    for (const prop of chunk.props) {
      if (prop.depth === 'back') drawProp(ctx, prop, engine.seed, time)
    }
  }

  // Mid props behind the ground line
  for (const chunk of visibleChunks) {
    for (const prop of chunk.props) {
      if (prop.depth === 'mid' && prop.kind !== 'lamp') drawProp(ctx, prop, engine.seed, time)
    }
  }

  drawGround(ctx, engine, cam)

  // Lamp pools and heads above the ground.
  for (const chunk of visibleChunks) {
    for (const prop of chunk.props) {
      if (prop.kind === 'lamp') {
        const gy = groundHeightAt(engine.seed, prop.x)
        drawLamp(ctx, prop.x, gy + 2, prop.scale, prop.seed, time)
        const flicker = 0.8 + 0.2 * Math.sin(time * 9 + prop.seed * 30)
        ctx.globalAlpha = 0.2 * flicker
        ctx.fillStyle = PALETTE.lamp
        ctx.beginPath()
        ctx.ellipse(prop.x + 22, gy + 1, 34, 6, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }
    }
  }

  drawMotes(ctx, cam, time)

  for (const pickup of engine.pickups) drawPickup(ctx, pickup, time, engine.seed)

  for (const z of engine.zombies) drawZombie(ctx, z, time)

  drawSurvivor(ctx, engine)
  drawBullets(ctx, engine)
  drawParticles(ctx, engine.particles)
  if (engine.hitMarker) drawHitMarker(ctx, engine.hitMarker)

  for (const text of engine.texts) {
    const screenX = text.x - cam
    if (screenX < -14 || screenX > VIEW_W + 14) continue
    const alpha = Math.min(1, text.life / (text.maxLife * 0.5))
    drawPixelText(ctx, text.text, text.x, text.y, text.color, 1, alpha)
  }

  // Foreground props
  for (const chunk of visibleChunks) {
    for (const prop of chunk.props) {
      if (prop.depth === 'front') drawProp(ctx, prop, engine.seed, time)
    }
  }

  drawForegroundGrass(ctx, engine, cam)

  // In-world vignette-ish darkening at the lower edge.
  ctx.fillStyle = 'rgba(3,5,9,0.5)'
  ctx.fillRect(cam - 4, VIEW_H - 10, VIEW_W + 8, 14)

  ctx.restore()

  drawForegroundLayer(ctx, cam, engine.seed, time)
  drawMotes(ctx, cam, time)
  drawDamageFlash(ctx, engine)
  drawReticle(ctx, engine)
}
