import {
  CHUNK_W,
  GRAVITY,
  MAX_PARTICLES,
  PALETTE,
  PLAYER_CROUCH_SPEED,
  PLAYER_JUMP,
  PLAYER_SPEED,
  PLAYER_W,
  PIPE_RANGE,
  SPAWN_MIN_INTERVAL,
  VIEW_H,
  VIEW_W,
  WEAPONS,
  WEAPON_ORDER,
  WELD_AMOUNT,
  WELD_COST,
  ZOMBIE_CAP,
  ZOMBIE_STATS,
} from './constants'
import { sound } from './audio'
import { clamp, newSeed, randRange } from './rng'
import { generateChunk, groundHeightAt } from './world'
import type {
  Bullet,
  FloatText,
  GamePhase,
  HudState,
  InputState,
  Particle,
  ParticleShape,
  Pickup,
  PickupKind,
  Player,
  TerrainChunk,
  Toast,
  WeaponId,
  Zombie,
  ZombieType,
} from './types'

const PLAYER_START_X = 200
const SPAWN_OFFSCREEN = 42

function approach(value: number, target: number, amount: number): number {
  if (value < target) return Math.min(target, value + amount)
  return Math.max(target, value - amount)
}

function createPlayer(x: number, y: number): Player {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    w: PLAYER_W,
    h: 30,
    facing: 1,
    crouching: false,
    onGround: true,
    coyote: 0,
    jumpBuffer: 0,
    prevJump: false,
    hp: 100,
    maxHp: 100,
    weapon: 'pipe',
    ammo: {
      pipe: -1,
      pistol: WEAPONS.pistol.ammo,
      mg: WEAPONS.mg.ammo,
    },
    aim: 0,
    cooldown: 0,
    attackAnim: 0,
    attackDir: 0,
    muzzle: 0,
    recoil: 0,
    invuln: 0,
    hurt: 0,
    walkPhase: 0,
    moving: false,
    noise: 0,
  }
}

/** Liang–Barsky test: does the segment cross the axis-aligned box? */
function segmentHitsRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): boolean {
  let t0 = 0
  let t1 = 1
  const dx = x2 - x1
  const dy = y2 - y1
  const checks: Array<[number, number]> = [
    [-dx, x1 - minX],
    [dx, maxX - x1],
    [-dy, y1 - minY],
    [dy, maxY - y1],
  ]
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return false
    } else {
      const r = q / p
      if (p < 0) {
        if (r > t1) return false
        if (r > t0) t0 = r
      } else {
        if (r < t0) return false
        if (r < t1) t1 = r
      }
    }
  }
  return true
}

export class GameEngine {
  phase: GamePhase = 'menu'
  seed = newSeed()
  player: Player = createPlayer(PLAYER_START_X, 0)
  zombies: Zombie[] = []
  bullets: Bullet[] = []
  pickups: Pickup[] = []
  particles: Particle[] = []
  texts: FloatText[] = []
  chunks = new Map<number, TerrainChunk>()

  input: InputState = {
    left: false,
    right: false,
    jump: false,
    crouch: false,
    fire: false,
    aimX: VIEW_W * 0.7,
    aimY: VIEW_H * 0.5,
    mouseActive: false,
  }

  cameraX = 0
  shake = 0
  flash = 0
  elapsed = 0
  time = 0
  wave = 1
  score = 0
  kills = 0
  materials = 0
  combo = 0
  comboTimer = 0
  bestMultiplier = 1
  maxProgress = 0
  startX = PLAYER_START_X
  spawnTimer = 1.8
  toast: Toast | null = null
  weldCooldown = 0
  private toastId = 0
  private zombieId = 1
  private pickupId = 1
  private lastHitSound = 0
  private aimAngle = 0

  constructor() {
    this.reset('menu', newSeed())
  }

  reset(phase: GamePhase, seed = newSeed()): void {
    this.seed = seed
    this.phase = phase
    const ground = groundHeightAt(seed, PLAYER_START_X)
    this.player = createPlayer(PLAYER_START_X, ground)
    this.zombies = []
    this.bullets = []
    this.pickups = []
    this.particles = []
    this.texts = []
    this.chunks.clear()
    this.eventsReset()
    this.cameraX = PLAYER_START_X - 190
    this.elapsed = 0
    this.wave = 1
    this.score = 0
    this.kills = 0
    this.materials = 0
    this.combo = 0
    this.comboTimer = 0
    this.bestMultiplier = 1
    this.startX = PLAYER_START_X
    this.maxProgress = 0
    this.spawnTimer = 4.2
    this.toast = null
    this.weldCooldown = 0
    this.shake = 0
    this.flash = 0
    this.ensureChunks()
  }

