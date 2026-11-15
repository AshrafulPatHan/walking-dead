/** Deterministic 32-bit mixing hash. Same inputs always give the same output. */
export function hashInt(seed: number, n: number): number {
  let h = seed ^ Math.imul(n | 0, 0x27d4eb2d)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

/** Deterministic float in [0, 1). */
export function hash01(seed: number, n: number): number {
  return hashInt(seed, n) / 4294967296
}

/** Deterministic float in a range. */
export function hashRange(seed: number, n: number, min: number, max: number): number {
  return min + hash01(seed, n) * (max - min)
}

/** Small fast seeded PRNG for per-chunk prop layout. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function pick<T>(rand: () => number, list: readonly T[]): T {
  return list[Math.floor(rand() * list.length) % list.length]
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

export function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

export function newSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0
}
