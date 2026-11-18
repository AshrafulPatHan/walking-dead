export type GamePhase = 'menu' | 'playing' | 'paused' | 'dead'

export type WeaponId = 'pipe' | 'pistol' | 'mg'

export type WeaponKind = 'melee' | 'ranged'

export interface WeaponDef {
  id: WeaponId
  name: string
  slot: number
  kind: WeaponKind
  damage: number
  /** Seconds between attacks. */
  cooldown: number
  /** Starting rounds. -1 means unlimited. */
  ammo: number
  /** Projectile speed in world px/second. */
  speed: number
  /** Spread in radians. */
  spread: number
  knockback: number
  hint: string
}

export type ZombieType = 'walker' | 'runner' | 'brute'

export type ZombieState = 'idle' | 'chase' | 'attack' | 'die'

/** How the world reads in a given stretch of track. */
export type District = 'rail' | 'village' | 'woods' | 'yard' | 'outskirts' | 'graveyard'

export interface Player {
  x: number
  /** Feet position. */
  y: number
  vx: number
  vy: number
  w: number
  h: number
  facing: 1 | -1
  crouching: boolean
  onGround: boolean
  coyote: number
  jumpBuffer: number
  prevJump: boolean
  hp: number
  maxHp: number
  weapon: WeaponId
  ammo: Record<WeaponId, number>
  aim: number
  cooldown: number
  attackAnim: number
  attackDir: number
  muzzle: number
  recoil: number
  invuln: number
  hurt: number
  walkPhase: number
  moving: boolean
  noise: number
}

export interface Zombie {
  id: number
  type: ZombieType
  x: number
  /** Feet position. */
  y: number
  vx: number
  vy: number
  w: number
  h: number
  hp: number
  maxHp: number
  state: ZombieState
  facing: 1 | -1
  /** Idle sway / walk cycle phase. */
  anim: number
  /** Attack wind-up or death timer, depending on state. */
  timer: number
  cooldown: number
  hurt: number
  hasStruck: boolean
  speed: number
  damage: number
  points: number
  onGround: boolean
  seed: number
  deathDuration: number
  /** Which side of the player this one entered from. */
  spawnSide: 1 | -1
  /** Countdown until this zombie notices the player regardless of distance. */
  wakeDelay: number
  /** Short catch-up burst used by flankers so they can close a running gap. */
  sprint: number
}

export interface Bullet {
  x: number
  y: number
  px: number
  py: number
  vx: number
  vy: number
  damage: number
  life: number
  fromPlayer: boolean
}

export type PickupKind = 'materials' | 'pistol_ammo' | 'mg_ammo' | 'medkit'

export interface Pickup {
  id: number
  kind: PickupKind
  x: number
  y: number
  vx: number
  vy: number
  value: number
  age: number
  grounded: boolean
  magnet: boolean
  bob: number
}

export type ParticleShape = 'square' | 'spark' | 'smoke'

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: string
  gravity: number
  drag: number
  shape: ParticleShape
}

export interface FloatText {
  x: number
  y: number
  vy: number
  life: number
  maxLife: number
  text: string
  color: string
}

export type PropKind =
  | 'house'
  | 'pine'
  | 'deadTree'
  | 'lamp'
  | 'fence'
  | 'sign'
  | 'bush'
  | 'rock'
  | 'carriage'
  | 'waterTower'
  | 'bench'
  | 'trashCan'
  | 'barrel'
  | 'crate'
  | 'gravestone'
  | 'car'

export type PropDepth = 'back' | 'mid' | 'front'

export interface Prop {
  kind: PropKind
  depth: PropDepth
  x: number
  seed: number
  scale: number
  variant: number
}

export interface TerrainChunk {
  index: number
  startX: number
  props: Prop[]
  district: District
}

/**
 * A solid wrecked car on the line.
 *
 * `top` is the world y of the roof: the player can stand on it, but nobody
 * below can climb up, so a roof is a safe firing position.
 */
export interface CarObstacle {
  /** Center of the car in world space. */
  x: number
  /** Half the body width. */
  halfW: number
  /** World y of the roof (smaller y = higher). */
  top: number
}

export interface Toast {
  id: number
  text: string
  tone: 'info' | 'warn' | 'good'
  life: number
}

export interface InputState {
  left: boolean
  right: boolean
  jump: boolean
  crouch: boolean
  fire: boolean
  /** Aim point in logical canvas coordinates. */
  aimX: number
  aimY: number
  /** True once the player has actually moved the mouse. */
  mouseActive: boolean
}

export interface WeaponHud {
  id: WeaponId
  name: string
  ammo: number
  active: boolean
  slot: number
  kind: WeaponKind
}

export interface HudState {
  phase: GamePhase
  seed: string
  health: number
  maxHealth: number
  weapon: WeaponId
  weapons: WeaponHud[]
  materials: number
  score: number
  kills: number
  distance: number
  time: number
  wave: number
  streak: number
  multiplier: number
  bestMultiplier: number
  canWeld: boolean
  muted: boolean
  toast: Toast | null
}