  private eventsReset(): void {
    this.time = 0
    this.bullets.length = 0
  }

  startRun(): void {
    sound.unlock()
    this.reset('playing', newSeed())
    this.setToast('RUN STARTED · KEEP MOVING', 'info')
    this.player.weapon = 'pipe'
    sound.ui()
  }

  toMenu(): void {
    sound.ui()
    this.reset('menu', newSeed())
  }

  pause(): void {
    if (this.phase !== 'playing') return
    this.phase = 'paused'
    this.input.fire = false
    sound.ui()
  }

  resume(): void {
    if (this.phase !== 'paused') return
    this.phase = 'playing'
    this.input.fire = false
    sound.ui()
  }

  selectWeapon(id: WeaponId): void {
    if (this.phase !== 'playing' && this.phase !== 'menu') return
    if (this.player.weapon === id) return
    this.player.weapon = id
    this.player.cooldown = Math.max(this.player.cooldown, 0.12)
    this.player.muzzle = 0
    sound.ui()
  }

  cycleWeapon(direction = 1): void {
    const index = WEAPON_ORDER.indexOf(this.player.weapon)
    const next = (index + direction + WEAPON_ORDER.length) % WEAPON_ORDER.length
    this.selectWeapon(WEAPON_ORDER[next])
  }

  weld(): void {
    if (this.phase !== 'playing' || this.weldCooldown > 0) return
    const p = this.player
    if (p.hp >= p.maxHp) {
      this.setToast('CONDITION ALREADY FULL', 'info')
      return
    }
    if (this.materials < WELD_COST) {
      this.setToast(`NEED ${WELD_COST} MATERIALS TO WELD`, 'warn')
      return
    }
    this.materials -= WELD_COST
    p.hp = Math.min(p.maxHp, p.hp + WELD_AMOUNT)
    this.weldCooldown = 1.1
    this.setToast(`WELDED · +${WELD_AMOUNT} CONDITION`, 'good')
    sound.weld()
    this.burst(p.x, p.y - p.h * 0.5, 10, {
      color: PALETTE.amber,
      speed: 60,
      life: 0.5,
      size: 1,
      gravity: -20,
      shape: 'spark',
    })
  }

  getHud(muted: boolean): HudState {
    const p = this.player
    return {
      phase: this.phase,
      seed: this.seed.toString(16).toUpperCase().padStart(8, '0').slice(-6),
      health: Math.max(0, Math.round(p.hp)),
      maxHealth: p.maxHp,
      weapon: p.weapon,
      weapons: WEAPON_ORDER.map((id) => ({
        id,
        name: WEAPONS[id].name,
        ammo: p.ammo[id],
        active: p.weapon === id,
        slot: WEAPONS[id].slot,
        kind: WEAPONS[id].kind,
      })),
      materials: this.materials,
      score: Math.floor(this.score),
      kills: this.kills,
      distance: Math.floor(Math.max(0, this.maxProgress) / 8),
      time: this.elapsed,
      wave: this.wave,
      streak: this.combo,
      multiplier: this.multiplier,
      bestMultiplier: this.bestMultiplier,
      canWeld: this.materials >= WELD_COST && p.hp < p.maxHp,
      muted,
      toast: this.toast ? { ...this.toast } : null,
    }
  }

  get multiplier(): number {
    return clamp(1 + Math.floor(this.combo / 3), 1, 5)
  }

  update(dt: number): void {
    const step = clamp(dt, 0, 0.05)
    if (this.phase === 'paused') return

    this.time += step
    this.shake = Math.max(0, this.shake - step * 16)
    this.flash = Math.max(0, this.flash - step * 2.4)
    this.weldCooldown = Math.max(0, this.weldCooldown - step)

    if (this.toast) {
      this.toast.life -= step
      if (this.toast.life <= 0) this.toast = null
    }

    if (this.phase === 'playing') {
      this.elapsed += step
      this.updatePlaying(step)
    } else if (this.phase === 'menu') {
      this.updateMenu(step)
    } else if (this.phase === 'dead') {
      this.updateAfterDeath(step)
    }

    this.updateParticles(step)
    this.updateTexts(step)
    this.pickups.forEach((pickup) => {
      pickup.age += step
    })
    this.updateCamera(step)
  }

  // ─────────────────────────────────────────────────────────────
  // Menu / death idle states
  // ─────────────────────────────────────────────────────────────

