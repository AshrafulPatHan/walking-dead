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
   - 3.9 [Settings](#39-settings)
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
   - 7.9 [Wrecked cars, line by line](#79-wrecked-cars-line-by-line)
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
- Broken cars block the line; jump on the roof to turn one into a firing platform the dead cannot climb.
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
| Aim | Mouse | Straight ahead (auto-aim optional) |
| Weapon | `1` / `2` / `3`, `Q` cycles | “Swap gun” |
| Weld armor | `H` | HUD button |
| Pause / resume | `Esc` / `P` | HUD button |
| Start / restart | `Enter` (restart), `R` on death | overlay buttons |
| Mute | `M` or speaker button | HUD button |
| Auto-aim | Settings section (start / pause) | Settings section (start / pause) |

Extra details:

- **Auto-aim is OFF by default on every device.** Enable it in the settings section on the start screen or pause screen. When enabled, keyboard and touch fire track the closest live zombie within 300 px; when disabled, they fire straight ahead in the direction you face.
- As soon as you move the physical mouse, true mouse aiming takes over and always overrides auto-aim.
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

**Wrecked cars** are the one exception to decorative scenery. A seed roll can drop a broken car in the middle of the line:

- roughly one chunk in three (`CAR_CHANCE = 0.34`), and a 62% chance in the opening chunk,
- only where the ground is flat enough for the body to sit flush,
- never close enough to the spawn point to trap the player at the start.

The car is solid at ground level: you cannot walk through it, and neither can the dead. The only way past is to **jump onto the roof** (`CAR_H = 30` px tall, comfortably under the jump apex). Zombies cannot climb, cannot cross the wreck and cannot land melee hits on a survivor standing on the roof, which makes a car a perfect firing platform — a short toast explains this the first time you land on one.

Everything else is **purely visual**: benches, fences, gravestones and the rest do not collide. Only the ground and the wrecked cars are solid. Section [7.9](#79-wrecked-cars-line-by-line) explains the implementation step by step.

### 3.9 Settings

The start screen and the pause screen both include a **Settings** panel. It currently holds one option:

- **Auto-aim** — `OFF` by default on every device, including phones. Use the `OFF` / `ON` segments to change it.
  - `ON`: keyboard and touch fire lock onto the closest live zombie within 300 px, aiming at its torso.
  - `OFF`: keyboard and touch fire go straight ahead in the direction the survivor faces.
  - Mouse aim always takes priority over both, so the setting never affects a player who is using the pointer.
  - The choice survives restarts and returning to the menu, but it is **session only** — nothing is written to storage, matching the game's no-save rule.

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
| `PropKind` | All 16 scenery types (`car` is the only solid one) |
| `PropDepth` | `back \| mid \| front` |
| `Prop` | Kind, depth, absolute x, seed, scale, variant |
| `CarObstacle` | Solid wreck box: center x, body half-width and roof y. Built by the engine from `car` props |
| `TerrainChunk` | Index, start x, props, district |
| `Toast` | Centered HUD message with tone and lifetime |
| `InputState` | Held directions, fire, logical aim point, mouse-active flag |
| `WeaponHud` | Weapon card data: id, name, ammo, active, slot, kind |
| `HudState` | Complete React-facing snapshot: phase, seed, health, weapons, materials, score, kills, distance, time, wave, streak, multiplier, weld availability, mute, auto-aim flag, toast |

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
| `PLAYER_W` | 12 | Player width used by attack reach and car clearance |
| `PIPE_RANGE` | 34 | Base melee reach |
| `MAX_PARTICLES` | 260 | Hard particle cap |

#### Wrecked cars

| Constant | Value | Meaning |
| --- | --- | --- |
| `CAR_W` | 44 | Body width in px (before per-car scale jitter) |
| `CAR_H` | 30 | Roof height above the ground |
| `CAR_CHANCE` | 0.34 | Chance that a later chunk rolls a car |

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

**Wrecked cars**

After the district mix, every chunk rolls for one solid wreck:

```ts
const carMin = startX + (index === 0 ? 330 : 46)
const carMax = startX + CHUNK_W - 80
if (carMax > carMin && rand() < (index === 0 ? 0.62 : CAR_CHANCE)) { … }
```

- Chunk 0 keeps its car at least 130 px ahead of the player spawn (x = 200), so a run never opens with the player boxed in.
- Later chunks can place one anywhere from 46 px to `CHUNK_W - 80` px into the chunk.
- The x is picked first, then the ground height is sampled at both body edges; if they differ by more than **7 px**, the car is skipped. A wreck never floats over a slope.
- Scale jitter is `0.94–1.12`; the collision box uses the same scale.

The prop is stored with depth `mid` and the `car` kind. `render.ts` draws it, and `engine.rebuildCars()` turns it into a `CarObstacle` for the physics pass.

**Sorting**

All props are sorted by:

```ts
PROP_ORDER[kind] - PROP_ORDER[otherKind] || x
```

The order is: carriage, waterTower, car, house, gravestone, deadTree, pine, bench, fence, trashCan, barrel, crate, sign, lamp, bush, rock.

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
- `cars: CarObstacle[]` — solid wrecks rebuilt from the loaded chunks

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
- `autoAim` — the opt-in keyboard/touch aim assist (default `false`)

Private bookkeeping:

- `toastId`, `zombieId`, `pickupId`
- `lastHitSound` (throttles hit SFX to ~35 ms)
- `aimAngle` (sticky mouse angle)
- `nextSpawnSide` (strict alternation)
- `sawCarHint` (one-time wreck-roof toast)

#### Lifecycle methods

| Method | Behaviour |
| --- | --- |
| `constructor()` | Calls `reset('menu', newSeed())` |
| `reset(phase, seed)` | Rebuilds player, clears all arrays (including `cars`), sets camera, stats, timers, aim, chunks |
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
- Mouse mode always wins, regardless of the auto-aim setting.

**Keyboard / touch mode** (`input.mouseActive === false`)

- If `autoAim` is enabled:
  - find the nearest live zombie to the pivot, measured to torso centre, within 300 px,
  - if found, aim at its torso and set `aimTargetId`,
  - if none, fall through to straight-ahead aim.
- If `autoAim` is disabled (the default):
  - no target search happens,
  - `aimTargetId` stays `null`,
  - aim straight ahead 260 px: `aimWorldX = pivot.x + facing * 260`, `aimWorldY = pivot.y`, angle `0` or `π`.
- `engine.setAutoAim(enabled)` / `toggleAutoAim()` flips the flag; turning it off clears any target lock immediately. The flag is not touched by `reset()`, so it survives restarts.

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
- `supportHeight(x, prevFeet)` returns the higher of the terrain and any wreck roof under the player:
  - the terrain from `groundHeightAt(seed, x)`,
  - a car roof only when the player's x is inside the body **and** the feet started the frame at or above the roof (`prevFeet <= top + 0.5`). Landing from below therefore never teleports the player onto the car.
- If feet are at/below the support height: snap, zero `vy`, grounded, landing dust if the fall was fast.
  - Landing on a roof also plays `sound.thud()`, kicks up dust and, the first time in a run, shows the “they cannot climb” toast.
- **Slope glue:** if the player was grounded, is moving downward, and the support is less than 7 px below, snap down. This prevents micro-hopping down gentle slopes.
- Otherwise airborne.

Horizontal collision with wrecks, after the vertical step:

- `resolvePlayerCars(prevX)` ignores any car whose roof is at or above the player's feet — standing on it is allowed.
- Below the roof, if the player's body edge overlaps the wreck, they are pushed back to the side they came from (`prevX`), so sliding into a car never pops them through it.

The roof is 30 px above the street while the jump apex is about 49 px (`318² / (2 × 1020)`), so climbing up is deliberate but comfortable.

Animation and combat:

- Walk phase advances faster while moving/crouching or airborne.
- Fire is attempted whenever `input.fire` is held and cooldown is 0.
- While hurt and grounded, horizontal velocity is damped hard for a moment.

There is **no x clamp**, so the player can walk forever in either direction. The only horizontal collision is against wrecked cars.

#### Car collision helpers

| Method | Behaviour |
| --- | --- |
| `supportHeight(x, prevFeet)` | Returns `{ height, car }` for the highest valid surface: terrain, or a wreck roof when the feet came from above it |
| `resolvePlayerCars(prevX)` | Pushes the player out of a wreck body horizontally; skipped when their feet are on/above the roof |
| `playerOnCar()` | True when the player's x is over a wreck and `\|y - top\| ≤ 1.5` |
| `resolveZombieCars(z, prevX)` | Same horizontal push for zombies; also zeroes their `vx` |
| `pushZombiesOutOfCars()` | Runs after the crowd-separation pass so a shove cannot bury a zombie inside a wreck |
| `rebuildCars()` | Rebuilds `this.cars` from every loaded chunk's `car` props using `CAR_W`/`CAR_H` and the prop scale |

`rebuildCars()` is called from `ensureChunks()` / `refreshChunks()` whenever the chunk set changes, so the solid list always matches what is on screen. Because the collision box and the sprite are derived from the same constants, they cannot drift apart.

Section [7.9](#79-wrecked-cars-line-by-line) walks through the whole feature end to end, including the exact update order and the sign pitfall that world-space y creates.

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
     - `reachable = !playerOnCar()` — the dead cannot hit a survivor on a wreck roof,
     - damage the player or kick up a miss particle,
   - after **0.85 s total**, return to chase and store a 0.45 s cooldown value (the attack-state duration is the actual pacing gate).
7. Physics: apply gravity, move, `resolveZombieCars` (blocked by wrecks), sample ground, snap/airborne.
8. Off-screen culling: more than 820 px outside the camera bounds → `hp = -999`.

After the loop:

- Run the separation pass (see 7.5).
- `pushZombiesOutOfCars()` guarantees the crowd shove never leaves a zombie inside a wreck.
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
- `drawCar` — wrecked coupe/sedan built from the same `CAR_W` × `CAR_H` box the engine collides with:
  - four loose paint variants,
  - wheels (one torn off on some variants), lower body, cabin and roof highlight,
  - two dark window openings with a starred windshield,
  - door seam, handle, loose bumpers and a dead headlight/tail light.
  - Drawn at `baseY` (not `baseY + 2`), because its feet are the collision line.
- `drawGravestone` — rounded or slab marker, cross/chip details, grass at the base.

Only the wrecked car is solid; every other prop is decorative and never affects collision.

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
- `setAutoAim(enabled)` / `toggleAutoAim()` call the matching engine method and sync, so the settings section updates instantly.
- `setVirtual(control, pressed)`:
  - unlocks audio on press,
  - writes directly into `engine.input[control]`,
  - pressing fire via touch sets `mouseActive = false`, which puts aiming into keyboard/touch mode. That mode uses auto-aim only when the setting is ON; otherwise it fires straight ahead.

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
| `thud()` | lowpass noise 420→110 + sine 92→44 | Landing on a wreck roof |
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
- `SettingsSection`
  - the small settings panel shared by the start and pause screens,
  - an `Auto-aim` row with `OFF` / `ON` segmented buttons (`aria-pressed`),
  - reads `hud.autoAim` and calls `actions.setAutoAim`,
  - notes that the choice is session-only.
- `StartScreen`
  - left-side gradient over the live menu scene,
  - title, tagline, tags,
  - controls,
  - settings,
  - “START RUN” button (Enter),
  - “fresh terrain every run” note and audio toggle.
- `PauseScreen`
  - seed display,
  - distance / kills / score summary,
  - compact controls,
  - settings,
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
  - right cluster: “Swap gun”, large FIRE button, `Auto aim on/off` hint.
- `.touch-only` hides the whole component unless the device reports a coarse pointer.
- Holding fire is intentional for the machine gun.
- Touch fire disables mouse aim, so aiming follows the `autoAim` setting: nearest zombie when ON, straight ahead when OFF.

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
- Only zombies are tested; bullets pass through scenery and wrecks, so a roof shot can hit a zombie standing on the far side of the car.

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

Surfaces:

- The ground curve plus the roofs of wrecked cars.
- Roof support only applies when the feet start the frame above it, so you have to jump up; you cannot clip through the side.
- Away from cars there is no horizontal collision and no x boundary; the player can walk forever in either direction.

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

Wrecked cars break the pursuit: a zombie walking into one is pushed back out of the body, keeps pressing against the side, and can never climb. Even if its reach overlaps the player standing on the roof, the `reachable` gate in the attack state stops the strike, so the horde piles up helplessly at street level.

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

After the pass, `pushZombiesOutOfCars()` re-checks every zombie against the wreck list. A crowd can shove a queue forward hard enough to put the front zombie inside a car body, so the final clamp guarantees the pile stays outside and the player on the roof stays unreachable.

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

### 7.9 Wrecked cars, line by line

This is the one prop in the game that is not scenery. The whole feature in one sentence:

> A seeded `Prop` becomes a `CarObstacle` box; the box's top is ground the player can only land on from above, its sides are a wall for everyone, and zombies never ask for the top at all.

Five small pieces cooperate:

| Layer | File | Job |
| --- | --- | --- |
| Tuning | `constants.ts` | `CAR_W`, `CAR_H`, `CAR_CHANCE` |
| Data | `types.ts` | `'car'` in `PropKind`, plus `CarObstacle` |
| Placement | `world.generateChunk` | Seeded x, scale, variant, flat-ground check |
| Simulation | `engine.ts` | Build the solid list, support the player on the roof, block player and zombies |
| Presentation | `render.drawCar` | Draw the box the engine collides with |

Data flows one way:

```
seed + chunk index
        │
        ▼
generateChunk() ──▶ Prop { kind: 'car', x, seed, scale, variant, depth: 'mid' }
        │
        ▼
rebuildCars()   ──▶ CarObstacle { x, halfW, top }
        │
        ├──▶ updatePlayer()  ──▶ supportHeight() + resolvePlayerCars()
        ├──▶ updateZombies() ──▶ resolveZombieCars() + playerOnCar()
        └──▶ renderGame()    ──▶ drawCar()
```

The important idea: **the prop is only data**. Chunks can be deleted at any time, so physics never reads props directly. It reads `engine.cars`, a flat list rebuilt whenever the chunk set changes.

#### Coordinates: y grows downward

Every number below is easier to follow if you remember the screen convention:

```
y = 148.0   top of the survivor's head while standing on a roof
y = 178.8   car roof (car.top)                   ← smaller y = higher up
y = 211.8   street (groundHeightAt)
```

So a roof that is *above* the ground has a **smaller** y than the ground. This one fact explains the `top < height` comparison in `supportHeight()` and the `prevFeet <= top` guard. Getting the inequality backwards was the original bug: the roof became unreachable and the player fell through the car.

#### The constants

```ts
// constants.ts
export const CAR_W = 44          // body width in px, before per-car scale
export const CAR_H = 30          // roof height above the ground
export const CAR_CHANCE = 0.34   // roll for a car in a later chunk
```

- `CAR_W` is the **full** width. `CarObstacle.halfW = (CAR_W * scale) / 2`.
- `CAR_H` is subtracted from the ground: `top = ground - CAR_H * scale`.
- Both the engine and the renderer read these constants, so there is no second set of magic numbers to keep in sync.
- The jump apex is `|PLAYER_JUMP|² / (2 * GRAVITY) = 318² / 2040 ≈ 49.6` px, comfortably above the 30 px roof. That is the balance relationship to preserve if you touch either value.

#### The data model

```ts
// types.ts
export type PropKind = … | 'car'

export interface CarObstacle {
  x: number       // center of the car
  halfW: number   // half the body width
  top: number     // world y of the roof (smaller y = higher)
}
```

`Prop` stays the world/rendering record (kind, depth, x, seed, scale, variant). `CarObstacle` is the physics record: only the three numbers collision needs. Keeping them separate means a wreck can be a `mid`-depth sprite and still have a crisp, tiny collision shape.

#### Placement: `generateChunk`

After the district scenery, every chunk gets one car roll:

```ts
const carMin = startX + (index === 0 ? 330 : 46)
const carMax = startX + CHUNK_W - 80
if (carMax > carMin && rand() < (index === 0 ? 0.62 : CAR_CHANCE)) {
  const cx = carMin + rand() * (carMax - carMin)
  const scale = 0.94 + rand() * 0.18
  const halfW = (CAR_W * scale) / 2
  const left = groundHeightAt(seed, cx - halfW)
  const right = groundHeightAt(seed, cx + halfW)
  if (Math.abs(left - right) <= 7) {
    add('car', cx, 'mid', Math.floor(rand() * 3), scale)
  }
}
```

Read it in order:

1. **Range.** Later chunks place cars between 46 px and 400 px into the chunk. Chunk 0 starts at 330 so the wreck is at least ~105 px ahead of the player spawn at x = 200 — close enough to meet immediately, far enough that the opening screen is never a trap.
2. **Chance.** Opening chunk: 62%, so most first screens show the mechanic. Later chunks: 34%.
3. **Scale jitter.** 0.94–1.12 keeps wrecks from looking stamped from one sprite.
4. **Flat-ground check.** The ground is sampled under both body edges. If it changes by more than 7 px across the car, the car is skipped for this chunk. That is why a wreck never floats over a slope and why the roof always clears the terrain (30 px of height versus at most 7 px of rise).
5. **Prop.** Depth `mid` so it sorts with scenery; the engine ignores depth entirely.

There is a determinism detail worth knowing: the rolls are consumed in a fixed order — chance, x, scale, variant, then `add()`'s internal prop seed. Change that order and every later prop in the same chunk changes too.

#### Building the solid list: `rebuildCars`

```ts
private rebuildCars(): void {
  this.cars = []
  for (const chunk of this.chunks.values()) {
    for (const prop of chunk.props) {
      if (prop.kind !== 'car') continue
      const base = groundHeightAt(this.seed, prop.x)
      this.cars.push({
        x: prop.x,
        halfW: (CAR_W * prop.scale) / 2,
        top: base - CAR_H * prop.scale,
      })
    }
  }
}
```

- Called from `ensureChunks()` and `refreshChunks()` whenever a chunk is added or removed, so `cars` always mirrors the loaded chunks.
- `top` is derived, never stored in the chunk. That keeps the seed the single source of truth.
- Rects are unrounded here; the renderer rounds to whole pixels. The half-pixel difference is invisible and never breaks collision.
- `this.cars` is public mostly for debugging: `__deadline.cars` shows exactly what the physics sees.

#### Player vertical support: `supportHeight`

This function answers one question: *given that the player is at x and started the frame at `prevFeet`, what is the highest surface they may land on?*

```ts
private supportHeight(x: number, prevFeet: number) {
  let height = groundHeightAt(this.seed, x)
  let car: CarObstacle | null = null
  for (const wreck of this.cars) {
    if (x <= wreck.x - wreck.halfW || x >= wreck.x + wreck.halfW) continue
    if (prevFeet > wreck.top + 0.5) continue
    if (wreck.top < height) {
      height = wreck.top
      car = wreck
    }
  }
  return { height, car }
}
```

Three checks, each with a purpose:

1. **Horizontal test uses the player's centre.** If the feet are horizontally over the body, the roof is a candidate. The player's 12 px width is deliberately not included: the edge zone is handled by the horizontal resolver, which makes walking off feel natural rather than snagging on a 6 px lip.
2. **The one-way guard.** `prevFeet > wreck.top + 0.5` means "the feet started this frame *below* the roof" (y is down). Such a player must not be lifted onto the roof. This is what makes the roof reachable **only by jumping**. Without it, simply walking into the car at street level would satisfy `p.y >= top` and teleport the player up. The `0.5` is a tolerance for float noise.
3. **Highest surface wins.** `wreck.top < height` compares against the terrain: a smaller y is higher. If the roof is above the street, it becomes the support and is returned as `car` (the caller needs to know it was a car for the landing effects).

`updatePlayer` calls it *after* integrating velocity, using `prevY` captured *before* the integration:

```ts
const wasGrounded = p.onGround
const prevX = p.x
const prevY = p.y
p.x += p.vx * dt
p.vy += GRAVITY * dt
p.y += p.vy * dt

const support = this.supportHeight(p.x, prevY)
if (p.y >= support.height) {          // crossed the surface this frame
  p.y = support.height
  p.vy = 0
  p.onGround = true
} else if (wasGrounded && p.vy >= 0 && support.height - p.y < 7) {
  // slope glue, unchanged from the terrain code
} else {
  p.onGround = false
}
```

Because the check is "was the player above the surface *before* this frame", a fall from any height catches the roof without tunnelling, even at low frame rates.

#### Player horizontal blocking: `resolvePlayerCars`

Vertical support decides the y. Horizontal blocking decides the x. They run in that order, every frame:

```ts
// …vertical step above…
this.resolvePlayerCars(prevX)
```

```ts
private resolvePlayerCars(prevX: number): void {
  const p = this.player
  const half = p.w * 0.5
  for (const wreck of this.cars) {
    if (p.y <= wreck.top + 0.5) continue                 // feet at/above roof
    if (p.x + half <= wreck.x - wreck.halfW ||
        p.x - half >= wreck.x + wreck.halfW) continue    // no body overlap
    p.x =
      prevX <= wreck.x - wreck.halfW
        ? wreck.x - wreck.halfW - half                   // push back left
        : wreck.x + wreck.halfW + half                   // push back right
  }
}
```

- **Skip if on top.** `p.y <= top + 0.5` means the feet cleared the roof; a player standing on the car must not be pushed sideways.
- **Body vs body.** The player is a 12 px-wide box centred on `x`; the car is `2 * halfW` wide. Only overlap triggers a push.
- **Side from `prevX`.** The side is chosen from the *previous* centre, not the current one. If the player is moving fast or dt spikes, this restores the side they actually came from instead of guessing and potentially popping them through to the far side.
- **Vertical first matters.** If horizontal ran first, a player descending onto the roof would be pushed out before `supportHeight` could catch them. Doing vertical first sets `p.y = top`, so the horizontal pass then skips them. This exact ordering is what makes "jump onto the roof" reliable.

#### Landing feedback

The vertical step also handles the feel of the landing:

```ts
if (support.car && !wasGrounded) {
  // dust puff
  sound.thud()
}
…
if (support.car && !this.sawCarHint) {
  this.sawCarHint = true
  this.setToast('WRECKED CAR · THEY CANNOT CLIMB UP HERE', 'good')
}
```

- `wasGrounded` is `onGround` from *before* physics, so this only fires on a real touchdown, not on every frame of standing.
- `sawCarHint` is a per-run flag reset in `reset()`, so the tutorial toast appears once, not on every wreck.
- The sound is `SoundKit.thud()`: a low-pass noise sweep plus a falling sine. No asset.

#### Zombies: blocked, never supported

Zombies deliberately do **not** call `supportHeight`. There is no jump, no climb, no roof query — only the side resolver:

```ts
private resolveZombieCars(z: Zombie, prevX: number): void {
  const half = z.w * 0.5
  for (const wreck of this.cars) {
    if (z.y <= wreck.top + 0.5) continue
    if (z.x + half <= wreck.x - wreck.halfW ||
        z.x - half >= wreck.x + wreck.halfW) continue
    z.x =
      prevX <= wreck.x - wreck.halfW
        ? wreck.x - wreck.halfW - half
        : wreck.x + wreck.halfW + half
    z.vx = 0
  }
}
```

It is the player resolver with two differences:

- it uses the zombie's width (`z.w`), which varies by type,
- it zeroes `vx` so the AI does not keep accelerating into the wall and jitter against it. They lean on the car instead.

The crowd pass can still shove the front zombie forward, so after separation the engine runs one more clamp:

```ts
private pushZombiesOutOfCars(): void {
  for (const z of this.zombies) {
    if (z.state === 'die') continue
    const half = z.w * 0.5
    for (const wreck of this.cars) {
      if (z.y <= wreck.top + 0.5) continue
      if (z.x + half <= wreck.x - wreck.halfW ||
          z.x - half >= wreck.x + wreck.halfW) continue
      z.x = z.x < wreck.x
        ? wreck.x - wreck.halfW - half
        : wreck.x + wreck.halfW + half
    }
  }
}
```

This pass does not care about `prevX`: it just guarantees nobody ends the frame inside a body. That invariant is what keeps the pile *outside* the car.

The final piece is the melee gate. `playerOnCar()` is a cheap geometric query:

```ts
private playerOnCar(): boolean {
  const p = this.player
  for (const wreck of this.cars) {
    if (p.x <= wreck.x - wreck.halfW || p.x >= wreck.x + wreck.halfW) continue
    if (Math.abs(p.y - wreck.top) <= 1.5) return true
  }
  return false
}
```

and the attack state consults it once per strike:

```ts
const reachable = !this.playerOnCar()
if (Math.abs(p.x - z.x) < reach && verticalOk && reachable) {
  this.damagePlayer(z.damage, z.x)
}
```

The 1.5 px tolerance absorbs the tiny float drift around `top`. This is the second safety net: even if a brute's 22 px reach overlaps the roof near an edge, the strike is refused. The wind-up animation still plays and the miss particles still spawn, so the horde visibly swipes at the car.

#### Rendering: `drawCar`

`drawCar` takes the exact same constants:

```ts
const w = Math.round(CAR_W * scale)
const h = Math.round(CAR_H * scale)
const half = Math.round(w / 2)
```

and draws wheels, lower body, cabin, windows, bumpers, lights and hash-seeded rust blooms inside that `w × h` box. Two deliberate choices:

- **Drawn at `baseY`, not `baseY + 2`.** Most props are nudged 2 px into the ground so they look planted. The car's base *is* its collision line, so it sits exactly on `groundHeightAt`.
- **Depth `mid`.** It is drawn with the mid scenery, before the ground and before every character. That produces the right layering for free: the survivor and zombies are drawn after the car, so they stand in front of it at street level, and the survivor appears on top when standing on the roof. A `front` depth would paint the car over the player; a `back` depth would let lamps and fences paint over the car.

Because the sprite and the box both come from `CAR_W`/`CAR_H`/`scale`, resizing the car is a one-line change that updates art and physics together.

#### Bullets pass through

`updateBullets` only tests zombies. Cars are **not** bullet blockers. That is intentional:

- the player can shoot down at zombies on the far side of the wreck,
- the roof works as cover from melee, not as cover from gunfire,
- it avoids the awkward case of a roof shot colliding with the car the player is standing on.

#### Worked example: a real jump

Using seed 6 from the regression test:

```
car.x    = 381.05
car.halfW = 23.99      → left edge 357.06, right edge 405.04
car.top  = 178.78
street   ≈ 211.8
player half-width = 6
```

Walking in from the left, the player stops at:

```
381.05 - 23.99 - 6 = 351.06
```

which is exactly what both the headless test and the live build reported. Jumping from 10 px outside the left edge, holding jump for 200 ms and then holding right, produced these samples (about 80 ms apart):

| sample | player x | player y | state |
| --- | --- | --- | --- |
| 1 | 350.1 | 165.4 | rising, above the roof |
| 2 | 357.7 | 167.5 | over the front bumper |
| 3 | 366.4 | 176.8 | descending toward the roof |
| 4 | 373.3 | 178.8 | **landed on the roof** |
| 5–7 | 382–399.3 | 178.8 | walking on the roof |
| 8 | 411.0 | 179.6 | past the right edge, now falling |
| 11 | 437.0 | 210.2 | back on the street |

The jump clears the roof because the apex is ~49.6 px. Solving the jump equation puts the descending feet back at `top` about 0.49 s after take-off, by which time the horizontal input has carried the player over the body. The roof only becomes a support while the feet are above it, so the descent lands cleanly instead of being pushed aside.

#### Edge cases and invariants

- **No starting trap.** Chunk 0's car can never be within ~100 px of the spawn.
- **No floating wrecks.** Placement requires ≤ 7 px height difference across the body, and the roof is 30 px up, so terrain never pokes through it.
- **No tunnelling.** Support is resolved from the previous frame's feet, not a post-move guess.
- **One-way roof.** Only a player whose feet were above the roof can land on it. You cannot climb the side and cannot be "sucked up" while walking.
- **Standing is stable.** `resolvePlayerCars` skips anyone at/above roof height, so the top is never treated as a wall.
- **Teleports are safe.** Drop the player inside a car from the console and the next frame's horizontal pass pushes them out.
- **Streaming is safe.** Deleting the chunk deletes the `CarObstacle` on the next rebuild; nothing references the old world region.
- **No soft locks.** There is no x boundary and the roof is always jumpable, so a car can never permanently trap the player: they either climb it or walk back the way they came.
- **No skipping the climb.** Because the body blocks at street level, the roof is the only way past a wreck. That is the whole point of the prop.

#### Tuning and debugging

| Goal | Change |
| --- | --- |
| More / fewer wrecks | `CAR_CHANCE`; the opening-chunk 0.62 is in `world.generateChunk` |
| Wider / narrower car | `CAR_W` (collision and sprite together) |
| Easier / harder to climb | `CAR_H` (lower = easier). Keep it below the ~49.6 px jump apex |
| Different placement window | `carMin` / `carMax` in `generateChunk` |
| Different flatness tolerance | the `7` in `Math.abs(left - right) <= 7` |
| Roof feel | the `0.5`, `1.5` and `7` tolerances in `supportHeight`, `resolvePlayerCars` and the slope glue |

Live debugging (dev server only):

```js
const e = window.__deadline
e.reset('playing', 6)        // seed 6 has a chunk-0 car
e.cars                       // [{ x, halfW, top }] the physics list
e.player.x = e.cars[0].x - e.cars[0].halfW - 10
e.player.y = 211             // street level
e.input.right = true         // walk into it and watch x stop
```

To test the roof directly, set `e.player.y = e.cars[0].top` and `e.player.onGround = true`, then spawn a few zombies and check `e.player.hp` — it must not move while `playerOnCar()` is true.

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
| Wrecked car frequency / size | `CAR_CHANCE`, `CAR_W`, `CAR_H` and the car block in `generateChunk` | Collision and sprite both read these constants |
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

Props are non-colliding, so no physics changes are needed — unless the new prop should be solid. For that, follow the `car` path: add a `CarObstacle`-style entry, rebuild it from the chunk props (see `engine.rebuildCars`), and resolve player/zombie overlap in `updatePlayer` and `updateZombies`.

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
- **The reticle only draws while `phase === 'playing'` and `mouseActive === true`.** Keyboard/touch players aim straight ahead (or at a locked target when auto-aim is enabled) and see no mouse reticle.
- **Auto-aim is off by default.** It is opt-in via the settings section on the start and pause screens; nothing is persisted, so every fresh page load starts with it off again.
- **Bullets are culled 80 px outside the camera.** Off-screen shots are not simulated for long.
- **HUD updates every ~70 ms, not every frame.** A value may lag the simulation slightly in React.
- **Distance is in metres, not pixels.** `HudState.distance = maxProgress / 8`.
- **The displayed seed is only the last six hex digits.** The engine still holds the full 32-bit seed.
- **Terrain is deterministic per seed; combat is not.** Two runs with the same seed share terrain but not zombie rolls.
- **Props do not collide**, with one exception: wrecked cars are solid.
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
- Walk into a wrecked car: you stop at the body; jump onto the roof, then shoot the zombies crowding below.
- Start screen shows the Settings panel with Auto-aim set to OFF; start a run, press F near a zombie, and check the shot goes straight ahead.
- Pause, flip Auto-aim to ON, resume, and fire near a zombie: the shot should track it. Turn it back to OFF and confirm it stops tracking.
- Move the mouse mid-run: cursor aim takes over even with Auto-aim ON.
- On a touch device the FIRE button hint reads `Auto aim off` until it is enabled.
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

The game is about movement and combat on a railway line. Making every bench, fence and gravestone solid would require collision resolution, stuck handling and more complex AI pathing. They are scenery, and the player passes behind/in front of them by depth pass.

The wrecked cars are the deliberate exception: they are large enough to read as cover, they change how a fight plays out, and they are the only props with a real collision volume. Everything about them is derived from `CAR_W`/`CAR_H`, so the sprite and the solid box stay in sync.

### Why can't zombies climb the car?

Because a car is a wall with a roof, and the game only ever grants roof support when the feet came from above. Zombies have no jump at all; their side collision simply pushes them back out of the body. That makes a roof a safe firing platform by design: the player must jump up, and the dead can only crowd underneath. The `reachable` check in the attack state also prevents a lucky arm swing from hitting someone standing on top.

### Why is auto-aim off by default?

Because it is a preference, not a requirement. Keyboard-only and touch players *can* use it — there is no cursor on a phone — but locking onto a target changes how the game feels and removes the need to line up a shot. Rather than decide that for the player, the game ships with it **OFF** on every device and exposes a single `OFF` / `ON` switch in the settings section.

When it is ON, keyboard and touch fire lock onto the nearest live zombie within 300 px, which keeps the game playable on a phone. When it is OFF, fire goes straight ahead in the direction the survivor faces, so movement and facing do the aiming. Mouse aim is unaffected either way: it always overrides the setting.

### Why is the setting session-only?

The game deliberately has no save file: every run starts from a fresh seed. Persisting one accessibility toggle would be odd in that design, so the flag lives in `engine.autoAim` and seeds its HUD value from `false` on every page load. It does survive restarts and returns to the menu within the session, because `reset()` does not touch it.

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

- Player vs ground and wreck roofs: `supportHeight` inside `updatePlayer` (`groundHeightAt` + snap/glue).
- Player vs wreck body: `resolvePlayerCars` inside `updatePlayer`.
- Zombie vs ground: `updateZombies` (same pattern).
- Zombie vs wreck body: `resolveZombieCars` + `pushZombiesOutOfCars` in `updateZombies`.
- Bullet vs zombie: `segmentHitsRect` in `updateBullets`.
- Player vs zombie attack: distance + vertical overlap checks in `updateZombies` (skipped when the player is on a roof).
- Pickup vs player: distance check + magnet in `updatePickups`.

There is no tile collision and no wall collision. The only solid objects are the ground curve and the wrecked cars.

### Where is the HUD data produced?

`GameEngine.getHud(muted)` builds a fresh `HudState` object. `useGameEngine` stores it in React state every ~70 ms. Components receive that snapshot; they never read the engine directly.

### Where do the fonts come from?

- DOM: Google Fonts loaded in `index.html` — Press Start 2P and Silkscreen.
- Canvas: a custom 3×5 bitmap font in `render.ts` (`DIGITS` + `drawPixelText`), so canvas text stays pixel-perfect without font loading concerns.

---

*End of document.*
