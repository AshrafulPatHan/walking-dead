import { CHUNK_W, GROUND_BASE } from './constants'
import { hash01, hashInt, hashRange, mulberry32 } from './rng'
import type { District, Prop, TerrainChunk } from './types'

/**
 * Infinite, deterministic ground profile.
 *
 * Three layers of smooth value noise keep slopes gentle enough to walk while
 * the macro layer slowly changes how hilly a stretch of line feels. Because
 * every layer is a pure function of x, any chunk can be thrown away and
 * rebuilt later without a seam, a save file, or a world boundary.
 */
export function groundHeightAt(seed: number, x: number): number {
  const macro = 0.78 + 0.34 * Math.sin(x / 760 + hashRange(seed ^ 0xa511e, 77, 0, Math.PI * 2))

  const coarseScale = 310
  const c = x / coarseScale
  const ci = Math.floor(c)
  const ct = c - ci
  const ca = hashRange(seed, ci, -15, 7)
  const cb = hashRange(seed, ci + 1, -15, 7)
  const cs = ct * ct * (3 - 2 * ct)
  const coarse = (ca + (cb - ca) * cs) * macro

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

const DISTRICTS: District[] = [
  'rail',
  'rail',
  'village',
  'woods',
  'outskirts',
  'yard',
  'village',
  'graveyard',
  'rail',
  'woods',
]

/**
 * Districts are selected per three-chunk "region" from the run seed, so two
 * runs never share the same sequence of places.
 */
export function districtAt(seed: number, chunkIndex: number): District {
  if (chunkIndex === 0) return 'rail'
  if (chunkIndex === 1) return 'village'
  const region = Math.floor(chunkIndex / 3)
  const roll = hash01(seed ^ 0x5bd1e995, region + 11)
  return DISTRICTS[Math.floor(roll * DISTRICTS.length) % DISTRICTS.length]
}

const PROP_ORDER: Record<Prop['kind'], number> = {
  carriage: 0,
  waterTower: 1,
  house: 2,
  gravestone: 3,
  deadTree: 4,
  pine: 5,
  bench: 6,
  fence: 7,
  trashCan: 8,
  barrel: 9,
  crate: 10,
  sign: 11,
  lamp: 12,
  bush: 13,
  rock: 14,
}

/** Deterministically builds one 480px slice of scenery. */
export function generateChunk(seed: number, index: number): TerrainChunk {
  const rand = mulberry32(hashInt(seed ^ 0x27d4eb2d, Math.imul(index, 0x9e3779b1) + 17))
  const startX = index * CHUNK_W
  const district = districtAt(seed, index)
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

  const addLamp = (x: number, depth: Prop['depth'] = 'mid') => {
    const variant = Math.floor(rand() * 3)
    add('lamp', x, depth, variant, 1)
    // Street furniture clusters naturally around a working light.
    const roll = rand()
    if (roll < 0.46) add('bench', x + 18 + rand() * 10, 'mid', Math.floor(rand() * 3), 1)
    else if (roll < 0.78) add('trashCan', x + 16 + rand() * 12, 'mid', Math.floor(rand() * 3), 1)
    if (rand() < 0.24) add('trashCan', x - 18 - rand() * 8, 'mid', Math.floor(rand() * 3), 1)
  }

  const addVillageHouse = (x: number) => {
    const variant = Math.floor(rand() * 4)
    add('house', x, 'back', variant, 0.78 + rand() * 0.38)
    if (variant === 0 && rand() < 0.7) add('fence', x - 26 - rand() * 22, 'mid', 0, 0.8 + rand() * 0.3)
  }

  const scatterBench = (chance: number) => {
    if (rand() < chance) add('bench', startX + 24 + rand() * (CHUNK_W - 60), 'mid', Math.floor(rand() * 3), 1)
  }

  const scatterTrash = (chance: number) => {
    if (rand() < chance) add('trashCan', startX + 20 + rand() * (CHUNK_W - 50), 'mid', Math.floor(rand() * 3), 1)
  }

  // A composed opening, but the layout, variants and extra litter are still
  // seeded so two runs never open on exactly the same stretch of line.
  if (index === 0) {
    const lampX = 96 + rand() * 18
    add('lamp', lampX, 'mid', Math.floor(rand() * 3), 1)
    add('pine', 38 + rand() * 18, 'mid', Math.floor(rand() * 3), 1.02 + rand() * 0.16)
    add('pine', 404 + rand() * 22, 'mid', Math.floor(rand() * 3), 0.86 + rand() * 0.18)
    add('house', 278 + rand() * 30, 'back', Math.floor(rand() * 4), 0.96 + rand() * 0.1)
    add('fence', 186 + rand() * 26, 'mid', Math.floor(rand() * 2), 0.95 + rand() * 0.12)
    add('bench', lampX + 32 + rand() * 12, 'mid', Math.floor(rand() * 3), 1)
    add('trashCan', lampX + 56 + rand() * 12, 'mid', Math.floor(rand() * 3), 1)
    add('bush', 342 + rand() * 30, 'front', Math.floor(rand() * 3), 0.8 + rand() * 0.35)
    add('sign', 20 + rand() * 14, 'mid', Math.floor(rand() * 4), 1)
    if (rand() < 0.5) add('rock', 372 + rand() * 40, 'front', Math.floor(rand() * 3), 0.8 + rand() * 0.4)
  } else if (index === 1) {
    addVillageHouse(722 + rand() * 32)
    addLamp(548 + rand() * 20, 'mid')
    add('deadTree', 668 + rand() * 24, 'mid', Math.floor(rand() * 2), 0.9 + rand() * 0.2)
    add('pine', 838 + rand() * 20, 'mid', Math.floor(rand() * 3), 0.95 + rand() * 0.2)
    add('gravestone', 638 + rand() * 12, 'mid', 0, 1)
    add('gravestone', 654 + rand() * 12, 'mid', 1, 0.86)
    add('bench', 574 + rand() * 12, 'mid', Math.floor(rand() * 3), 1)
    add('trashCan', 590 + rand() * 12, 'mid', Math.floor(rand() * 3), 1)
    add('rock', 612 + rand() * 16, 'front', 0, 1)
    if (rand() < 0.6) add('barrel', 700 + rand() * 40, 'mid', Math.floor(rand() * 2), 0.9)
  } else {
    const region = Math.floor(index / 3)
    const landmark = hash01(seed ^ 0x6c078965, region)
    const inLandmarkChunk = index % 3 === 0 && landmark > 0.78

    if (district === 'village') {
      addVillageHouse(startX + 36 + rand() * 110)
      if (rand() < 0.55) addVillageHouse(startX + 280 + rand() * 120)
      if (rand() < 0.42) {
        const gx = startX + 170 + rand() * 160
        const count = 2 + Math.floor(rand() * 4)
        for (let i = 0; i < count; i += 1) {
          add('gravestone', gx + i * (8 + rand() * 7) - count * 5, 'mid', Math.floor(rand() * 2), 0.82 + rand() * 0.3)
        }
      }
      addLamp(startX + 120 + rand() * 180, 'back')
      if (rand() < 0.66) scatterBench(0.8)
      if (rand() < 0.62) scatterTrash(0.8)
      if (rand() < 0.5) add('fence', startX + rand() * 250, 'mid', 0, 0.8 + rand() * 0.35)
      if (rand() < 0.45) add('deadTree', startX + rand() * CHUNK_W, 'mid', 0, 0.8 + rand() * 0.4)
    } else if (district === 'woods') {
      const treeCount = 2 + Math.floor(rand() * 4)
      for (let i = 0; i < treeCount; i += 1) {
        const x = startX + 20 + rand() * (CHUNK_W - 40)
        if (rand() < 0.6) add('pine', x, 'mid', Math.floor(rand() * 3), 0.78 + rand() * 0.5)
        else add('deadTree', x, 'mid', Math.floor(rand() * 2), 0.75 + rand() * 0.45)
      }
      if (rand() < 0.35) add('lamp', startX + 60 + rand() * 360, 'mid', Math.floor(rand() * 3), 1)
      if (rand() < 0.55) add('bush', startX + rand() * CHUNK_W, 'front', Math.floor(rand() * 3), 0.8 + rand() * 0.5)
      if (rand() < 0.45) add('rock', startX + rand() * CHUNK_W, 'front', Math.floor(rand() * 3), 0.7 + rand() * 0.7)
      scatterBench(0.12)
    } else if (district === 'yard') {
      if (rand() < 0.62) add('carriage', startX + 40 + rand() * 220, 'back', Math.floor(rand() * 3), 0.86 + rand() * 0.24)
      if (rand() < 0.48) add('waterTower', startX + 180 + rand() * 220, 'back', 0, 0.9 + rand() * 0.25)
      addLamp(startX + 90 + rand() * 260, 'mid')
      const crateCount = 1 + Math.floor(rand() * 3)
      for (let i = 0; i < crateCount; i += 1) {
        add('crate', startX + 90 + rand() * 300, 'mid', Math.floor(rand() * 2), 0.9 + rand() * 0.3)
      }
      if (rand() < 0.7) add('barrel', startX + 70 + rand() * 330, 'mid', Math.floor(rand() * 2), 0.85 + rand() * 0.3)
      if (rand() < 0.55) add('fence', startX + rand() * 300, 'mid', 1, 0.9 + rand() * 0.25)
      if (rand() < 0.5) add('sign', startX + 20 + rand() * (CHUNK_W - 60), 'mid', Math.floor(rand() * 4), 1)
      scatterTrash(0.3)
    } else if (district === 'graveyard') {
      if (rand() < 0.7) addVillageHouse(startX + 60 + rand() * 160)
      const gx = startX + 40 + rand() * 100
      const count = 4 + Math.floor(rand() * 5)
      for (let i = 0; i < count; i += 1) {
        add('gravestone', gx + i * (9 + rand() * 8), 'mid', Math.floor(rand() * 2), 0.8 + rand() * 0.4)
      }
      if (rand() < 0.7) add('fence', startX + 30 + rand() * 120, 'mid', 1, 1)
      if (rand() < 0.8) add('deadTree', startX + 180 + rand() * 240, 'mid', 0, 0.9 + rand() * 0.5)
      if (rand() < 0.4) add('lamp', startX + 220 + rand() * 200, 'mid', Math.floor(rand() * 3), 1)
      scatterBench(0.18)
    } else if (district === 'outskirts') {
      if (rand() < 0.38) addVillageHouse(startX + 40 + rand() * 340)
      if (rand() < 0.4) add('lamp', startX + 50 + rand() * 380, 'mid', Math.floor(rand() * 3), 1)
      if (rand() < 0.5) add('deadTree', startX + rand() * CHUNK_W, 'mid', 0, 0.8 + rand() * 0.5)
      if (rand() < 0.35) add('rock', startX + rand() * CHUNK_W, 'front', Math.floor(rand() * 3), 0.7 + rand() * 0.7)
      if (rand() < 0.35) add('sign', startX + 20 + rand() * (CHUNK_W - 60), 'mid', Math.floor(rand() * 4), 1)
      scatterBench(0.14)
      scatterTrash(0.16)
    } else {
      // Rail: the line itself, lamps, benches and platform odds and ends.
      addLamp(startX + 48 + rand() * 110, 'mid')
      if (rand() < 0.58) addLamp(startX + 310 + rand() * 120, 'mid')
      if (rand() < 0.55) add('fence', startX + rand() * (CHUNK_W - 100), 'mid', Math.floor(rand() * 2), 0.85 + rand() * 0.3)
      if (rand() < 0.42) add('sign', startX + 20 + rand() * (CHUNK_W - 60), 'mid', Math.floor(rand() * 4), 1)
      if (rand() < 0.42) add('bush', startX + rand() * CHUNK_W, 'front', Math.floor(rand() * 3), 0.8 + rand() * 0.5)
      if (rand() < 0.38) add('rock', startX + rand() * CHUNK_W, 'front', Math.floor(rand() * 3), 0.7 + rand() * 0.7)
      if (rand() < 0.3) add('crate', startX + 40 + rand() * 380, 'mid', Math.floor(rand() * 2), 0.8 + rand() * 0.3)
      if (rand() < 0.26) add('barrel', startX + 40 + rand() * 380, 'mid', Math.floor(rand() * 2), 0.8 + rand() * 0.3)
      scatterBench(0.22)
      scatterTrash(0.24)
    }

    // Landmarks make a run memorable without breaking the endless line.
    if (inLandmarkChunk) {
      if (landmark > 0.9) {
        add('waterTower', startX + 120 + rand() * 220, 'back', 0, 1.05)
        addLamp(startX + 270, 'mid')
      } else {
        add('carriage', startX + 60 + rand() * 180, 'back', Math.floor(rand() * 3), 0.95)
        add('house', startX + 300 + rand() * 100, 'back', 3, 0.86)
        add('gravestone', startX + 40 + rand() * 100, 'mid', 0, 1)
      }
    }
  }

  props.sort((a, b) => PROP_ORDER[a.kind] - PROP_ORDER[b.kind] || a.x - b.x)
  return { index, startX, props, district }
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