  private updateMenu(dt: number): void {
    const p = this.player
    p.walkPhase += dt * 1.6
    p.h = p.onGround ? 30 : p.h
    const ground = groundHeightAt(this.seed, p.x)
    p.y = ground
    p.vx = 0
    p.vy = 0
    p.facing = 1
    p.aim = 0
    this.cameraX = p.x - 326 + Math.sin(this.time * 0.16) * 32
    this.ensureChunks()
  }

  private updateAfterDeath(dt: number): void {
    this.zombies.forEach((z) => {
      z.anim += dt * 1.4
    })
    this.player.attackAnim = Math.max(0, this.player.attackAnim - dt)
    this.player.muzzle = 0
  }

  // ─────────────────────────────────────────────────────────────
  // Main gameplay
  // ─────────────────────────────────────────────────────────────

  private updatePlaying(dt: number): void {
    const p = this.player
    this.updateAim()
    this.updatePlayer(dt)
    this.updateSpawner(dt)
    this.updateZombies(dt)
    this.updateBullets(dt)
    this.updatePickups(dt)
    this.updateCombo(dt)
    this.refreshChunks()
    this.maxProgress = Math.max(this.maxProgress, p.x - this.startX)

    const nextWave = 1 + Math.floor(this.elapsed / 42)
    if (nextWave > this.wave) {
      this.wave = nextWave
      this.setToast(`WAVE ${this.wave} · THEY HEARD THE SHOT`, 'warn')
      sound.wave()
      this.shake = Math.max(this.shake, 2)
      this.spawnBurst(Math.min(4, 1 + Math.floor(this.wave / 2)))
    }

    if (p.hp <= 0) {
      this.killPlayer()
    }
  }

  private updateAim(): void {
    const p = this.player
    const wx = this.cameraX + this.input.aimX
    const wy = this.input.aimY
    const cx = p.x
    const cy = p.y - p.h * 0.58
    if (Math.hypot(wx - cx, wy - cy) > 9) {
      this.aimAngle = Math.atan2(wy - cy, wx - cx)
    }
    if (this.input.mouseActive) {
      p.aim = this.aimAngle
      if (Math.abs(Math.cos(p.aim)) > 0.25) {
        p.facing = Math.cos(p.aim) >= 0 ? 1 : -1
      }
    } else {
      // Keyboard / touch fallback: snap aim to the closest threat when firing.
      let target: Zombie | null = null
      let best = 260
      if (this.input.fire) {
        for (const z of this.zombies) {
          if (z.state === 'die') continue
          const d = Math.hypot(z.x - p.x, z.y - z.h * 0.5 - (p.y - p.h * 0.58))
          if (d < best) {
            best = d
            target = z
          }
        }
      }
      if (target) {
        const tx = target.x - p.x
        const ty = target.y - target.h * 0.5 - (p.y - p.h * 0.58)
        p.aim = Math.atan2(ty, tx)
        p.facing = tx >= 0 ? 1 : -1
      } else {
        p.aim = p.facing === 1 ? 0 : Math.PI
      }
    }
  }

  private updatePlayer(dt: number): void {
    const p = this.player
    p.cooldown = Math.max(0, p.cooldown - dt)
    p.attackAnim = Math.max(0, p.attackAnim - dt)
    p.muzzle = Math.max(0, p.muzzle - dt)
    p.recoil = Math.max(0, p.recoil - dt * 8)
    p.invuln = Math.max(0, p.invuln - dt)
    p.hurt = Math.max(0, p.hurt - dt)
    p.noise = Math.max(0, p.noise - dt)

    const canCrouch = this.input.crouch && p.onGround
    p.crouching = canCrouch
    p.h = canCrouch ? 21 : 30

    const move = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0)
    p.moving = move !== 0
    const speed = canCrouch ? PLAYER_CROUCH_SPEED : PLAYER_SPEED
    const accel = p.onGround ? 1400 : 720
    p.vx = approach(p.vx, move * speed, accel * dt)
    if (move === 0) {
      p.vx = approach(p.vx, 0, (p.onGround ? 1500 : 160) * dt)
    }

    if (move !== 0 && !this.input.mouseActive) {
      p.facing = move > 0 ? 1 : -1
    }

