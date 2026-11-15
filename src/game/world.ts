import { CHUNK_W, GROUND_BASE } from './constants'
import { hashInt, hashRange, mulberry32 } from './rng'
import type { Prop, TerrainChunk } from './types'

/**
 * Infinite, deterministic ground profile.
 * Two layers of smooth value noise keep slopes gentle enough to walk.
 * The result is identical for any x, so chunks can be unloaded and rebuilt
 * without seams or saved state.
 */
export function groundHeightAt(seed: number, x: number): number {
  const coarseScale = 310
  const c = x / coarseScale
  const ci = Math.floor(c)
  const ct = c - ci
  const ca = hashRange(seed, ci, -15, 7)
  const cb = hashRange(seed, ci + 1, -15, 7)
  const cs = ct * ct * (3 - 2 * ct)
  const coarse = ca + (cb - ca) * cs

  const fineScale = 61
  const f = x / fineScale
  const fi = Math.floor(f)
  const ft = f - fi
  const fa = hashRange(seed, fi * 7 + 90001, -2.6, 2.6)
  const fb = hashRange(seed, (fi + 1) * 7 + 90001, -2.6, 2.6)
  const fs = ft * ft * (3 - 2 * ft)
  const fine = fa + (fb - fa) * fs

  return GROUND_BASE + coarse + fine
}

const PROP_ORDER: Record<Prop['kind'], number> = {
  carriage: 0,
  waterTower: 1,
  house: 2,
  deadTree: 3,
  pine: 4,
  bush: 5,
  fence: 6,
  sign: 7,
  lamp: 8,
  rock: 9,
}

/** Deterministically builds one 480px slice of scenery. */
export function generateChunk(seed: number, index: number): TerrainChunk {
  const rand = mulberry32(hashInt(seed, index * 131 + 17))
  const startX = index * CHUNK_W
  const props: Prop[] = []

  const add = (kind: Prop['kind'], x: number, depth: Prop['depth'], variant = 0, scale = 1) => {
    props.push({
      kind,
      depth,
      x,
      seed: rand(),
      scale,
      variant,
    })
  }

  // A deliberately composed opening so every new run reads clearly at spawn.
  if (index === 0) {
    add('lamp', 104, 'mid', 0, 1)
    add('pine', 46, 'mid', 0, 1.1)
    add('pine', 414, 'mid', 1, 0.92)
    add('house', 292, 'back', 0, 1)
    add('fence', 198, 'mid', 0, 1)
    add('bush', 156, 'front', 0, 1)
    add('sign', 24, 'mid', 0, 1)
  } else if (index === 1) {
    add('lamp', 556, 'mid', 1, 1)
    add('house', 738, 'back', 1, 0.86)
    add('deadTree', 680, 'mid', 0, 1)
    add('pine', 845, 'mid', 0, 1.05)
    add('rock', 620, 'front', 0, 1)
  } else {
    if (rand() < 0.54) {
      add('house', startX + 28 + rand() * 96, 'back', Math.floor(rand() * 4), 0.82 + rand() * 0.38)
    }
    if (rand() < 0.1) {
      add('carriage', startX + 120 + rand() * 180, 'back', Math.floor(rand() * 3), 0.9 + rand() * 0.2)
    }
    if (rand() < 0.055) {
      add('waterTower', startX + 60 + rand() * 300, 'back', 0, 0.9 + rand() * 0.25)
    }

    if (rand() < 0.78) add('lamp', startX + 48 + rand() * 110, 'mid', Math.floor(rand() * 3), 1)
    if (rand() < 0.58) add('lamp', startX + 310 + rand() * 120, 'mid', Math.floor(rand() * 3), 1)

    const treeCount = 1 + Math.floor(rand() * 3)
    for (let i = 0; i < treeCount; i += 1) {
      const x = startX + rand() * CHUNK_W
      if (rand() < 0.72) {
        add('pine', x, 'mid', Math.floor(rand() * 3), 0.78 + rand() * 0.5)
      } else {
        add('deadTree', x, 'mid', Math.floor(rand() * 2), 0.8 + rand() * 0.45)
      }
    }

    if (rand() < 0.5) add('fence', startX + rand() * (CHUNK_W - 100), 'mid', Math.floor(rand() * 2), 0.85 + rand() * 0.3)
    if (rand() < 0.34) add('sign', startX + 20 + rand() * (CHUNK_W - 60), 'mid', Math.floor(rand() * 4), 1)
    if (rand() < 0.6) add('bush', startX + rand() * CHUNK_W, 'front', Math.floor(rand() * 3), 0.8 + rand() * 0.5)
    if (rand() < 0.48) add('rock', startX + rand() * CHUNK_W, 'front', Math.floor(rand() * 3), 0.7 + rand() * 0.7)
  }

  props.sort((a, b) => PROP_ORDER[a.kind] - PROP_ORDER[b.kind] || a.x - b.x)
  return { index, startX, props }
}

/** Lamp positions near a world x, used to paint warm ground pools. */
export function findLamps(chunks: Iterable<TerrainChunk>, seed: number): Array<{ x: number; y: number; variant: number }> {
  const lamps: Array<{ x: number; y: number; variant: number }> = []
  for (const chunk of chunks) {
    for (const prop of chunk.props) {
      if (prop.kind === 'lamp') {
        lamps.push({ x: prop.x, y: groundHeightAt(seed, prop.x), variant: prop.variant })
      }
    }
  }
  return lamps
}
