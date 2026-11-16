# DEADLINE — Complete Code & Gameplay Guide

> This document explains **how the game plays** and **what every part of the code does**.
> It is written against the current source tree. Function names are stable; line numbers may drift as the code changes.

---

## Table of contents

1. [What this project is](#1-what-this-project-is)
2. [Run it](#2-run-it)
3. [How the game actually works](#3-how-the-game-actually-works)
   - 3.1 [Controls](#31-controls)
   - 3.2 [The run loop](#32-the-run-loop)
   - 3.3 [Weapons](#33-weapons)
   - 3.4 [Zombies](#34-zombies)
   - 3.5 [Waves, spawning and pressure from both sides](#35-waves-spawning-and-pressure-from-both-sides)
   - 3.6 [Loot, welding and the economy](#36-loot-welding-and-the-economy)
   - 3.7 [Score, combo and progress](#37-score-combo-and-progress)
   - 3.8 [The world](#38-the-world)
4. [Architecture](#4-architecture)
5. [Frame lifecycle](#5-frame-lifecycle)
6. [File-by-file walkthrough](#6-file-by-file-walkthrough)
   - 6.1 [Bootstrap and shell](#61-bootstrap-and-shell)
   - 6.2 [`types.ts` — the data model](#62-typests--the-data-model)
   - 6.3 [`constants.ts` — tuning tables](#63-constantsts--tuning-tables)
   - 6.4 [`rng.ts` — deterministic randomness](#64-rngts--deterministic-randomness)
   - 6.5 [`world.ts` — terrain and scenery](#65-worldts--terrain-and-scenery)
   - 6.6 [`engine.ts` — the simulation](#66-enginets--the-simulation)
   - 6.7 [`render.ts` — the canvas renderer](#67-renderts--the-canvas-renderer)
   - 6.8 [`useGameEngine.ts` — the React bridge](#68-usegameenginets--the-react-bridge)
   - 6.9 [`audio.ts` — synthesized sound](#69-audiots--synthesized-sound)
   - 6.10 [Components](#610-components)
   - 6.11 [`format.ts`](#611-formatts)
7. [Systems deep-dive](#7-systems-deep-dive)
   - 7.1 [Coordinate spaces and the camera](#71-coordinate-spaces-and-the-camera)
   - 7.2 [Aiming, spread and projectiles](#72-aiming-spread-and-projectiles)
   - 7.3 [Player physics](#73-player-physics)
   - 7.4 [Zombie state machine](#74-zombie-state-machine)
   - 7.5 [Separation / crowd behaviour](#75-separation--crowd-behaviour)
   - 7.6 [Chunk streaming](#76-chunk-streaming)
   - 7.7 [Determinism: what the seed controls](#77-determinism-what-the-seed-controls)
   - 7.8 [Rendering pipeline in order](#78-rendering-pipeline-in-order)
8. [Where to change what](#8-where-to-change-what)
9. [Extension recipes](#9-extension-recipes)
10. [Debugging and QA](#10-debugging-and-qa)
11. [Design invariants and common questions](#11-design-invariants-and-common-questions)

---

## 1. What this project is

**DEADLINE** is a single-player, infinite side-scrolling pixel-art zombie survival game.

- You are a survivor walking an endless night railway line.
- The dead attack from **both sides**.
- The map is procedurally generated and **never ends**.
- Nothing is saved. Every launch and every restart creates a new world seed.
- There is no win condition. You survive, kill, explore and score until you die.

**Stack:** Vite, React 18, TypeScript, HTML5 Canvas 2D, Tailwind CSS, Web Audio API.

The important architectural idea:

> The game is not a React game. React renders only the HUD and menus.
> The simulation lives in a plain TypeScript class, and the canvas is drawn directly from that class every frame.

That separation is why the game can run at a stable 60 Hz without React re-rendering the world.

---

## 2. Run it

```bash
cd deadline
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc --noEmit && vite build  -> dist/
npm run preview  # serve the production build
```

Requires Node 18+.

Useful source files:

```
index.html
src/main.tsx
src/App.tsx
src/index.css
src/game/types.ts
src/game/constants.ts
src/game/rng.ts
src/game/world.ts
src/game/engine.ts
src/game/render.ts
src/game/audio.ts
src/game/useGameEngine.ts
src/game/format.ts
src/components/GameCanvas.tsx
src/components/UIHUD.tsx
src/components/OverlayScreens.tsx
src/components/TouchControls.tsx
src/components/Icons.tsx
```

---

## 3. How the game actually works

### 3.1 Controls

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Move | `A` / `D` or `←` / `→` | ◀ / ▶ |
| Jump | `Space` / `W` / `↑` | ▲ |
| Crouch | `S` / `↓` | ▼ |
| Fire | Left mouse button, or `F` / `J` | FIRE |
| Aim | Mouse | Auto-aim at nearest zombie |
| Weapon | `1` / `2` / `3`, `Q` cycles | “Swap gun” |
| Weld armor | `H` | HUD button |
| Pause / resume | `Esc` / `P` | HUD button |
| Start / restart | `Enter` (restart), `R` on death | overlay buttons |
| Mute | `M` or speaker button | HUD button |

Extra details:

- If mouse aiming has not been activated (keyboard-only or touch), firing **auto-aims at the closest live zombie**.
- As soon as you move the physical mouse, true mouse aiming takes over; keyboard fire then follows the cursor too.
- Losing window focus automatically pauses a running game and clears all held inputs.
- Crouching is only possible while grounded. It lowers your hitbox and tightens gun spread.

### 3.2 The run loop

A run has four phases:

```
menu ──start──▶ playing ──death──▶ dead
                   │                 │
                 pause             restart
                   ▼                 │
                paused ──resume──────┘
                   │
                 to menu
                   ▼
                  menu
```

- **menu** — the world is alive behind the start screen. The camera pans slowly; the survivor idles. No zombies are simulated.
- **playing** — full simulation: movement, aiming, combat, spawns, loot, waves.
- **paused** — simulation freezes. The canvas still renders one stable frame, and the pause overlay appears.
- **dead** — the survivor becomes a corpse. Zombies keep animating in place, but nothing attacks. The death overlay shows the run summary.

`startRun()` always creates a **new seed**, so both “Start” and “Restart” produce fresh terrain. There are no checkpoints and no persistence.

### 3.3 Weapons

| Slot | Weapon | Kind | Damage | Cooldown | Ammo | Projectile speed | Spread |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Pipe | Melee | 48 | 0.34 s | ∞ | — | 0 |
| 2 | Pistol | Ranged | 38 | 0.24 s | 120 | 540 px/s | 0.012 rad |
| 3 | Machine gun | Ranged | 15 | 0.075 s | 500 | 600 px/s | 0.085 rad |

- Pipe hits up to **3 zombies per swing** in a short arc in front of you.
- Pistol is precise and benefits heavily from crouching.
- Machine gun is rapid and intentionally inaccurate; holding fire sprays.
- Running out of gun ammo automatically switches back to the pipe.
- Gunfire creates noise, which wakes idle zombies within 430 px.
- The ammo counts are per-run only. Restarting restores 120 pistol rounds and 500 MG rounds.

### 3.4 Zombies

| Type | HP | Base speed | Damage | Points | Size | Death animation |
| --- | --- | --- | --- | --- | --- | --- |
| Walker | 60 | 27 px/s | 10 | 100 | 11 × 28 | 1.15 s |
| Runner | 40 | 66 px/s | 8 | 160 | 9 × 25 | 0.90 s |
| Brute | 230 | 21 px/s | 24 | 400 | 17 × 37 | 1.50 s |

Each zombie is a small state machine:

```
idle ──notices player / noise / wake timer──▶ chase
chase ──within reach──▶ attack ──0.85 s──▶ chase
any damage that kills ──▶ die ──fade──▶ removed
```

- **idle** — stands, sways, waits. Notice radius is 310 px normally, 120 px if you are crouched, plus hearing gunfire within 470 px. Every zombie also has a `wakeDelay`, so nobody idles off-screen forever.
- **chase** — walks toward the player. If it spawned behind a running player, it gets a limited **sprint** burst to close the gap.
- **attack** — 0.32 s wind-up, then one strike. If you are in reach and vertically aligned, you take damage. Then a short recovery before chasing again.
- **die** — falls, squashes, fades, drops loot, then is removed.

Player damage grants **0.85 s of invulnerability** and knocks the player away from the attacker.

### 3.5 Waves, spawning and pressure from both sides

- Wave 1 starts immediately.
- A new wave begins every **42 seconds**.
- Wave `n` has a living-zombie cap of `min(18, 3 + n * 2)`.
  - Wave 1 → 5
  - Wave 2 → 7
  - Wave 3 → 9
  - …
  - Wave 8+ → 18
- The run opens with a 4.2 s grace timer before the first spawn. After that, the interval base starts near 3.2 s, shrinks with elapsed time, is floored at 0.6 s, then is randomized by ×0.65–1.3.
- After 20 seconds, there is an extra 35% chance to spawn a second zombie per spawn tick if the cap allows.
- Spawn sides **strictly alternate**. If the next spawn is left, the one after is right, and vice versa.
- Spawns appear just off-screen: roughly 14–48 px outside the camera edge.
- A zombie **spawned behind** a moving player gets:
  - a short `wakeDelay` of 0.5–1.5 s,
  - a finite `sprint` of 8–14 s (never brutes),
  - sprint speed of `min(175, max(walkSpeed * 5.6, |player.vx| + 40))`.
- This is what prevents the game from becoming one-sided when you sprint in one direction.
- Waves also trigger a small burst spawn and a warning toast: “WAVE n · THEY HEARD THE SHOT”.

Zombie type selection:

- Walkers are the default.
- Brutes after 80 s: chance `min(0.18, 0.02 + wave * 0.015)`.
- Runners after 22 s: the same roll is checked against `0.42`, so a non-brute roll under 0.42 becomes a runner.

### 3.6 Loot, welding and the economy

Every kill drops **Building Materials**:

- Walker / runner: 1–2
- Brute: 4–7

There is also one extra roll per kill:

- 11% — pistol ammo (12 rounds)
- 6% — MG ammo (32 rounds)
- 4% — medkit (+20 HP)

So 21% of kills drop something in addition to materials.

Materials are spent at the **Weld** station:

- Cost: **40 materials**
- Effect: **+25 HP**, capped at max HP
- Cooldown: 1.1 s
- Cannot be used at full health.

Pickups have arc physics, bounce once, then rest on the ground. After 0.4 s they become magnetized within 74 px and fly to you. Uncollected pickups blink after 35 s and disappear at 40 s.

### 3.7 Score, combo and progress

- Each kill adds `points × multiplier`.
- Consecutive kills build a combo. Combo resets if you go **4.2 s** without a kill.
- Multiplier: `clamp(1 + floor(combo / 3), 1, 5)`.
  - 0–2 kills → ×1
  - 3–5 → ×2
  - 6–8 → ×3
  - 9–11 → ×4
  - 12+ → ×5
- The HUD tracks the current multiplier and the death screen records the best multiplier reached.
- Distance is measured as **exploration in either direction**: `maxProgress = max(maxProgress, |player.x - startX|)`.
- The HUD displays `maxProgress / 8` as metres (8 world pixels = 1 metre).
- Running left counts just as much as running right.

### 3.8 The world

- The ground is a smooth, deterministic noise curve.
- The world is divided into 480 px chunks.
- Chunks are generated ahead of the camera and deleted behind it.
- Each run has a seed; the seed chooses:
  - terrain height,
  - district sequence,
  - prop layout, variants and scales,
  - the haunted-village skyline.

Districts are selected per **three-chunk region**:

`rail`, `village`, `woods`, `yard`, `outskirts`, `graveyard`.

Each district has its own prop mix:

- **rail** — lamps, benches, trash cans, fences, signs, bushes, rocks, crates, barrels.
- **village** — houses, gravestones, lamps, benches, fences, dead trees.
- **woods** — pines, dead trees, bushes, rocks, rare lamps.
- **yard** — train carriages, water towers, crates, barrels, fences, signs.
- **outskirts** — sparse houses, lamps, dead trees, rocks, signs.
- **graveyard** — gravestone rows, fences, dead trees, occasional house/lamp.

Every third chunk in a region may roll a landmark (water tower or carriage + house + gravestone). The first two chunks are hand-composed but still seed-jittered, so no two runs open on an identical screen.

Props are **purely visual**: they do not collide. Only the ground is solid.

---

## 4. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ index.html                                                  │
│   └─ src/main.tsx                                           │
│       └─ App.tsx  (page chrome, header, footer, stage)      │
│           └─ GameCanvas.tsx                                 │
│               ├─ <canvas 480×270>                           │
│               ├─ useGameEngine.ts ──────────────┐           │
│               │    ├─ input listeners            │           │
│               │    ├─ fixed-step rAF loop         │           │
│               │    └─ HUD snapshot state          │           │
│               ├─ UIHUD.tsx                        │           │
│               ├─ OverlayScreens.tsx               │           │
│               └─ TouchControls.tsx                │           │
└───────────────────────────────────────────────────┼───────────┘
                                                    │
                    ┌───────────────────────────────┴──────────┐
                    │ GameEngine (engine.ts)                   │
                    │   player, zombies, bullets, pickups,     │
                    │   particles, texts, chunks, camera       │
                    │                                          │
                    │ uses: constants.ts, types.ts, rng.ts,    │
                    │       world.ts, audio.ts                 │
                    └───────────────┬──────────────────────────┘
                                    │ read-only each frame
                                    ▼
                    ┌──────────────────────────────────────────┐
                    │ renderGame (render.ts)                   │
                    │   draws sky, parallax, chunks, props,    │
                    │   actors, effects, HUD reticle           │
                    └──────────────────────────────────────────┘
```

Key points:

- React never owns the simulation state.
- `GameEngine` is a mutable object held in a `useRef`.
- Once per animation frame the loop calls `engine.update(STEP)` (multiple times if needed) and `renderGame(ctx, engine, reducedMotion)`.
- React receives a **plain snapshot** (`HudState`) every ~70 ms, not every frame.
- The HUD snapshot is the only bridge from the mutable game to React.

---

## 5. Frame lifecycle

The loop lives in `useGameEngine.ts`.

1. `requestAnimationFrame` fires.
2. Raw delta is measured and clamped:
   - minimum 0,
   - maximum 0.1 s (prevents huge jumps after tab switches).
3. The delta is added to an accumulator.
4. While `accumulator >= 1/60` and fewer than 5 steps:
   - `engine.update(1/60)`,
   - subtract `1/60` from the accumulator.
5. If 5 steps were used, the accumulator is reset to 0. This prevents a “spiral of death” after a long stall.
6. `renderGame(ctx, engine, reducedMotion)` draws the current state once.
7. Every 0.07 s, `engine.getHud(sound.muted)` is pushed into React state.
8. The next frame is scheduled.

Why fixed-step?

- Physics, cooldowns, AI and spawning stay deterministic and stable regardless of monitor refresh rate.
- Rendering can still happen at display refresh; only simulation is fixed.

Inside `engine.update(dt)`:

```
if paused -> return immediately (no time advance)
time += dt
decay screen shake, damage flash, weld cooldown
decay toast
if playing: elapsed += dt; updatePlaying()
if menu:    updateMenu()
if dead:    updateAfterDeath()
always: particles, floating texts, pickup ages, camera
```

`updatePlaying()` order matters:

```
updateAim()
updatePlayer()
updateSpawner()
updateZombies()
updateBullets()
updatePickups()
updateCombo()
refreshChunks()
maxProgress
hit marker decay
wave check
death check
```

Aim is updated before movement so the player faces the cursor immediately. Zombies move before bullets so projectiles hit current positions.

---

## 6. File-by-file walkthrough

### 6.1 Bootstrap and shell

#### `index.html`

- Loads two Google fonts: **Press Start 2P** (display) and **Silkscreen** (pixel UI).
- Sets theme color, description, favicon and page title.
- Mounts `<div id="root">` and the Vite entry `/src/main.tsx`.

#### `src/main.tsx`

- Creates the React root.
- Renders `<App />` inside `<React.StrictMode>`.
- Imports global CSS.

#### `src/App.tsx`

The page shell around the game:

- `BrandMark` — inline pixel SVG train/lamp mark.
- Decorative blurred rust/steel glows.
- Header with brand, “Endless rail survival”, “Night service”, “Mile 0 · 02:47”.
- `<main>` centers a responsive stage (`stage-frame`) containing `<GameCanvas />`.
- Mobile-only “Best played in landscape” hint.
- Footer with control reminders and “No saves”.
- `app-chrome` header/footer are hidden on very short viewports by CSS.

`App.tsx` contains no game logic.

#### `src/index.css`

Tailwind layers plus presentation rules:

- `html/body/#root` sizing, dark background, pixel font default.
- Focus-visible outline, selection colors, custom scrollbars.
- `.pixel-canvas` — `image-rendering: pixelated` / `crisp-edges`, `touch-action: none`, no selection.
- `.scanlines` — repeating 1 px dark lines every 3 px over the canvas.
- `.stage-vignette` — radial + linear darkening overlay.
- `.touch-only` — hidden by default, `display: flex` under `(pointer: coarse)`.
- `.app-shell::before` — faint grid texture with a radial mask.
- `.stage-frame` — responsive 16:9 stage width capped at 1240 px and viewport height.
- Mobile/short-viewport behavior:
  - overlays become fixed full-screen under 768 px or coarse pointers,
  - the control manual hides below 560 px height,
  - header/footer hide to give the playfield the whole screen.
- `prefers-reduced-motion` disables animation/transition durations.

#### `tailwind.config.js`

Defines the visual system used by the React UI:

- **ink** (backgrounds), **bone** (text), **amber** (rail/lamp accent), **rust** (danger), **steel**, **rot**, **blood**.
- Fonts: `display` = Press Start 2P, `pixel` = Silkscreen, `mono`.
- Shadows: plate, inset hairline, amber glow.
- Keyframes: flicker, soft pulse, drift, toast-in, screen-in.

#### `vite.config.ts`

Minimal: React plugin only.

#### `tsconfig.json`

Strict TypeScript, ES2020 target, bundler resolution, no emit, JSX react-jsx.

#### `package.json`

- `dev`, `build`, `preview`.
- `build` runs `tsc --noEmit` **before** Vite, so type errors fail the build.
- Runtime dependencies: React and React DOM only. No game libraries, no asset packs.

---

### 6.2 `types.ts` — the data model

This file has no runtime code. It is the shared vocabulary for the engine, renderer and HUD.

| Type | Purpose |
| --- | --- |
| `GamePhase` | `menu \| playing \| paused \| dead` |
| `WeaponId` | `pipe \| pistol \| mg` |
| `WeaponKind` | `melee \| ranged` |
| `WeaponDef` | Full weapon definition: id, name, slot, kind, damage, cooldown, starting ammo, projectile speed, spread, knockback, hint |
| `ZombieType` | `walker \| runner \| brute` |
| `ZombieState` | `idle \| chase \| attack \| die` |
| `District` | `rail \| village \| woods \| yard \| outskirts \| graveyard` |
| `Player` | Position, velocity, size, facing, crouch/ground flags, coyote/jump buffer, HP, ammo, aim, cooldowns, animation timers, noise |
| `Zombie` | Position, velocity, size, HP, state, facing, animation, timers, damage, points, spawn side, wake delay, sprint timer |
| `Bullet` | Current and previous position, velocity, damage, life, owner flag |
| `PickupKind` | `materials \| pistol_ammo \| mg_ammo \| medkit` |
| `Pickup` | Position, velocity, value, age, grounded/magnet flags, bob phase |
| `ParticleShape` | `square \| spark \| smoke` |
| `Particle` | Position, velocity, life, size, color, gravity, drag, shape |
| `FloatText` | Rising combat text with life and color |
| `PropKind` | All 15 scenery types |
| `PropDepth` | `back \| mid \| front` |
| `Prop` | Kind, depth, absolute x, seed, scale, variant |
| `TerrainChunk` | Index, start x, props, district |
| `Toast` | Centered HUD message with tone and lifetime |
| `InputState` | Held directions, fire, logical aim point, mouse-active flag |
| `WeaponHud` | Weapon card data: id, name, ammo, active, slot, kind |
| `HudState` | Complete React-facing snapshot: phase, seed, health, weapons, materials, score, kills, distance, time, wave, streak, multiplier, weld availability, mute, toast |

Two conventions matter:

- `Player.y` and `Zombie.y` are **feet** positions, not top-left corners.
- `Player.ammo` is a `Record<WeaponId, number>`; `-1` means unlimited.

---

### 6.3 `constants.ts` — tuning tables

Everything gameplay-facing is centralized here.

#### View and world

| Constant | Value | Meaning |
| --- | --- | --- |
| `VIEW_W` | 480 | Internal canvas width |
| `VIEW_H` | 270 | Internal canvas height |
| `CHUNK_W` | 480 | One procedural chunk = exactly one screen width |
| `GROUND_BASE` | 212 | Average ground height |

#### Physics

| Constant | Value | Meaning |
| --- | --- | --- |
| `GRAVITY` | 1020 px/s² | Player and zombie gravity |
| `PLAYER_SPEED` | 104 px/s | Walk speed |
| `PLAYER_CROUCH_SPEED` | 52 px/s | Crouch speed |
| `PLAYER_JUMP` | -318 px/s | Jump impulse (negative = up) |
| `PLAYER_W` | 12 | Player width used by attack reach |
| `PIPE_RANGE` | 34 | Base melee reach |
| `MAX_PARTICLES` | 260 | Hard particle cap |

#### Economy

- `WELD_COST = 40`
- `WELD_AMOUNT = 25`

#### UI labels

`PHASE_LABEL` maps phases to flavour text (`standby`, `in transit`, `held`, `end of line`). It is available for UI work but not currently read by the components.

#### Palette

A single source of truth for the canvas colors:

- backgrounds: ink, sky bands, hills, houses
- lights: window, lamp, amber
- ground: grass, edge, dirt, ballast, sleeper, rail rust/steel
- survivor: skin, hair, jacket, pants, boots, scarf
- weapons: pipe, metal, gun
- zombies: skin, shirt, pants, eye
- effects: blood, bone, amber

`FONT_CANVAS` is declared for canvas text experiments; the renderer currently uses its own 3×5 bitmap font.

#### Weapons

```ts
WEAPONS: Record<WeaponId, WeaponDef>
WEAPON_ORDER = ['pipe', 'pistol', 'mg']
```

`WEAPON_ORDER` drives slot order, cycling, the HUD list and initialization.

#### Zombies

```ts
ZOMBIE_STATS: Record<ZombieType, ZombieStat>
```

Each entry defines HP, speed, damage, points, width, height and death duration. The AI reads these values; it does not hard-code per-type speed except for a few reach checks (brute has slightly longer arms).

- `SPAWN_MIN_INTERVAL = 0.6`
- `ZOMBIE_CAP = 18`

---

### 6.4 `rng.ts` — deterministic randomness

The world must be rebuildable from `(seed, x)` or `(seed, chunkIndex)` alone. That requires **pure** random functions, not a global stream.

#### `hashInt(seed, n)`

A 32-bit integer mixer:

- XORs the seed with `n * 0x27d4eb2d`,
- applies three multiply/xor-shift rounds,
- returns an unsigned 32-bit integer.

Same inputs always produce the same output, with good avalanche behaviour.

#### `hash01(seed, n)`

`hashInt(...) / 2^32` → float in `[0, 1)`.

#### `hashRange(seed, n, min, max)`

`min + hash01(...) * (max - min)`.

Used everywhere in world generation and rendering to place things deterministically: grass tufts, stones, stars, ridges, village houses.

#### `mulberry32(seed)`

A tiny seeded PRNG returning a closure. Unlike the hash functions, each call advances internal state. This is used for **sequential layout** inside one chunk: “add a bench, then a can, then a rock.” Deterministic for a given chunk index and seed.

#### `pick(rand, list)`

Uniform random element from a list. Currently available as a utility; world generation mostly uses direct index math.

#### `clamp(v, min, max)`

Standard clamp.

#### `randRange(min, max)`

Uses `Math.random()`. This is for **runtime feel**, not world layout: spread, particle bursts, loot rolls, spawn jitter.

#### `newSeed()`

`(Math.random() * 0xffffffff) >>> 0` — a fresh 32-bit seed for every run.

> Rule of thumb:
> **World layout uses `hash*` / `mulberry32`. Combat feel uses `Math.random`.**

---

### 6.5 `world.ts` — terrain and scenery

#### `groundHeightAt(seed, x)` — the infinite ground

The ground is a pure function of `x`. There is no heightmap array.

Three layers compose it:

1. **Macro**
   ```ts
   const macro = 0.78 + 0.34 * Math.sin(x / 760 + phase)
   ```
   A very slow sine that makes some stretches hillier than others. `phase` comes from the seed, so different runs have different macro shapes.

2. **Coarse value noise** (scale 310 px)
   - Sample two random heights per cell: `-15..+7`.
   - Smoothstep-interpolate between them.
   - Multiply by `macro`.
   - Produces gentle hills and dips.

3. **Fine value noise** (scale 61 px)
   - Two samples per cell: `-2.6..+2.6`.
   - Smoothstep-interpolate.
   - Adds small bumps so the line is not a perfect slope.

Final height:

```ts
GROUND_BASE + coarse + fine
```

Why this design:

- Any chunk can be deleted and later regenerated with no seam.
- No world boundary and no save file.
- The camera can move to ±2 billion and still sample valid ground.
- Rendering and physics share the exact same function.

#### `DISTRICTS` and `districtAt(seed, chunkIndex)`

- The first ten-entry weighted list is:
  ```ts
  ['rail', 'rail', 'village', 'woods', 'outskirts', 'yard', 'village', 'graveyard', 'rail', 'woods']
  ```
  (duplicates give rail/village/woods slightly higher odds)
- Chunk `0` is forced to `rail`.
- Chunk `1` is forced to `village`.
- Everything else is assigned by **region**:
  ```ts
  region = floor(chunkIndex / 3)
  roll = hash01(seed ^ 0x5bd1e995, region + 11)
  district = DISTRICTS[floor(roll * DISTRICTS.length)]
  ```
- A region is three chunks, so a district lasts ~1440 px before it can change.
- Because `region` is part of the hash input, the sequence is stable per seed but different across runs.

#### `generateChunk(seed, index)`

Returns a `TerrainChunk` with `props`, `district`, `startX` and `index`.

**Random stream setup**

```ts
const rand = mulberry32(hashInt(seed ^ 0x27d4eb2d, Math.imul(index, 0x9e3779b1) + 17))
```

This gives each chunk an independent, deterministic sequence. Chunks do not affect each other.

**Local helpers**

- `add(kind, x, depth, variant, scale)` — pushes a prop with a fresh `rand()` as its per-prop seed.
- `addLamp(x, depth)` — places a lamp, then often clusters street furniture:
  - 46% bench nearby,
  - 32% trash can nearby,
  - 24% chance of an extra trash can on the other side.
- `addVillageHouse(x)` — house variant 0–3, scale jitter, sometimes a fence.
- `scatterBench(chance)` / `scatterTrash(chance)` — random placement across the chunk.

**Opening chunk (`index === 0`)**

A composed but jittered scene:

- lamp at ~96–114 px,
- pine left and right,
- a house in the back,
- a fence,
- bench + trash can beside the lamp,
- foreground bush,
- sign near the start,
- 50% chance of a foreground rock.

Nothing uses fixed coordinates without jitter, so every seed's opening screen differs.

**Chunk 1**

A village vignette:

- house,
- lamp,
- dead tree,
- pine,
- two gravestones,
- bench + trash can,
- foreground rock,
- 60% chance of a barrel.

**All later chunks**

District-specific branches:

- **village** — 1–2 houses, gravestone clusters, back lamp, benches, trash, fences, dead trees.
- **woods** — 2–5 pines/dead trees, occasional lamp, foreground bush/rock.
- **yard** — carriage, water tower, lamp, crates, barrels, fences, signs, trash.
- **graveyard** — house chance, 4–8 gravestones, fence, dead tree, lamp, bench.
- **outskirts** — sparse house/lamp/dead tree/rock/sign/bench/trash.
- **rail** — 1–2 lamps, fence, sign, bush, rock, crate, barrel, bench, trash.

**Landmarks**

For every region start (`index % 3 === 0`), `hash01(seed ^ 0x6c078965, region)` decides whether the chunk is a landmark chunk (`> 0.78`). Then:

- `> 0.9` → water tower + lamp,
- otherwise → carriage + house + gravestone.

**Sorting**

All props are sorted by:

```ts
PROP_ORDER[kind] - PROP_ORDER[otherKind] || x
```

The order is: carriage, waterTower, house, gravestone, deadTree, pine, bench, fence, trashCan, barrel, crate, sign, lamp, bush, rock.

The renderer separately draws `back`, `mid` and `front` passes, so this ordering mostly stabilizes drawing within each depth.

#### `findLamps(chunks, seed)`

Convenience helper that returns world positions and variants for every lamp in a set of chunks. The renderer currently finds lamps directly, so this is available for future lighting/minimap work.

---

### 6.6 `engine.ts` — the simulation

This is the largest gameplay file. It owns all mutable state and every rule.

#### Top-level helpers

- `approach(value, target, amount)` — move a number toward a target without overshooting. Used for acceleration, friction, AI steering.
- `createPlayer(x, y)` — constructs a fresh player: 100 HP, pipe equipped, pistol 120, MG 500, no cooldowns.
- `segmentHitsRect(...)` — Liang–Barsky segment/AABB intersection. Bullets use it so fast projectiles cannot tunnel through a zombie between frames.

#### Class state

Core collections:

- `player`
- `zombies`
- `bullets`
- `pickups`
- `particles`
- `texts`
- `chunks: Map<number, TerrainChunk>`

Run state:

- `phase`, `seed`
- `cameraX`, `shake`, `flash`
- `elapsed` (survival time), `time` (animation clock)
- `wave`, `score`, `kills`, `materials`
- `combo`, `comboTimer`, `bestMultiplier`
- `maxProgress`, `startX`
- `spawnTimer`
- `toast`, `weldCooldown`
- `aimWorldX/Y`, `aimTargetId`, `hitMarker`

Private bookkeeping:

- `toastId`, `zombieId`, `pickupId`
- `lastHitSound` (throttles hit SFX to ~35 ms)
- `aimAngle` (sticky mouse angle)
- `nextSpawnSide` (strict alternation)

#### Lifecycle methods

| Method | Behaviour |
| --- | --- |
| `constructor()` | Calls `reset('menu', newSeed())` |
| `reset(phase, seed)` | Rebuilds player, clears all arrays, sets camera, stats, timers, aim, chunks |
| `eventsReset()` | Resets animation `time` and clears bullets |
| `startRun()` | Unlocks audio, resets with a **new seed**, shows toast, equips pipe, plays UI sound |
| `toMenu()` | Resets to menu with a new seed |
| `pause()` | Only from `playing`; clears fire; UI sound |
| `resume()` | Only from `paused`; clears fire; UI sound |
| `selectWeapon(id)` | Allowed in playing/menu; sets a minimum 0.12 s cooldown; clears muzzle |
| `cycleWeapon(direction)` | Wraps around `WEAPON_ORDER` |
| `weld()` | Validates phase, cooldown, missing HP and material cost; spends 40, heals 25, spawns sparks |
| `getHud(muted)` | Pure snapshot builder for React |
| `multiplier` (getter) | `clamp(1 + floor(combo / 3), 1, 5)` |

`getHud()` also formats the seed as the last six hex digits and converts `maxProgress` to metres.

#### `update(dt)`

- Clamps `dt` to `[0, 0.05]` as a second line of defence.
- If paused, returns before advancing any clock.
- Advances `time`, decays shake/flash/weld cooldown and toast.
- Branches by phase.
- Always updates particles, floating text, pickup age and camera.

The camera is skipped while paused/dead inside `updateCamera()`.

#### `updateMenu(dt)`

- Advances the idle walk phase and breathing.
- Pins the player to the ground at the start position.
- Slowly pans:
  ```ts
  cameraX = player.x - 326 + sin(time * 0.16) * 32
  ```
- Ensures chunks exist.
- No spawns, no combat.

#### `updateAfterDeath(dt)`

- Advances zombie animations.
- Winds down the player attack animation and clears the muzzle.
- No AI attacks, no movement.

#### `updateAim()`

Two modes:

**Mouse mode** (`input.mouseActive === true`)

- World aim:
  ```ts
  aimWorldX = cameraX + input.aimX
  aimWorldY = input.aimY
  ```
- If the cursor is more than 8 px from the hand pivot, recompute `aimAngle` toward it. Otherwise keep the previous angle, which prevents jitter when the cursor sits on the pivot.
- Facing follows the horizontal component unless the aim is nearly vertical (`|cos| > 0.18`).
- Hover detection checks every live zombie's torso rectangle expanded by 3 px. The first match becomes `aimTargetId` for the reticle lock.

**Auto-aim mode** (keyboard/touch, or before the mouse moves)

- Find the nearest live zombie to the pivot, measured to torso centre, within 300 px.
- If found, aim at its torso and set `aimTargetId`.
- If not, aim straight ahead 260 px.

`aimPivot()`:

- standing: `(x, y - 21)`
- crouching: `(x, y - 15)`

`weaponSpread()`:

```ts
weapon.spread
  * (crouching ? 0.4 : 1)
  * (moving ? 1.5 : 1)
  * (onGround ? 1 : 1.25)
```

Melee always returns 0. This value is shared by the actual shot and the drawn reticle, so the crosshair never lies.

`muzzlePoint()`:

- barrel length 14 px for pistol,
- 21 px for machine gun (and the pipe visual),
- computed along the current aim angle from the pivot.

#### `updatePlayer(dt)`

Timers:

- cooldown, attack animation, muzzle flash, recoil, invulnerability, hurt, noise all decay.

Crouch and size:

- Crouch only while grounded.
- Height: 30 px standing, 21 px crouching.

Horizontal movement:

- `move = (right?1:0) - (left?1:0)`.
- Target speed: 104 walking, 52 crouching.
- Acceleration: 1400 px/s² grounded, 720 airborne.
- Friction when no input: 1500 grounded, 160 airborne.
- `approach` gives smooth but responsive starts/stops.

Facing:

- Follows movement unless mouse aiming is active (then aim controls facing).

Jump:

- Rising edge sets a 0.12 s jump buffer.
- Grounded coyote time is 0.1 s.
- If both are active, apply `PLAYER_JUMP = -318`.
- Variable jump height: releasing jump while rising faster than -110 clamps `vy` to -110.
- Spawns a small dust burst on take-off.

Vertical physics:

- `x += vx * dt`
- `vy += GRAVITY * dt`
- `y += vy * dt`
- Sample `groundHeightAt(seed, x)`.
- If feet are at/below ground: snap, zero `vy`, grounded, landing dust if the fall was fast.
- **Slope glue:** if the player was grounded, is moving downward, and the ground is less than 7 px below, snap down. This prevents micro-hopping down gentle slopes.
- Otherwise airborne.

Animation and combat:

- Walk phase advances faster while moving/crouching or airborne.
- Fire is attempted whenever `input.fire` is held and cooldown is 0.
- While hurt and grounded, horizontal velocity is damped hard for a moment.

There is **no x clamp**, so the player can walk forever in either direction.

#### `attack()`

**Melee branch**

- Set cooldown and a 0.2 s attack animation.
- Direction comes from the aim vector's horizontal sign.
- For each live zombie:
  - skip zombies far on the opposite side (unless within 8 px),
  - range = `PIPE_RANGE + zombie.w / 2`,
  - require vertical overlap,
  - apply damage and sparks,
  - stop after 3 hits.
- A whiff sets a tiny noise value.

**Ranged branch**

- If ammo is 0:
  - short cooldown,
  - empty click,
  - toast “OUT OF AMMO · FALL BACK TO THE PIPE”,
  - auto-switch to pipe.
- Otherwise:
  - compute spread,
  - compute muzzle,
  - aim from muzzle to the world-space cursor,
  - fall back to `player.aim` if the cursor is essentially on the muzzle,
  - add a uniform random spread offset,
  - push a bullet with `life = 0.95`,
  - decrement ammo,
  - set cooldown, muzzle flash, recoil and noise,
  - add screen shake (MG 0.8, pistol 1.5),
  - play the matching SFX,
  - emit three muzzle sparks and one ejected casing particle,
  - wake every idle zombie within 430 px.

#### `updateSpawner(dt)`

- Count living zombies (`state !== 'die'`).
- Cap:
  ```ts
  min(ZOMBIE_CAP, 3 + wave * 2)
  ```
- On spawn tick:
  - spawn if under cap **and** total zombie array is under the hard cap (corpses temporarily count),
  - after 20 s, 35% chance for a second spawn if still under cap.
- Reset timer:
  ```ts
  max(SPAWN_MIN_INTERVAL, 3.2 - elapsed * 0.012) * randRange(0.65, 1.3)
  ```

#### `pickZombieType()`

- Brutes after 80 s: `min(0.18, 0.02 + wave * 0.015)`.
- Runners after 22 s: if the roll is not a brute and is below 0.42.
- Otherwise walker.

#### `spawnZombie(sideOverride?)`

- Choose type and stats.
- Side is `nextSpawnSide` unless overridden.
- Flip `nextSpawnSide` after normal spawns.
- Spawn x:
  - left: `cameraX - 14 - random * 34`
  - right: `cameraX + VIEW_W + 14 + random * 34`
- Sample ground height at the spawn point.
- Determine `behind`:
  - moving right faster than 25 and spawning left of `player.x - 90`, or
  - moving left faster than -25 and spawning right of `player.x + 90`.
- Build the zombie:
  - speed jitter `stats.speed * 0.9..1.12`,
  - `wakeDelay`: behind → 0.5–1.5 s; otherwise 1.8–5.0 s,
  - `sprint`: behind and not brute → 8–14 s,
  - random visual seed,
  - facing toward the player's side.

#### `spawnBurst(count)`

Spawns `count` zombies while alternating sides, starting from the current `nextSpawnSide`, then stores the next side. Used by wave escalation.

#### `updateZombies(dt)`

For each zombie:

1. Advance animation, hurt and cooldown timers.
2. **Dead:** slow horizontal drift, increment death timer, skip AI.
3. Compute `dx`, `dist`, `dir`, decrement wake delay and sprint.
4. **Idle**
   - friction to a stop,
   - notice if: wake delay expired, within notice radius (120 crouched / 310 standing), or gunfire noise > 0.9 within 470 px,
   - on notice: chase and face the player.
5. **Chase**
   - face the player,
   - if within `reach + 12` (reach 20 brute / 15 other) and vertical difference < 26: enter attack,
   - otherwise steer toward the player.
   - If sprinting and farther than 20 px:
     ```ts
     speed = min(175, max(z.speed * 5.6, |player.vx| + 40))
     ```
   - Acceleration toward that speed is 420 px/s².
6. **Attack**
   - brake to a stop over 900 px/s²,
   - advance the timer,
   - after a **0.32 s wind-up**, if not yet struck:
     - reach = 22 + 6 brute, or 17 + 6 other,
     - check vertical overlap,
     - damage the player or kick up a miss particle,
   - after **0.85 s total**, return to chase and store a 0.45 s cooldown value (the attack-state duration is the actual pacing gate).
7. Physics: apply gravity, move, sample ground, snap/airborne.
8. Off-screen culling: more than 820 px outside the camera bounds → `hp = -999`.

After the loop:

- Run the separation pass (see 7.5).
- Remove zombies that are hard-culled or whose death animation has finished + 0.4 s.

#### `damageZombie(z, amount, dir, hitX, hitY)`

- Ignore already-dead zombies.
- Subtract HP, flash white, force chase, apply knockback (`brute 14`, others `34`).
- Blood burst.
- Throttled hit sound (≥35 ms apart).
- On death:
  - state `die`, timer 0, death knockback,
  - `kills += 1`,
  - `combo += 1`, `comboTimer = 4.2`,
  - update best multiplier,
  - `score += points * multiplier`,
  - blood/skin bursts,
  - floating text (`+100 × mult` style when multiplied),
  - kill SFX,
  - `dropLoot(z)`.

#### Loot methods

`dropLoot(z)`:

- Always spawns materials:
  - brute: 4–7,
  - others: 1–2.
- One extra roll:
  - `< 0.11` → 12 pistol rounds,
  - `< 0.17` → 32 MG rounds,
  - `< 0.21` → 20 HP medkit.

`spawnPickup(kind, x, y, value)`:

- random horizontal velocity -38..38,
- upward velocity -150..-85,
- unique id, age 0, random bob phase.

`updatePickups(dt)`:

- If not grounded:
  - gravity 760,
  - move,
  - on contact with ground (`groundHeightAt - 3`), bounce `vy *= -0.28`, damp `vx *= 0.65`,
  - settle when bounce speed < 26.
- After 0.4 s, if within 74 px, magnetize:
  - speed grows from 95 px/s with age,
  - move directly toward the player's torso.
- Collect at distance < 13.
- Despawn at age 40 s.

`collectPickup(pickup)`:

- materials → `materials += value`, amber text,
- pistol_ammo → pistol ammo, “+N 9MM”,
- mg_ammo → MG ammo, “+N BELT”,
- medkit → heal up to max, “+N COND”,
- pickup SFX, sparks.

#### `updateBullets(dt)`

- Store previous position, integrate, decrement life.
- For each live zombie:
  - segment/AABB test against the zombie's body box expanded by 1 px,
  - on hit: damage, hit marker, spark, stop processing this bullet.
- If no zombie hit and the bullet is below the ground line: dirt spark, remove.
- Remove expired bullets.
- Remove bullets more than **80 px outside the camera**.

This last rule is intentional: projectiles only exist near the view. Do not use off-screen shots to judge aim in tests.

#### `updateCombo(dt)`

- Counts down `comboTimer`; resets `combo` to 0 when it expires.

#### `damagePlayer(amount, sourceX)`

- Ignore if invulnerable or not playing.
- Subtract HP.
- Set invulnerability 0.85 s and hurt 0.42 s.
- Knock the player away from the source at 105 px/s.
- Screen shake 3.6, red flash 1.
- Hurt SFX, floating damage text, blood burst.
- If HP ≤ 0 → `killPlayer()`.

#### `killPlayer()`

- Guard against double death.
- Set HP 0, phase dead, clear fire, clear toast.
- Strong shake and flash, death SFX, large blood burst.
- The survivor is drawn as a corpse afterwards.

#### `updateCamera(dt)`

```ts
lead = clamp(player.vx * 0.16, -14, 14)
target = player.x - VIEW_W * 0.42 + lead
cameraX += (target - cameraX) * (1 - exp(-7.5 * dt))
```

- The player sits at 42% of the screen width.
- Only movement nudges the camera; **aim never moves it**.
- This keeps the screen-to-world mapping under the cursor stable.
- Skipped while dead or paused.

#### `refreshChunks()` / `ensureChunks()`

`ensureChunks()`:

```ts
first = floor((cameraX - VIEW_W * 0.75) / CHUNK_W)
last  = floor((cameraX + VIEW_W * 1.75) / CHUNK_W)
```

Loads every missing chunk in that range.

`refreshChunks()`:

- Calls `ensureChunks()`.
- Computes a slightly tighter visible range.
- Deletes chunks outside `[first - 1, last + 1]`.

Because generation is pure, a chunk deleted behind you and later revisited is rebuilt identically.

#### Effects methods

`updateParticles(dt)`:

- decay life, apply gravity, apply drag, move,
- remove expired,
- enforce `MAX_PARTICLES` by dropping the oldest.

`updateTexts(dt)`:

- rise (`vy = -22`), decay vertical speed, remove at life 0.

`burst(x, y, count, options)`:

- random angle,
- speed scaled 0.35–1,
- upward bias,
- random lifetime 0.6–1.2×,
- supports square/spark/smoke, gravity and drag.

`floatText(x, y, text, color)`:

- 0.85 s rising combat text.

`setToast(text, tone)`:

- replaces the current toast with a 2.8 s message.

---

### 6.7 `render.ts` — the canvas renderer

The renderer is a procedural pixel-art engine. There are no image assets; everything is `fillRect`, paths and a cached radial glow sprite.

#### Pixel text

- `DIGITS` — a 3×5 bitmap font covering 0–9, A–Z, `+ - . !` and space.
- `drawPixelText(ctx, text, x, y, color, scale, alpha)` — uppercases, looks up each glyph, draws lit cells as rectangles, advances 4×scale per character.
- `textWidth(text, scale)` — width calculation.

This font is used for floating combat text inside the canvas. The React HUD uses real fonts.

#### Sky and far background

`SKY_BANDS` — 13 colors from near-black at the zenith to rust at the horizon. `drawSky` fills weighted horizontal bands up to y=206, then fills the rest with the last color.

`drawHorizonHaze(ctx, time)`:

- stacked translucent warm bands near the horizon,
- slow sine shimmer,
- a warm smear behind the village skyline.

`drawMoon(ctx, time)`:

- fixed position `(374, 49)`, radius 17,
- soft radial halo,
- one-pixel-per-row stepped circle body,
- asymmetric craters to avoid a face pattern,
- a slowly drifting cloud fragment across the lower limb.

`stepCircle(ctx, cx, cy, r)` — helper for stepped 3-px disc rows, used by carriage wheels.

`STARS` / `drawStars`:

- 78 precomputed stars with position, size, twinkle phase and speed,
- 0.015 parallax wrap,
- sinusoidal twinkle,
- two-pixel stars get cross sparkles.

`CLOUDS` / `drawClouds`:

- 7 precomputed cloud banks,
- wrap across 840 px,
- drift with time and 0.045 camera parallax,
- main slab plus upper/lower lobes,
- faint moonlit rim.

`ridgeHeight(seedOffset, x, base, amplitude)`:

- smoothstep-interpolated value noise at 74 px scale,
- returns a height above the base.

`drawRidge(...)`:

- fills a silhouette polygon from the ridge line to the bottom of the screen.
- The pipeline draws three ridges with increasing parallax:
  - 0.08 / base 190 / amplitude 36,
  - 0.15 / base 199 / amplitude 25,
  - 0.22 / base 207 / amplitude 13.

`drawHauntedVillage(ctx, camX, time, seed)`:

- **Far hamlet** (parallax 0.17, spacing 152):
  - low rooftop silhouettes,
  - occasional steeple,
  - occasional dim window.
- **Near clusters** (parallax 0.31, spacing 330):
  - 1–2 crooked houses per cluster,
  - gabled/broken rooflines, chimneys,
  - lit windows with flicker and additive glow,
  - doorways and porch steps,
  - a chapel with a crooked steeple and cross on some clusters,
  - crooked fences and headstones,
  - a dead tree leaning over the roofs,
  - a spectral green lantern drifting on a sine path.
- **Fog** — translucent bands creeping along the foundations, shifted by camera and time.

`drawPylons(ctx, camX)`:

- telegraph/utility poles at parallax 0.19, spacing 196,
- crossarms and insulators,
- two sagging wires between consecutive poles,
- drawn before the near ridge/haze so they sit in the mid-distance.

`drawDistantTrees(...)`:

- reusable silhouette-tree layer,
- deterministic positions, heights and half-widths,
- used twice: 0.44 parallax (larger, lighter) and 0.63 parallax (smaller, darker).

#### Glow sprite

`getGlowSprite()` lazily builds a 96×96 canvas with a radial gradient and caches it in module scope.

`drawLampGlow(ctx, x, y, strength)`:

- additive (`lighter`) double draw,
- large soft pool + small hot core.

#### Foreground parallax

`drawForegroundLayer(ctx, camX, seed, time)`:

- very-near grass/reed silhouettes at parallax 1.16 (faster than the world),
- 21 px spacing,
- seed-varied offsets, heights and two dark greens,
- occasional dry stalk with a seed head,
- drawn after the world transform is restored, so it sits on top of everything.

#### Ground

`drawGround(ctx, engine, camX)` paints the whole rail bed procedurally, sampling `groundHeightAt` every 3 px:

1. **Dirt body** — filled polygon from the surface to the bottom.
2. **Deep dirt bands** — short horizontal dashes 22 px below the surface.
3. **Embedded stones** — deterministic 1–4 px stones in the near bank.
4. **Lower dark band** — 44 px below the surface, a darker fill to add depth.
5. **Ballast strip** — 2–11 px below the surface, grey gravel bed.
6. **Gravel speckles** — 2×1 px stones every 7 px.
7. **Sleepers** — 5×6 px wooden ties every 21 px.
8. **Rails** — 8 px stepped segments, rust line below a steel line.
9. **Puddles** — every 53 px with 58% skip chance; translucent reflective ellipses.
10. **Surface edge** — 2 px dark edge + 1 px grass rim.
11. **Grass tufts** — deterministic 1 px blades every 13 px.

`drawForegroundGrass(...)`:

- larger tufts every 18 px, skipping 36% of slots (≈64% draw),
- drawn after actors so blades overlap boots and zombie feet.

#### Props

`drawProp(ctx, prop, seed, time)` is the dispatcher. It computes the ground base and applies per-kind scale multipliers:

| Kind | Multiplier |
| --- | --- |
| house | 1.24 |
| pine | 1.18 |
| lamp | 1.24 |
| carriage | 1.08 |
| waterTower | 1.14 |
| fence | 1.12 |
| everything else | 1.0 |

Drawing functions:

- `drawPine` — trunk, three triangular tiers with stepped rows, left-edge highlights.
- `drawDeadTree` — bare trunk plus four branching limbs drawn pixel-by-pixel.
- `drawHouse` — four variants:
  - gabled house with shingled roof and chimney smoke,
  - flat-roofed storefront with awning and sign,
  - darker gabled variant,
  - boarded chapel with spire.
  - Lit windows (`seed > 0.32`) get additive glow. Shared doorway, porch step and wall texture.
- `drawCarriage` — derailed passenger car: body, roof, windows, wheels (`stepCircle`), undercarriage.
- `drawWaterTower` — legs, cross-bracing, tank, roof.
- `drawLamp` — post, arm, head and flickering additive glow (the warm ground pool is added by `renderGame` right after the lamp).
- `drawFence` — two colour/height variants with regularly spaced posts and two horizontal rails.
- `drawSign` — post and bordered plate showing a deterministic two-digit number rendered with the bitmap font.
- `drawBush` — layered dark green clumps.
- `drawRock` — stepped boulder with highlight.
- `drawBench` — slats, legs, variant wear.
- `drawTrashCan` — cylinder, lid, ribs, variant tilt/dents.
- `drawBarrel` — staves, bands, variant lid/tilt.
- `drawCrate` — planked box with cross-brace and stencil marks.
- `drawGravestone` — rounded or slab marker, cross/chip details, grass at the base.

Props never affect collision.

#### Characters

`drawShadow(ctx, x, y, width, strength)`:

- 2 px dark ellipse-like slab + 1 px lower line,
- strength reduced while airborne or dying.

`drawSurvivor(ctx, engine)`:

- shadow at the ground point,
- if dead, `drawCorpse` and return,
- compute bob (walk), breathing (idle), crouch height, invulnerability flicker,
- translate to feet, scale by facing,
- draw legs for airborne / crouched / moving / idle poses,
- backpack + strap, torso, jacket shading, belt,
- scarf with a three-segment trailing tail animated by time,
- head, hair, eye, scar,
- rear arm,
- restore, then draw the weapon in world space at the aim pivot.

`drawWeapon(ctx, x, y, aim, engine)`:

- aim direction from the engine,
- flip horizontally when aiming left,
- rotate to the aim angle,
- recoil shifts the weapon backward,
- pipe swing rotates through an arc during `attackAnim`, plus a translucent swing arc,
- draws sleeve, hand, then the pipe/pistol/MG pixel shapes,
- muzzle flash for ranged weapons,
- barrel lengths match `muzzlePoint()` (14 pistol, 21 MG/pipe).

`drawCorpse(ctx, engine)`:

- lying body, blood pool, boots, jacket, scarf and head,
- oriented by the player's last facing.

`drawZombie(ctx, z, time)`:

- shadow + blood pool while dying,
- death squash: vertical scale shrinks toward 0.18, fade after 55% of the death duration,
- walk sway and alternating legs,
- type-specific skin and shirt colors,
- torso, blood stain, head, eye pixels,
- arms reach farther while chasing, pull back while dying, lift during attack wind-up,
- brute ribs and torn cloth,
- glowing red eyes (unless hurt/dying),
- white flash while hurt,
- health pips above damaged zombies.

#### Pickups, particles, bullets

`drawPickup`:

- bob via sine,
- fade in over the first 0.2 s,
- blink after 35 s,
- soft glow,
- distinct sprites for material bundle, medkit, pistol ammo box and MG ammo box.

`drawParticles`:

- alpha = remaining life / max life,
- `spark` — line along the velocity vector, length 1–4 px,
- `smoke` — grows as it fades,
- `square` — fixed-size rectangle.

`drawBullets`:

- 2 px translucent amber tracer from previous to current position,
- 1 px pale line on top,
- bright 1 px head.

#### Ambient and overlays

`drawMotes`:

- 16 dust/firefly motes,
- 0.15 camera parallax,
- time drift and sine vertical motion,
- amber or pale grey, alpha pulsing.

`drawReticle(ctx, engine)`:

- only while playing and mouse aiming,
- spread in pixels:
  ```ts
  clamp(round(tan(weaponSpread()) * distance + recoil * 2), 2, 26)
  ```
- colors:
  - empty gun → `#e85540`,
  - target under cursor → `#ff8a66`,
  - normal → `#ffca78`,
- dark offset underlay for readability,
- four crosshair arms at `±spread`, plus small outer ticks at `±(spread + 2)`,
- center dot,
- when a target is hovered, corner brackets at `spread + 5`.

Because the reticle uses the same `weaponSpread()` and distance as the projectile code, the drawn spread matches the real random cone.

`drawHitMarker`:

- four corner ticks,
- alpha fades over 0.14 s.

`drawDamageFlash`:

- full-screen red tint from `engine.flash`,
- low-HP pulsing red edges when HP ≤ 30 and playing.

#### `renderGame(ctx, engine, reducedMotion)`

The complete pipeline, in order:

1. Round the camera; compute screen shake (disabled if reduced motion).
2. Disable image smoothing; clear the canvas.
3. `drawSky`
4. `drawStars`
5. `drawMoon`
6. `drawClouds`
7. Far ridge (parallax 0.08)
8. Mid-far ridge (0.15)
9. `drawPylons`
10. `drawHorizonHaze`
11. Near ridge (0.22)
12. Distant tree layer (0.44)
13. Distant tree layer (0.63)
14. `drawHauntedVillage`
15. Save, translate by `(-cameraX + shakeX, shakeY)`.
16. Sort visible chunks by index.
17. **Back props** (all chunks).
18. **Mid props except lamps** (lamps are drawn after the ground).
19. `drawGround`
20. **Lamp posts + ground pools**, with flicker.
21. `drawMotes` (world-space pass).
22. Pickups.
23. Zombies.
24. Survivor.
25. Bullets.
26. Particles.
27. Hit marker.
28. Floating pixel texts, culled 14 px outside the screen.
29. **Front props**.
30. `drawForegroundGrass`.
31. Dark band at the bottom edge.
32. Restore transform.
33. `drawForegroundLayer` (very-near parallax silhouettes).
34. `drawMotes` (screen-space pass).
35. `drawDamageFlash`.
36. `drawReticle`.

The layering is what creates the depth: sky → far parallax → mid parallax → back props → ground → actors → front props → foreground silhouettes → screen overlays.

---

### 6.8 `useGameEngine.ts` — the React bridge

This hook connects three worlds: the engine, the DOM input system and React state.

#### Types

- `VirtualControl` — `left | right | jump | crouch | fire`.
- `GameActions` — the full action surface exposed to components:
  - `start`, `restart`, `pause`, `resume`, `togglePause`, `toMenu`,
  - `selectWeapon`, `cycleWeapon`, `weld`, `toggleMute`,
  - `setVirtual`.
- `UseGameEngineResult` — `{ hud, actions }`.

#### Engine lifetime

```ts
const engineRef = useRef<GameEngine | null>(null)
if (!engineRef.current) engineRef.current = new GameEngine()
const engine = engineRef.current
```

- One engine per mounted game.
- It survives React re-renders.
- It is **not** reset on every render; only explicit actions reset it.

#### HUD state

- `useState(engine.getHud(sound.muted))`.
- `sync()` immediately pulls a fresh snapshot after any action, so buttons feel instant.
- `toggleMute` unlocks audio, flips mute, and syncs.

#### Actions

Each action calls the matching engine method and then `sync()`:

- `start` / `restart` both call `engine.startRun()` (new seed).
- `pause` / `resume` / `togglePause` respect current phase.
- `toMenu` resets to menu.
- `selectWeapon` / `cycleWeapon` / `weld` call the engine.
- `setVirtual(control, pressed)`:
  - unlocks audio on press,
  - writes directly into `engine.input[control]`,
  - pressing fire via touch sets `mouseActive = false` so auto-aim takes over.

#### The main effect

Runs once per canvas/engine mount.

**Reduced motion**

- Reads `prefers-reduced-motion`.
- Updates on change.
- Passed to `renderGame`; it disables screen shake but keeps the simulation intact.

**Fixed-step loop**

- `STEP = 1/60`.
- Raw delta clamped to 0.1 s.
- Accumulator consumes fixed steps, max 5.
- Render once per animation frame.
- HUD snapshot every 0.07 s.

**Pointer mapping**

`toLogical(event)` converts client coordinates into 480×270 canvas coordinates using the canvas bounding rect. This is essential because the canvas is CSS-scaled to fill the stage.

Pointer behavior:

- `pointermove` (mouse only) → update `aimX/aimY`, set `mouseActive = true`.
- `pointerdown`:
  - ignore non-left mouse buttons,
  - update aim for mouse,
  - set `pointerFire = true`,
  - unlock audio.
- Global `pointerup` / `pointercancel` → clear pointer fire.
- `pointerleave` on canvas → clear pointer fire.
- `contextmenu` → prevent default.

`refreshFire()` combines keyboard and pointer fire:

```ts
engine.input.fire = keyFire || pointerFire
```

**Keyboard**

Key-down:

- Prevent default for Space and arrows (page scrolling).
- Ignore auto-repeat.
- Movement / jump / crouch set held flags.
- `F` / `J` set keyboard fire.
- `1` / `2` / `3` select weapons.
- `Q` cycles.
- `H` welds.
- `M` toggles mute.
- `Esc` / `P` pause/resume.
- `Enter` starts from menu, restarts from death, resumes from pause.
- `R` restarts from death.

Key-up clears the matching held flags and fire.

**Focus safety**

- `resetInput()` clears all held keys, pointer fire and engine fire.
- On `blur`, it resets input and pauses if playing.
- On `visibilitychange` while hidden, the same handler runs.

This is why screenshots or switching windows can pause the game.

**Cleanup**

- Cancels the rAF.
- Removes the media listener.
- Removes every window/document/canvas listener.
- StrictMode double-mount therefore leaves no duplicate handlers.

**Development hook**

```ts
if (import.meta.env.DEV) window.__deadline = engine
```

Available only in development builds. See section 10.

`WEAPON_LABELS = WEAPONS` is exported at the bottom as a convenience alias; components import `WEAPONS` directly.

---

### 6.9 `audio.ts` — synthesized sound

`SoundKit` generates every sound live with the Web Audio API. No files, no loading screen.

#### Lifecycle

- `ctx` is `null` until `unlock()` is called from a user gesture.
- `master` gain node defaults to 0.7.
- A 0.7-second white-noise buffer is generated once.
- `unlock()` also resumes a suspended context.
- `setMuted(value)` ramps master gain to 0 or 0.7 over 20 ms.
- `ready` checks that context, master and noise buffer all exist.

#### Helpers

`noise(duration, filterType, frequency, volume, endFrequency?)`:

- buffer source → biquad filter → gain → master,
- optional exponential filter sweep,
- gain decays exponentially to near-zero.

`tone(type, duration, frequency, volume, endFrequency?, attack?)`:

- oscillator → gain → master,
- optional pitch sweep,
- short attack, exponential decay.

Both helpers short-circuit when muted or not ready.

#### Sound table

| Method | Recipe | Used for |
| --- | --- | --- |
| `pistol()` | bandpass noise 1500→400 + square 180→60 | Pistol shot |
| `mg()` | highpass noise 900→1600 + square 130→70 | MG shot |
| `melee()` | bandpass noise 600→1800 | Pipe swing |
| `hit()` | lowpass noise 800→300 + sine 110→60 | Bullet/melee impact |
| `kill()` | lowpass noise 620→160 + saw 90→40 | Zombie death |
| `hurt()` | saw 170→70 + lowpass noise | Player damage |
| `empty()` | square 880→520 | Out of ammo |
| `pickup()` | square 660, then 990 after 45 ms | Loot collect |
| `weld()` | bandpass 1200→3000 + triangle 320→640 | Repair |
| `wave()` | two low saws | Wave escalation |
| `ui()` | square 540→620 | Menu/button feedback |
| `death()` | long saw 140→35 + lowpass noise | Player death |

`export const sound = new SoundKit()` is the single shared instance used by the engine, hook and HUD.

---

### 6.10 Components

#### `GameCanvas.tsx`

The composition root of the playfield.

- Creates `canvasRef`.
- Calls `useGameEngine(canvasRef)`.
- `showHud` = playing or paused.
- Renders:
  - `<canvas width={480} height={270}>` with `pixel-canvas`, full-size absolute positioning,
  - `cursor-none` while playing, normal cursor otherwise,
  - `stage-vignette` overlay (z-10),
  - `UIHUD` while playing/paused (z-20),
  - `TouchControls` while playing (z-25, but CSS only shows them on coarse pointers),
  - `StartScreen` / `PauseScreen` / `DeathScreen` depending on phase (z-30),
  - scanlines (z-40),
  - inset shadow (z-40),
  - four corner brackets (z-40).

The canvas has an `aria-label` and fallback text for accessibility.

#### `UIHUD.tsx`

A pure presentational HUD. It does not touch the engine.

- `Plate` — reusable bordered panel with an amber/rust accent tab and corner pixel.
- `Vitals`
  - 10 segmented condition bar.
  - Colors: >55% amber, >30% rust-light, ≤30% blood.
  - Pulsing “CRITICAL” label at ≤30%.
  - Numeric HP.
  - On smaller than `lg`, also shows distance and wave.
- `Odometer` (desktop only)
  - distance in metres,
  - wave,
  - survival clock.
- `Ledger`
  - score (six digits),
  - materials with plank icon,
  - kills with skull icon,
  - current multiplier when >1.
- `WeaponButton`
  - slot number,
  - inline SVG weapon icon,
  - name (MG abbreviated on small screens),
  - ammo (`∞` for pipe),
  - active styling and dry-ammo red state.
- `UIHUD`
  - returns null in menu/dead (defensive; parent already hides it),
  - low-health radial red vignette,
  - top row: Vitals / Odometer / Ledger,
  - centered toast with tone-based border and dot,
  - bottom row: weapon cards, Weld button, pause button, mute button.
  - Weld is disabled unless `hud.canWeld`.

#### `OverlayScreens.tsx`

- `Keycap` — small keyboard key visual.
- `ControlRow` / `ControlSheet`
  - field-manual grid: move, jump, crouch, fire, weapons, aim, weld, pause,
  - compact mode for pause,
  - hidden on short viewports via `.manual-on-tall`.
- `StartScreen`
  - left-side gradient over the live menu scene,
  - title, tagline, tags,
  - controls,
  - “START RUN” button (Enter),
  - “fresh terrain every run” note and audio toggle.
- `PauseScreen`
  - seed display,
  - distance / kills / score summary,
  - compact controls,
  - Resume (Esc), Restart (new terrain), Abandon run.
- `DeathScreen`
  - run-terminated header, seed,
  - narrative summary with distance and kills,
  - final score,
  - distance / survived / wave,
  - kills / materials / best streak,
  - “RIDE AGAIN” (Enter or R),
  - back to platform,
  - “New terrain, new dead. Nothing carries over.”

All overlays are absolutely positioned over the canvas; on mobile/coarse pointers they become fixed full-screen.

#### `TouchControls.tsx`

- `HoldButton` — pointer-capture button:
  - `pointerdown` prevents default, captures the pointer, sets the virtual control true,
  - `pointerup`, `pointercancel`, `pointerleave`, `lostpointercapture` all release it,
  - context menu suppressed.
- Layout:
  - left cluster: jump on top, left / crouch / right below,
  - right cluster: “Swap gun”, large FIRE button, “Auto aim” hint.
- `.touch-only` hides the whole component unless the device reports a coarse pointer.
- Holding fire is intentional for the machine gun.
- Touch fire disables mouse aim, so the engine targets the nearest zombie.

#### `Icons.tsx`

Inline SVG pixel icons:

- `PipeIcon`, `PistolIcon`, `MgIcon`, `WeaponIcon` dispatcher,
- `PlankIcon` for materials,
- `SkullIcon` for kills,
- `SpeakerIcon` with muted/unmuted variants,
- `PauseIcon`, `PlayIcon`,
- `CrosshairIcon` (available; currently unused).

They use `shapeRendering="crispEdges"` to stay pixel-sharp.

---

### 6.11 `format.ts`

- `pad(value, digits)` — floor at 0, pad with leading zeros.
- `clock(seconds)` — `MM:SS`, floored at 0.

Used by the HUD, pause screen and death screen.

---

## 7. Systems deep-dive

### 7.1 Coordinate spaces and the camera

There are two spaces:

- **World space** — absolute x, unbounded. All physics, props and chunks live here.
- **Screen space** — 480×270 logical canvas pixels.

Horizontal mapping:

```ts
screenX = worldX - cameraX
worldX  = cameraX + screenX
```

Vertical mapping is direct: `screenY = worldY`. There is no vertical camera.

The camera targets:

```ts
player.x - 480 * 0.42 + clamp(player.vx * 0.16, -14, 14)
```

with exponential smoothing `1 - exp(-7.5 dt)`.

Consequences:

- The player is normally at 42% of the screen width.
- Moving fast looks slightly ahead.
- Aiming does **not** move the camera, so the point under the cursor maps to a stable world position.
- Mouse aim is recomputed as `cameraX + input.aimX` every frame, so the cursor stays over the same screen location as the camera moves.

### 7.2 Aiming, spread and projectiles

The hand pivot is:

- standing: 21 px above the feet,
- crouching: 15 px above the feet.

The muzzle is placed along the aim angle:

- pistol: 14 px from pivot,
- MG: 21 px from pivot.

A ranged shot:

1. Computes `spread = weaponSpread()`.
2. Computes the angle from muzzle to `(aimWorldX, aimWorldY)`.
3. Adds `randRange(-spread, spread)`.
4. Spawns a bullet at the muzzle with velocity `speed * (cos, sin)`.

Spread modifiers:

- crouching ×0.4,
- moving ×1.5,
- airborne ×1.25.

So a moving, airborne pistol shot is `0.012 × 1.5 × 1.25 = 0.0225 rad`; a crouched, still pistol shot is `0.0048 rad`.

Reticle spread in pixels:

```ts
clamp(round(tan(spread) * distance + recoil * 2), 2, 26)
```

where `distance` is from the hand pivot to the world aim point. The crosshair therefore opens up with distance and recoil, and tightens when crouched.

Hover lock:

- A zombie is “hovered” if the cursor is inside its torso rectangle expanded by 3 px.
- The reticle changes color and draws corner brackets.
- This is visual feedback only; the bullet still travels along the real spread cone. You can miss a hovered target at long range with the MG.

Bullet collision:

- Liang–Barsky segment vs AABB using previous and current positions.
- This avoids tunneling even at 600 px/s with a 1/60 s step (~10 px per step).

### 7.3 Player physics

Numbers:

- Gravity: 1020 px/s².
- Walk: 104 px/s, crouch: 52 px/s.
- Jump impulse: -318 px/s.
- Ground acceleration: 1400 px/s²; air acceleration: 720.
- Ground friction: 1500 px/s²; air friction: 160.

Jump feel:

- 0.12 s jump buffer (press slightly before landing).
- 0.1 s coyote time (jump slightly after leaving ground).
- Variable height: releasing early clamps upward velocity.
- Slope glue: snaps down up to 7 px when grounded, preventing stutter on downhill terrain.

There is no horizontal collision and no x boundary. The only solid surface is the ground curve.

### 7.4 Zombie state machine

```
                 wakeDelay <= 0
                 OR dist < notice
                 OR noise > 0.9 && dist < 470
      idle ───────────────────────────────▶ chase
        ▲                                    │
        │                                    │ dist < reach + 12
        │                                    │ && |Δy| < 26
        │                                    ▼
        │                                 attack
        │                                    │ wind-up 0.32 s → strike
        │                                    │ total 0.85 s
        └────────────────────────────────────┘

      any state ── hp <= 0 ──▶ die ── timer > deathDuration ──▶ removed
```

- `anim` drives sway, legs and arm motion; it advances faster while chasing.
- `facing` always points at the player while chasing/attacking.
- `hurt` is a short white-flash timer.
- `hasStruck` ensures exactly one strike per attack.
- `seed` varies shirt color and visual details.
- `spawnSide` records where it entered; used mainly for debugging/analysis.
- `wakeDelay` guarantees eventual pursuit.
- `sprint` is a finite catch-up resource.

Attack reach is slightly longer for brutes. Vertical overlap must be within roughly the body height, so a zombie on a steep slope above/below you may miss.

### 7.5 Separation / crowd behaviour

After movement, every pair of live zombies is checked:

- If horizontal distance < `(wA + wB) / 2 + 1` and vertical distance < 12, they overlap.

The algorithm deliberately does **not** push both apart equally:

1. Determine which zombie is **closer to the player** (`front`).
2. The other is `rear`.
3. If the front zombie is attacking **or** within 22 px of the player:
   - the rear zombie backs off by at most 1.2 px per frame.
   - This makes attackers solid blockers and queues the horde behind them.
4. Otherwise:
   - the **rear shoves the front forward** by the full overlap + 0.05 px toward the player.

Why:

- Equal push-apart would make a fast flanker match the pace of a slow walker it is stuck behind, causing the whole cluster to crawl slower than the player.
- Shoving the front forward preserves the rear zombie's speed budget and lets fast runners actually reach a sprinting survivor.
- Treating an attacking zombie as solid prevents the rear from pushing it through the player.

This is an O(n²) pass, but `n` is capped at 18, so it is cheap.

### 7.6 Chunk streaming

`CHUNK_W = 480`, exactly one screen width.

Load window:

```ts
first = floor((cameraX - 360) / 480)
last  = floor((cameraX + 840) / 480)
```

Delete window (with one-chunk hysteresis):

```ts
first = floor((cameraX - 480) / 480)
last  = floor((cameraX + 960) / 480)
keep [first - 1, last + 1]
```

This loads roughly 0.75 screens behind and 1.75 screens ahead, and keeps an extra chunk of margin before deletion. Because generation is pure, revisiting a deleted chunk rebuilds exactly the same props.

Each chunk stores:

- `index`,
- `startX`,
- `district`,
- sorted `props`.

The renderer sorts visible chunks by index and iterates their props three times (back, mid, front). The small chunk list is sorted per frame, but the props themselves never need re-sorting.

### 7.7 Determinism: what the seed controls

**Seed-controlled (deterministic):**

- ground height everywhere,
- district sequence,
- chunk props, variants, scales, positions,
- opening chunk composition,
- landmark rolls,
- haunted-village skyline and window patterns,
- grass, stones, puddles, stars (some use fixed hashes rather than the run seed, but are still stable).

**Not seed-controlled (`Math.random`):**

- zombie type rolls,
- spawn jitter and timing randomization,
- loot rolls,
- bullet spread,
- particle bursts,
- SFX noise buffer contents,
- new seed generation itself.

So the **map** is reproducible from a seed, but combat is not. This is intentional: the terrain is the authored/procedural part, while combat should feel alive.

`newSeed()` is called:

- once in the constructor for the menu,
- on every `startRun()` / restart,
- on `toMenu()`.

Nothing is written to `localStorage`, cookies or a server.

### 7.8 Rendering pipeline in order

For quick reference, the exact `renderGame` order is:

```
sky
stars
moon
clouds
ridge 0.08
ridge 0.15
pylons
horizon haze
ridge 0.22
distant trees 0.44
distant trees 0.63
haunted village
── world transform ──
back props
mid props (not lamps)
ground
lamp posts + lamp pools
motes (inside transform)
pickups
zombies
survivor + weapon
bullets
particles
hit marker
floating texts
front props
foreground grass
bottom dark band
── restore ──
foreground parallax silhouettes
motes (screen space)
damage flash
reticle
```

The React DOM layers sit on top of the canvas:

```
z-10 stage vignette
z-20 HUD
z-25 touch controls
z-30 overlays (menu/pause/death)
z-40 scanlines, inset shadow, corner brackets
```

---

## 8. Where to change what

| I want to change… | Edit… | Notes |
| --- | --- | --- |
| Walk / crouch / jump feel | `constants.ts` (`PLAYER_*`, `GRAVITY`) and `engine.updatePlayer` | Acceleration, friction, coyote and buffer are in `updatePlayer`, not constants |
| Player HP or starting ammo | `engine.createPlayer` | HP 100, pistol 120, MG 500 |
| Weapon damage / cooldown / spread / ammo | `constants.ts` `WEAPONS` | Also update `drawWeapon` if the sprite shape changes |
| Melee reach / hit count | `PIPE_RANGE`, `engine.attack` | Max 3 hits per swing is hard-coded |
| Zombie stats | `constants.ts` `ZOMBIE_STATS` | HP, speed, damage, points, size, death time |
| Zombie population | `ZOMBIE_CAP`, `updateSpawner` | Cap formula is `min(18, 3 + wave*2)` |
| Wave length | `updatePlaying` | `42` seconds per wave |
| Spawn rate | `updateSpawner` | Base 3.2 s, floor 0.6 s, jitter 0.65–1.3 |
| Type mix | `pickZombieType` | Brute/runner thresholds |
| Flanker catch-up | `spawnZombie` / `updateZombies` | `wakeDelay`, `sprint`, 5.6× multiplier, 175 px/s cap |
| Loot rates | `dropLoot` | Materials and ammo/medkit probabilities |
| Weld economy | `WELD_COST`, `WELD_AMOUNT` | Toasts and cooldown are in `weld()` |
| Combo / score | `damageZombie`, `multiplier` | 4.2 s combo window, ×1–×5 |
| Camera framing | `updateCamera` | 42% screen position, lead clamp, smoothing |
| Chunk size / load window | `CHUNK_W`, `ensureChunks`, `refreshChunks` | Keep load/delete windows consistent |
| Terrain shape | `world.groundHeightAt` | Macro sine + coarse/fine noise amplitudes |
| District mix | `DISTRICTS`, `districtAt` | Three-chunk regions |
| Prop layout | `world.generateChunk` | Opening composition is explicit |
| Prop art | `render.draw*` functions | All procedural |
| Sky / parallax / village | `render.drawSky`, `drawRidge`, `drawHauntedVillage`, `drawPylons` | Parallax factors are call-site arguments |
| Palette | `constants.PALETTE` and `tailwind.config.js` | Canvas and DOM use separate palettes; keep them in sync |
| HUD layout / copy | `UIHUD.tsx`, `OverlayScreens.tsx` | Pure React |
| Controls | `useGameEngine.ts` key/pointer handlers | Also update `ControlSheet` labels |
| Mobile buttons | `TouchControls.tsx` | `.touch-only` CSS gates visibility |
| Audio | `audio.ts` | Each SFX is a few lines of noise/tone |
| Page chrome | `App.tsx`, `index.css` | Header/footer/stage sizing |

---

## 9. Extension recipes

### Add a weapon

1. Add the id to `WeaponId` in `types.ts`.
2. Add its full definition to `WEAPONS` in `constants.ts`.
3. Add it to `WEAPON_ORDER` (position = slot order).
4. Add starting ammo in `createPlayer` (`ammo` is a `Record`, so TypeScript will force this).
5. Add a key binding in `useGameEngine.ts` (`Digit4`).
6. Add an icon in `Icons.tsx` and handle it in `WeaponIcon`.
7. Add a drawing branch and muzzle length in `render.drawWeapon`.
8. If it is ranged, ensure `muzzlePoint()` returns the matching barrel length.
9. If it has special behaviour, branch in `engine.attack`.

### Add a zombie type

1. Add to `ZombieType` in `types.ts`.
2. Add stats to `ZOMBIE_STATS`.
3. Roll it in `pickZombieType`.
4. Add skin/shirt/pose variation in `drawZombie`.
5. If it needs special reach or AI, branch in `updateZombies` (brutes already do this).

Everything else (spawning, damage, loot, scoring, health pips) works from stats automatically.

### Add a prop

1. Add to `PropKind` in `types.ts`.
2. Add a sort priority in `world.PROP_ORDER`.
3. Place it in the relevant district branch of `generateChunk` (or the opening chunks).
4. Write a `drawX` function using the existing `rect` pattern.
5. Add a case to `render.drawProp`.
6. Choose `back`, `mid` or `front` depth.

Props are non-colliding, so no physics changes are needed.

### Add a district

1. Add to `District` in `types.ts`.
2. Add entries to `DISTRICTS` (duplicate names to weight them).
3. Add a generation branch in `generateChunk`.
4. Optionally add a renderer treatment if the district needs a special skyline.

### Add a pickup

1. Add to `PickupKind`.
2. Spawn it in `dropLoot` or elsewhere.
3. Handle it in `collectPickup`.
4. Draw it in `drawPickup`.
5. Add floating text / HUD feedback if needed.

### Add a sound

1. Add a method to `SoundKit` using `noise()` / `tone()`.
2. Call it from the engine at the right moment.

No asset pipeline is involved.

---

## 10. Debugging and QA

### Development hook

In development only:

```js
window.__deadline
```

is the live `GameEngine`. Examples:

```js
__deadline.startRun()
__deadline.spawnZombie()
__deadline.spawnBurst(4)
__deadline.player.hp = 100
__deadline.materials = 999
__deadline.wave
__deadline.zombies.length
__deadline.seed
__deadline.reset('playing', 12345)
__deadline.input.mouseActive = false
```

`reset('playing', seed)` is especially useful for reproducing a terrain layout.

The hook is stripped from production builds by `import.meta.env.DEV`.

### Common gotchas

- **The game pauses when the window loses focus.** This is deliberate (`blur` / `visibilitychange`). Screenshots taken while another window is focused will show a paused frame.
- **The reticle only draws while `phase === 'playing'` and `mouseActive === true`.** Keyboard/touch players use auto-aim and see no mouse reticle.
- **Bullets are culled 80 px outside the camera.** Off-screen shots are not simulated for long.
- **HUD updates every ~70 ms, not every frame.** A value may lag the simulation slightly in React.
- **Distance is in metres, not pixels.** `HudState.distance = maxProgress / 8`.
- **The displayed seed is only the last six hex digits.** The engine still holds the full 32-bit seed.
- **Terrain is deterministic per seed; combat is not.** Two runs with the same seed share terrain but not zombie rolls.
- **Props do not collide.** Walking through a bench is expected.
- **`engine.elapsed` is survival time; `engine.time` is animation time.** Pausing freezes both.
- **Restarting always creates a new seed.** There is no “same map again” button.

### Build and type checks

```bash
npx tsc --noEmit
npm run build
```

The build script already runs `tsc` first. The production output is `dist/`.

### Quick manual test checklist

- Start a run: new terrain, pipe equipped, HUD visible.
- Move both directions; distance increases in both.
- Jump, release early (short hop), jump while running (full height).
- Crouch: slower movement, smaller hitbox, tighter pistol reticle.
- Fire pistol at near/mid/far targets; reticle opens with distance.
- Hold MG: rapid fire, wide cone, muzzle flash, casings.
- Let ammo hit 0: auto-switch to pipe and toast.
- Take damage: red flash, knockback, invulnerability flicker.
- Kill zombies: materials drop, combo rises, multiplier appears at 3 kills.
- Weld at 40 materials: +25 HP, cooldown, toast.
- Survive 42 s: wave toast and burst spawn.
- Run in one direction for a minute: zombies still arrive from behind.
- Pause/resume; blur the window; verify auto-pause.
- Die: corpse, death screen, stats, restart gives a new map.

---

## 11. Design invariants and common questions

### Why is the canvas 480×270?

It is a small, fixed logical resolution that upscales cleanly with `image-rendering: pixelated`. Physics and sprite sizes stay in integer-friendly pixel units, while the CSS layer scales the canvas to the stage.

### Why is the world infinite without a heightmap?

`groundHeightAt(seed, x)` is a pure noise function. There is nothing to store and nothing to load. Any x is valid, including very large positive or negative values.

### Why do chunks not have seams?

Chunk props are generated per index, but the ground is sampled continuously from the same function. Ground geometry is not stored per chunk at all; the renderer samples it directly across the visible range. Props are placed at absolute world x, so chunk boundaries are invisible.

### Why are props non-colliding?

The game is about movement and combat on a railway line. Making benches, fences and gravestones solid would require collision resolution, stuck handling and more complex AI pathing. They are scenery, and the player passes behind/in front of them by depth pass.

### Why does the game auto-aim on keyboard/touch?

A twin-stick or mouse aim is not available on a phone, and keyboard-only players have no cursor. Auto-aim at the nearest threat keeps the game playable while mouse users retain precise control. Touch fire explicitly sets `mouseActive = false` to switch modes.

### Why does the reticle match the spread?

Both `attack()` and `drawReticle()` call `weaponSpread()`. The reticle also converts the angular spread to pixels with `tan(spread) * distance`. The crosshair is therefore an honest representation of the cone, not a decorative circle.

### Why do zombies shove the front one forward?

It preserves pursuit speed. See section 7.5. This was a deliberate fix for fast flankers getting stuck behind slow walkers and never reaching a running player.

### Why do waves exist if the map is endless?

Waves give the run a difficulty curve and a rhythm. The map is endless in space; waves escalate in time. Both are needed for a survival loop that does not become either trivial or instantly lethal.

### Is there any persistence?

No. No localStorage, no cookies, no server. The seed is regenerated on every launch and restart. Closing the page loses the run.

### Can the player win?

No. The run ends only in death. The goal is distance, score, kills and multiplier.

### Where does the “haunted village” come from?

`drawHauntedVillage` in `render.ts`. It is a parallax background layer seeded by the run seed, with houses, a chapel, gravestones, fences, dead trees, lit windows, drifting spectral lanterns and fog. It is not part of the playable terrain and does not collide.

### Why are there two `drawMotes` calls?

One is drawn inside the world transform among the scene objects, and one after the foreground layer in screen space. The duplication creates two depth planes of drifting dust around the vignette and foreground silhouettes.

### What is the difference between `time` and `elapsed`?

- `time` — animation clock used for swaying, flicker, breathing, particles, screen shake. It also advances in menu/dead phases.
- `elapsed` — survival time used for waves, spawn difficulty and the HUD clock. It only advances while playing.

### Where is the game loop?

`useGameEngine.ts`, inside the `useEffect`. `engine.update` is called with fixed `1/60` steps; `renderGame` is called once per animation frame.

### Where is the collision code?

- Player vs ground: `updatePlayer` (`groundHeightAt` + snap/glue).
- Zombie vs ground: `updateZombies` (same pattern).
- Bullet vs zombie: `segmentHitsRect` in `updateBullets`.
- Player vs zombie attack: distance + vertical overlap checks in `updateZombies`.
- Pickup vs player: distance check + magnet in `updatePickups`.

There is no tile collision, no wall collision and no prop collision.

### Where is the HUD data produced?

`GameEngine.getHud(muted)` builds a fresh `HudState` object. `useGameEngine` stores it in React state every ~70 ms. Components receive that snapshot; they never read the engine directly.

### Where do the fonts come from?

- DOM: Google Fonts loaded in `index.html` — Press Start 2P and Silkscreen.
- Canvas: a custom 3×5 bitmap font in `render.ts` (`DIGITS` + `drawPixelText`), so canvas text stays pixel-perfect without font loading concerns.

---

*End of document.*