    // Jump buffering + coyote time for a forgiving, snappy jump.
    if (this.input.jump && !p.prevJump) p.jumpBuffer = 0.12
    p.prevJump = this.input.jump
    p.jumpBuffer = Math.max(0, p.jumpBuffer - dt)
    p.coyote = p.onGround ? 0.1 : Math.max(0, p.coyote - dt)
    if (p.jumpBuffer > 0 && p.coyote > 0) {
      p.vy = PLAYER_JUMP
      p.onGround = false
      p.coyote = 0
      p.jumpBuffer = 0
      p.crouching = false
      this.burst(p.x, p.y, 5, {
        color: '#5b5b4b',
        speed: 24,
        life: 0.35,
        size: 1,
        gravity: 20,
      })
    }
    if (!this.input.jump && p.vy < -110) p.vy = -110

    const wasGrounded = p.onGround
    p.x += p.vx * dt
    p.vy += GRAVITY * dt
    p.y += p.vy * dt

    const ground = groundHeightAt(this.seed, p.x)
    if (p.y >= ground) {
      if (!wasGrounded && p.vy > 220) {
        this.burst(p.x, p.y, 6, {
          color: '#64614f',
          speed: 30,
          life: 0.3,
          size: 1,
          gravity: 40,
        })
      }
      p.y = ground
      p.vy = 0
      p.onGround = true
    } else if (wasGrounded && p.vy >= 0 && ground - p.y < 7) {
      // Glue to gentle uphill slopes instead of micro-hopping.
      p.y = ground
      p.vy = 0
      p.onGround = true
    } else {
      p.onGround = false
    }

    if (p.onGround) {
      p.walkPhase += dt * (p.moving ? (canCrouch ? 6 : 11) : 2.2)
    } else {
      p.walkPhase += dt * 4
    }

    // Weapons
    if (this.input.fire && p.cooldown <= 0) {
      this.attack()
    }

