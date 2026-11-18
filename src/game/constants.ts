import type { WeaponDef, WeaponId, ZombieType } from './types'

export const VIEW_W = 480
export const VIEW_H = 270

export const CHUNK_W = 480
export const GROUND_BASE = 212

export const GRAVITY = 1020
export const PLAYER_SPEED = 104
export const PLAYER_CROUCH_SPEED = 52
export const PLAYER_JUMP = -318
export const PLAYER_W = 12

export const PIPE_RANGE = 34
export const MAX_PARTICLES = 260

/** Wrecked car obstacle: body width, roof height above the ground, spawn chance per chunk. */
export const CAR_W = 44
export const CAR_H = 30
export const CAR_CHANCE = 0.34

export const WELD_COST = 40
export const WELD_AMOUNT = 25

export const PHASE_LABEL: Record<string, string> = {
  menu: 'standby',
  playing: 'in transit',
  paused: 'held',
  dead: 'end of line',
}

export const PALETTE = {
  ink: '#05080d',
  skyTop: '#05070d',
  skyMid: '#101a2b',
  skyGlow: '#7f4a3c',
  moon: '#efe6c6',
  hillFar: '#111a28',
  hillNear: '#0b131d',
  fog: '#3a516b',
  pineFar: '#0a141d',
  house: '#161f2b',
  houseDark: '#0e151e',
  roof: '#0b1119',
  window: '#f0b45a',
  windowDim: '#8a6534',
  lamp: '#ffd08a',
  groundGrass: '#414b3a',
  groundEdge: '#283124',
  dirt: '#141920',
  dirtDark: '#0d1117',
  ballast: '#23262a',
  sleeper: '#2b211a',
  railRust: '#7a4a35',
  railSteel: '#99a4ae',
  skin: '#d29b68',
  skinShade: '#a9744b',
  hair: '#241f1c',
  jacket: '#48584f',
  jacketDark: '#33413b',
  pants: '#29323a',
  boots: '#15191d',
  scarf: '#b4472f',
  pipe: '#9aa4ae',
  metal: '#5b6875',
  gun: '#252c34',
  zombieSkin: '#8d9a63',
  zombieSkinDark: '#667144',
  zombieShirt: '#3d4a50',
  zombiePants: '#242a30',
  eye: '#e4543b',
  blood: '#8f2c22',
  amber: '#f0b45a',
  bone: '#e8dfc6',
}

export const FONT_CANVAS = '"Silkscreen", monospace'

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pipe: {
    id: 'pipe',
    name: 'Pipe',
    slot: 1,
    kind: 'melee',
    damage: 48,
    cooldown: 0.34,
    ammo: -1,
    speed: 0,
    spread: 0,
    knockback: 110,
    hint: 'Close range · quiet',
  },
  pistol: {
    id: 'pistol',
    name: 'Pistol',
    slot: 2,
    kind: 'ranged',
    damage: 38,
    cooldown: 0.24,
    ammo: 1200,
    speed: 540,
    spread: 0.012,
    knockback: 42,
    hint: 'Precise · steadies when crouched',
  },
  mg: {
    id: 'mg',
    name: 'Machine gun',
    slot: 3,
    kind: 'ranged',
    damage: 15,
    cooldown: 0.075,
    ammo: 9000,
    speed: 600,
    spread: 0.085,
    knockback: 16,
    hint: 'Wide spread · hold to fire',
  },
}

export const WEAPON_ORDER: WeaponId[] = ['pipe', 'pistol', 'mg']

export interface ZombieStat {
  hp: number
  speed: number
  damage: number
  points: number
  w: number
  h: number
  deathDuration: number
}

export const ZOMBIE_STATS: Record<ZombieType, ZombieStat> = {
  walker: { hp: 60, speed: 27, damage: 10, points: 100, w: 11, h: 28, deathDuration: 1.15 },
  runner: { hp: 40, speed: 66, damage: 8, points: 160, w: 9, h: 25, deathDuration: 0.9 },
  brute: { hp: 230, speed: 21, damage: 24, points: 400, w: 17, h: 37, deathDuration: 1.5 },
}

export const SPAWN_MIN_INTERVAL = 0.6
export const ZOMBIE_CAP = 18