    if (p.hurt > 0.22 && p.onGround) {
      p.vx = approach(p.vx, 0, 260 * dt)
    }
    p.x = Math.max(-100000, Math.min(100000, p.x))
  }

  private attack(): void {
    const p = this.player
    const weapon = WEAPONS[p.weapon]

    if (weapon.kind === 'melee') {
      p.cooldown = weapon.cooldown
      p.attackAnim = 0.2
      const dir = Math.cos(p.aim) >= 0 ? 1 : -1
      p.attackDir = dir
      sound.melee()
      let hits = 0
      for (const z of this.zombies) {
        if (z.state === 'die') continue
        const dx = z.x - p.x
        if (Math.sign(dx) !== dir && Math.abs(dx) > 8) continue
        const reach = PIPE_RANGE + z.w / 2
        if (Math.abs(dx) > reach) continue
        const verticalOk = p.y > z.y - z.h - 8 && p.y - p.h - 8 < z.y
        if (!verticalOk) continue
        this.damageZombie(z, weapon.damage, dir, z.x, z.y - z.h * 0.55)
        this.burst(z.x, z.y - z.h * 0.5, 7, {
          color: PALETTE.metal,
          speed: 70,
          life: 0.28,
          size: 1,
          gravity: 120,
          shape: 'spark',
        })
        hits += 1
        if (hits >= 3) break
      }
      if (hits === 0) {
        p.noise = Math.max(p.noise, 0.1)
      }
      return
    }

    if (p.ammo[p.weapon] <= 0) {
      p.cooldown = 0.3
      sound.empty()
      this.setToast('OUT OF AMMO · FALL BACK TO THE PIPE', 'warn')
      this.selectWeapon('pipe')
      return
    }

    const spread =
      weapon.spread *
      (p.crouching ? 0.4 : 1) *
      (p.moving ? 1.5 : 1) *
      (p.onGround ? 1 : 1.25)
    const angle = p.aim + randRange(-spread, spread)
    const originY = p.y - p.h * (p.crouching ? 0.5 : 0.56)
    const mx = p.x + Math.cos(angle) * 12
    const my = originY + Math.sin(angle) * 12

    this.bullets.push({
      x: mx,
      y: my,
      px: mx,
      py: my,
      vx: Math.cos(angle) * weapon.speed,
      vy: Math.sin(angle) * weapon.speed,
      damage: weapon.damage,
      life: 0.95,
      fromPlayer: true,
    })
    p.ammo[p.weapon] -= 1
    p.cooldown = weapon.cooldown
    p.muzzle = 0.055
    p.recoil = 1
    p.noise = 1.8
    this.shake = Math.max(this.shake, p.weapon === 'mg' ? 0.8 : 1.5)

    if (p.weapon === 'mg') sound.mg()
    else sound.pistol()

    // Muzzle sparks + ejected casing.
    for (let i = 0; i < 3; i += 1) {
      this.particles.push({
        x: mx,
        y: my,
        vx: Math.cos(angle) * randRange(40, 110) + randRange(-20, 20),
        vy: Math.sin(angle) * randRange(40, 110) + randRange(-25, 25),
        life: randRange(0.06, 0.16),
        maxLife: 0.16,
        size: 1,
        color: i === 0 ? '#fff3c4' : PALETTE.amber,
        gravity: 0,
        drag: 3,
        shape: 'spark',
      })
    }
    this.particles.push({
      x: p.x - Math.cos(angle) * 3,
      y: originY,
      vx: randRange(-28, 28) - Math.cos(angle) * 15,
      vy: randRange(-55, -20),
      life: 0.45,
      maxLife: 0.45,
      size: 1,
      color: '#c29a55',
      gravity: 420,
      drag: 0.4,
      shape: 'square',
    })

    // The noise wakes nearby dead.
    for (const z of this.zombies) {
      if (z.state === 'idle' && Math.abs(z.x - p.x) < 430) {
        z.state = 'chase'
      }
    }
  }

  private updateSpawner(dt: number): void {
    this.spawnTimer -= dt
    const alive = this.zombies.filter((z) => z.state !== 'die').length
    const cap = Math.min(ZOMBIE_CAP, 3 + this.wave * 2)
    if (this.spawnTimer <= 0) {
      if (alive < cap && this.zombies.length < ZOMBIE_CAP) {
        this.spawnZombie()
        if (this.elapsed > 45 && Math.random() < 0.35 && alive + 1 < cap) {
          this.spawnZombie()
        }
      }
      const base = Math.max(SPAWN_MIN_INTERVAL, 3.2 - this.elapsed * 0.012)
      this.spawnTimer = base * randRange(0.65, 1.3)
    }
  }

  private pickZombieType(): ZombieType {
    const roll = Math.random()
    if (this.elapsed > 80 && roll < Math.min(0.18, 0.02 + this.wave * 0.015)) return 'brute'
    if (this.elapsed > 22 && roll < 0.42) return 'runner'
    return 'walker'
  }

  private spawnZombie(): void {
    const type = this.pickZombieType()
    const stats = ZOMBIE_STATS[type]
    const side = Math.random() < 0.5 ? -1 : 1
    const x =
      side < 0
        ? this.cameraX - SPAWN_OFFSCREEN - Math.random() * 40
        : this.cameraX + VIEW_W + SPAWN_OFFSCREEN + Math.random() * 40
    const ground = groundHeightAt(this.seed, x)
    this.zombies.push({
      id: this.zombieId++,
      type,
      x,
      y: ground,
      vx: 0,
      vy: 0,
      w: stats.w,
      h: stats.h,
      hp: stats.hp,
      maxHp: stats.hp,
      state: 'idle',
      facing: side < 0 ? 1 : -1,
      anim: Math.random() * 6,
      timer: 0,
      cooldown: 0,
      hurt: 0,
      hasStruck: false,
      speed: stats.speed * randRange(0.9, 1.12),
      damage: stats.damage,
      points: stats.points,
      onGround: true,
      seed: Math.random(),
      deathDuration: stats.deathDuration,
    })
  }

  private spawnBurst(count: number): void {
    for (let i = 0; i < count; i += 1) {
      this.spawnZombie()
    }
  }

  private updateZombies(dt: number): void {
    const p = this.player
    const groundPlayer = p.y
    const crouched = p.crouching

    for (const z of this.zombies) {
      z.anim += dt * (z.state === 'chase' ? 3.4 : 1.7)
      z.hurt = Math.max(0, z.hurt - dt)
      z.cooldown = Math.max(0, z.cooldown - dt)

      if (z.state === 'die') {
        z.timer += dt
        z.vx *= 1 - Math.min(1, dt * 5)
        z.x += z.vx * dt
        continue
      }

      const dx = p.x - z.x
      const dist = Math.abs(dx)
      const dir = dx >= 0 ? 1 : -1

      if (z.state === 'idle') {
        z.vx = approach(z.vx, 0, 260 * dt)
        const notice = crouched ? 120 : 310
        if (dist < notice || p.noise > 0.9 && dist < 470) {
          z.state = 'chase'
        }
      } else if (z.state === 'chase') {
        z.facing = dir
        const reach = z.type === 'brute' ? 20 : 15
        if (dist < reach + 12 && Math.abs(groundPlayer - z.y) < 26) {
          z.state = 'attack'
          z.timer = 0
          z.hasStruck = false
          z.vx = 0
        } else {
          const target = dir * z.speed
          z.vx = approach(z.vx, target, 420 * dt)
        }
      } else if (z.state === 'attack') {
        z.vx = approach(z.vx, 0, 900 * dt)
        z.timer += dt
        const windup = 0.32
        if (!z.hasStruck && z.timer >= windup) {
          z.hasStruck = true
          const reach = (z.type === 'brute' ? 22 : 17) + PLAYER_W * 0.5
          const verticalOk = p.y > z.y - z.h - 4 && p.y - p.h - 4 < z.y
          if (Math.abs(p.x - z.x) < reach && verticalOk) {
            this.damagePlayer(z.damage, z.x)
          } else {
            this.burst(z.x + z.facing * 9, z.y - z.h * 0.6, 3, {
              color: '#4a4f3c',
              speed: 35,
              life: 0.25,
              size: 1,
              gravity: 80,
            })
          }
        }
        if (z.timer >= 0.85) {
          z.state = 'chase'
          z.timer = 0
          z.cooldown = 0.45
        }
      }

      z.x += z.vx * dt
      z.vy += GRAVITY * dt
      z.y += z.vy * dt
      const ground = groundHeightAt(this.seed, z.x)
      if (z.y >= ground) {
        z.y = ground
        z.vy = 0
        z.onGround = true
      } else {
        z.onGround = false
      }

      if (z.x < this.cameraX - 560 || z.x > this.cameraX + VIEW_W + 560) {
        z.hp = -999
      }
    }

    // Soft separation so the horde doesn't stack into one sprite.
    for (let i = 0; i < this.zombies.length; i += 1) {
      const a = this.zombies[i]
      if (a.state === 'die') continue
      for (let j = i + 1; j < this.zombies.length; j += 1) {
        const b = this.zombies[j]
        if (b.state === 'die') continue
        const dx = b.x - a.x
        const min = (a.w + b.w) * 0.5 + 1
        if (Math.abs(dx) < min && Math.abs(a.y - b.y) < 12) {
          const push = (min - Math.abs(dx)) * 0.5 + 0.1
          const sign = dx >= 0 ? 1 : -1
          a.x -= push * sign
          b.x += push * sign
        }
      }
    }

    this.zombies = this.zombies.filter((z) => {
      if (z.hp <= -900) return false
      if (z.state === 'die' && z.timer > z.deathDuration + 0.4) return false
      return true
    })
  }

  private damageZombie(z: Zombie, amount: number, dir: number, hitX: number, hitY: number): void {
    if (z.state === 'die') return
    z.hp -= amount
    z.hurt = 0.14
    z.state = 'chase'
    z.vx += dir * (z.type === 'brute' ? 14 : 34)
    this.burst(hitX, hitY, 4, {
      color: PALETTE.blood,
      speed: 75,
      life: 0.36,
      size: 1,
      gravity: 300,
    })
    if (this.time - this.lastHitSound > 0.035) {
      sound.hit()
      this.lastHitSound = this.time
    }
    if (z.hp <= 0) {
      z.state = 'die'
      z.timer = 0
      z.vx = dir * 55
      this.kills += 1
      this.combo += 1
      this.comboTimer = 4.2
      const mult = this.multiplier
      this.bestMultiplier = Math.max(this.bestMultiplier, mult)
      this.score += z.points * mult
      this.burst(z.x, z.y - z.h * 0.5, 14, {
        color: PALETTE.blood,
        speed: 120,
        life: 0.5,
        size: 2,
        gravity: 380,
      })
      this.burst(z.x, z.y - z.h * 0.6, 5, {
        color: PALETTE.zombieSkin,
        speed: 90,
        life: 0.45,
        size: 1,
        gravity: 260,
      })
      this.floatText(z.x, z.y - z.h - 6, mult > 1 ? `+${mult * 100}` : `+${z.points}`, PALETTE.bone)
      sound.kill()
      this.dropLoot(z)
    }
  }

  private dropLoot(z: Zombie): void {
    const materialValue =
      z.type === 'brute' ? 4 + Math.floor(Math.random() * 4) : 1 + Math.floor(Math.random() * 2)
    this.spawnPickup('materials', z.x, z.y - z.h * 0.5, materialValue)

    const roll = Math.random()
    if (roll < 0.11) {
      this.spawnPickup('pistol_ammo', z.x + randRange(-5, 5), z.y - z.h * 0.4, 12)
    } else if (roll < 0.17) {
      this.spawnPickup('mg_ammo', z.x + randRange(-5, 5), z.y - z.h * 0.4, 32)
    } else if (roll < 0.21) {
      this.spawnPickup('medkit', z.x + randRange(-5, 5), z.y - z.h * 0.4, 20)
    }
  }

  private spawnPickup(kind: PickupKind, x: number, y: number, value: number): void {
    this.pickups.push({
      id: this.pickupId++,
      kind,
      x,
      y,
      vx: randRange(-38, 38),
      vy: randRange(-150, -85),
      value,
      age: 0,
      grounded: false,
      magnet: false,
      bob: Math.random() * 6,
    })
  }

  private updatePickups(dt: number): void {
    const p = this.player
    const px = p.x
    const py = p.y - p.h * 0.5

    this.pickups = this.pickups.filter((pickup) => {
      const ground = groundHeightAt(this.seed, pickup.x) - 3
      if (!pickup.grounded) {
        pickup.vy += 760 * dt
        pickup.x += pickup.vx * dt
        pickup.y += pickup.vy * dt
        if (pickup.y >= ground) {
          pickup.y = ground
          pickup.vy *= -0.28
          pickup.vx *= 0.65
          if (Math.abs(pickup.vy) < 26) {
            pickup.vy = 0
            pickup.grounded = true
          }
        }
      }

      const dx = px - pickup.x
      const dy = py - pickup.y
      const dist = Math.hypot(dx, dy)
      if (pickup.age > 0.4 && (pickup.magnet || dist < 74)) {
        pickup.magnet = true
        const speed = 95 + (pickup.age - 0.4) * 220
        pickup.x += (dx / Math.max(1, dist)) * speed * dt
        pickup.y += (dy / Math.max(1, dist)) * speed * dt
      }

      if (dist < 13) {
        this.collectPickup(pickup)
        return false
      }
      return pickup.age < 40
    })
  }

  private collectPickup(pickup: Pickup): void {
    const p = this.player
    if (pickup.kind === 'materials') {
      this.materials += pickup.value
      this.floatText(pickup.x, pickup.y - 8, `+${pickup.value} MATS`, PALETTE.amber)
    } else if (pickup.kind === 'pistol_ammo') {
      p.ammo.pistol += pickup.value
      this.floatText(pickup.x, pickup.y - 8, `+${pickup.value} 9MM`, PALETTE.bone)
    } else if (pickup.kind === 'mg_ammo') {
      p.ammo.mg += pickup.value
      this.floatText(pickup.x, pickup.y - 8, `+${pickup.value} BELT`, PALETTE.bone)
    } else {
      p.hp = Math.min(p.maxHp, p.hp + pickup.value)
      this.floatText(pickup.x, pickup.y - 8, `+${pickup.value} COND`, '#9fce7a')
    }
    sound.pickup()
    this.burst(pickup.x, pickup.y, 5, {
      color: pickup.kind === 'materials' ? PALETTE.amber : '#b9d4a1',
      speed: 40,
      life: 0.3,
      size: 1,
      gravity: -30,
      shape: 'spark',
    })
  }

  private updateBullets(dt: number): void {
    const survivors: Bullet[] = []
    for (const b of this.bullets) {
      b.px = b.x
      b.py = b.y
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.life -= dt

      let hit = false
      for (const z of this.zombies) {
        if (z.state === 'die') continue
        if (
          segmentHitsRect(
            b.px,
            b.py,
            b.x,
            b.y,
            z.x - z.w * 0.5 - 1,
            z.y - z.h - 1,
            z.x + z.w * 0.5 + 1,
            z.y + 1,
          )
        ) {
          this.damageZombie(z, b.damage, Math.sign(b.vx), b.x, b.y)
          this.burst(b.x, b.y, 3, {
            color: PALETTE.amber,
            speed: 55,
            life: 0.2,
            size: 1,
            gravity: 40,
            shape: 'spark',
          })
          hit = true
          break
        }
      }
      if (hit) continue

      const ground = groundHeightAt(this.seed, b.x)
      if (b.y > ground) {
        this.burst(b.x, ground, 4, {
          color: '#77705e',
          speed: 45,
          life: 0.25,
          size: 1,
          gravity: 220,
          shape: 'spark',
        })
        continue
      }
      if (b.life <= 0) continue
      if (b.x < this.cameraX - 80 || b.x > this.cameraX + VIEW_W + 80) continue
      survivors.push(b)
    }
    this.bullets = survivors
  }

  private updateCombo(dt: number): void {
    if (this.comboTimer > 0) {
      this.comboTimer -= dt
      if (this.comboTimer <= 0) {
        this.combo = 0
      }
    }
  }

  private damagePlayer(amount: number, sourceX: number): void {
    const p = this.player
    if (p.invuln > 0 || this.phase !== 'playing') return
    p.hp -= amount
    p.invuln = 0.85
    p.hurt = 0.42
    p.vx = (p.x >= sourceX ? 1 : -1) * 105
    this.shake = Math.max(this.shake, 3.6)
    this.flash = 1
    sound.hurt()
    this.floatText(p.x, p.y - p.h - 8, `-${amount}`, '#ff7a5a')
    this.burst(p.x, p.y - p.h * 0.55, 8, {
      color: PALETTE.blood,
      speed: 85,
      life: 0.4,
      size: 1,
      gravity: 320,
    })
    if (p.hp <= 0) this.killPlayer()
  }

  private killPlayer(): void {
    if (this.phase === 'dead') return
    const p = this.player
    p.hp = 0
    this.phase = 'dead'
    this.input.fire = false
    this.toast = null
    this.shake = 7
    this.flash = 1
    sound.death()
    this.burst(p.x, p.y - p.h * 0.5, 26, {
      color: PALETTE.blood,
      speed: 150,
      life: 0.8,
      size: 2,
      gravity: 340,
    })
  }

  private updateCamera(dt: number): void {
    if (this.phase === 'dead' || this.phase === 'paused') return
    const p = this.player
    let target = p.x - VIEW_W * 0.42 + p.facing * 12
    if (this.phase === 'playing') {
      const look = clamp((this.input.aimX - VIEW_W * 0.5) * 0.08, -24, 24)
      target += look
    }
    const smooth = 1 - Math.exp(-7.5 * dt)
    this.cameraX += (target - this.cameraX) * smooth
  }

  private refreshChunks(): void {
    this.ensureChunks()
    const first = Math.floor((this.cameraX - VIEW_W) / CHUNK_W)
    const last = Math.floor((this.cameraX + VIEW_W * 2) / CHUNK_W)
    for (const key of this.chunks.keys()) {
      if (key < first - 1 || key > last + 1) this.chunks.delete(key)
    }
  }

  private ensureChunks(): void {
    const first = Math.floor((this.cameraX - VIEW_W * 0.75) / CHUNK_W)
    const last = Math.floor((this.cameraX + VIEW_W * 1.75) / CHUNK_W)
    for (let i = first; i <= last; i += 1) {
      if (!this.chunks.has(i)) this.chunks.set(i, generateChunk(this.seed, i))
    }
  }

  private updateParticles(dt: number): void {
    const survivors: Particle[] = []
    for (const particle of this.particles) {
      particle.life -= dt
      if (particle.life <= 0) continue
      particle.vy += particle.gravity * dt
      const drag = Math.max(0, 1 - particle.drag * dt)
      particle.vx *= drag
      particle.vy *= drag
      particle.x += particle.vx * dt
      particle.y += particle.vy * dt
      survivors.push(particle)
    }
    this.particles = survivors
    if (this.particles.length > MAX_PARTICLES) {
      this.particles.splice(0, this.particles.length - MAX_PARTICLES)
    }
  }

  private updateTexts(dt: number): void {
    this.texts = this.texts.filter((text) => {
      text.life -= dt
      text.y += text.vy * dt
      text.vy *= 1 - Math.min(1, dt * 1.8)
      return text.life > 0
    })
  }

  private burst(
    x: number,
    y: number,
    count: number,
    options: {
      color: string
      speed: number
      life: number
      size: number
      gravity?: number
      shape?: ParticleShape
      drag?: number
    },
  ): void {
    const shape = options.shape ?? 'square'
    const gravity = options.gravity ?? 260
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2
      const speed = options.speed * randRange(0.35, 1)
      this.particles.push({
        x: x + randRange(-2, 2),
        y: y + randRange(-2, 2),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - options.speed * 0.2,
        life: options.life * randRange(0.6, 1.2),
        maxLife: options.life,
        size: options.size,
        color: options.color,
        gravity,
        drag: options.drag ?? 0.8,
        shape,
      })
    }
  }

  private floatText(x: number, y: number, text: string, color: string): void {
    this.texts.push({
      x,
      y,
      vy: -22,
      life: 0.85,
      maxLife: 0.85,
      text,
      color,
    })
  }

  private setToast(text: string, tone: Toast['tone']): void {
    this.toastId += 1
    this.toast = { id: this.toastId, text, tone, life: 2.8 }
  }
}
