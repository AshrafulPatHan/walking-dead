# DEADLINE — Endless Rail Survival

A single-player, infinite side-scrolling pixel-art zombie survival game built with **Vite + React 18 + TypeScript + HTML5 Canvas + Tailwind CSS**.

You are the last survivor walking a night railway line. The dead come from both sides. The map never ends, nothing is saved, and every run is a fresh stretch of track.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production bundle in dist/
npm run preview  # serve the production build
```

Requires Node 18+.

## Controls

| Action | Keyboard / mouse |
| --- | --- |
| Move | `A` / `D` or `←` / `→` |
| Jump | `Space` / `W` / `↑` |
| Crouch | `S` / `↓` |
| Fire | Left mouse button (or `F` / `J`) |
| Aim | Mouse |
| Swap weapon | `1` / `2` / `3`, `Q` cycles |
| Weld armor (+25 HP, 40 materials) | `H` |
| Pause / resume | `Esc` / `P` |
| Start / restart | `Enter` |
| Mute | `M` or the speaker button |

On touch devices, on-screen controls appear automatically (left/right/jump/crouch plus fire). Firing without a mouse auto-aims at the nearest zombie.

## Features

- **Procedural infinite world** — deterministic smooth-noise ground plus generated trees, poles, houses, fences, puddles and foreground props. Chunks stream in ahead and are deleted behind the camera.
- **Seeded districts** — each three-chunk region rolls a district (`rail`, `village`, `woods`, `yard`, `outskirts`, `graveyard`) from the run seed, with its own prop mix and occasional landmarks. The opening stretch is jittered per seed too, so no two runs look alike.
- **Roadside dressing** — benches, trash cans, barrels, crates, gravestones, fences and lampposts line the track, and a haunted village with a chapel, lit windows, dead trees and drifting lanterns sits on the horizon.
- **New map every run** — the seed is regenerated on launch and on every restart; no progress or terrain is persisted.
- **Three weapons** — infinite-range metal pipe (melee), pistol (120 rounds, precise), machine gun (500 rounds, rapid, wide spread).
- **True mouse aiming** — projectiles spawn at the barrel tip and travel to the world-space cursor, with spread matching the drawn reticle, a target lock and hit markers.
- **Three zombie types** — walkers, fast runners and tanky brutes with idle → chase → attack → die state machines, plus wave escalation and spawn caps.
- **Two-sided pressure** — spawns alternate flanks regardless of travel direction, and trailing flankers get a short catch-up sprint so running away never makes the horde one-sided.
- **Loot loop** — kills drop building materials, which repair armor at the weld station; occasional ammo and medkit pickups also drop.
- **Score & combo** — consecutive kills build a multiplier and streak; the HUD tracks condition, distance, wave timer, score and materials.
- **Pixel-art presentation** — 480×270 internal canvas upscaled with `image-rendering: pixelated`, moonlit railway palette, parallax layers, particles, glow bullets and screen shake.
- **Synthesized audio** — all SFX are generated with the Web Audio API; no asset downloads.
- **Responsive shell** — Tailwind HUD and overlays, compact layouts for short/mobile viewports, pause/death/menu screens.
- **Robust loop** — `requestAnimationFrame` with a clamped fixed 60 Hz delta step, accumulator and HUD throttling.

## Architecture

```
src/
  game/
    types.ts          Shared interfaces (Player, Zombie, Weapon, TerrainChunk, Particle, HudState…)
    constants.ts      Canvas size, physics, weapon/zombie stats, palette
    rng.ts            Seeded RNG and noise helpers
    world.ts          Infinite ground profile, chunks and scenery generation
    engine.ts         Simulation: player physics, collisions, combat, AI, spawning, waves, loot, camera
    render.ts         Canvas renderer (parallax, terrain, sprites, effects, reticle)
    audio.ts          Web Audio synthesized sound effects
    useGameEngine.ts  rAF loop, input mapping, React HUD state, engine actions
    format.ts         Small display helpers
  components/
    GameCanvas.tsx    Canvas mount plus overlay composition
    UIHUD.tsx         Health, ammo/weapon cards, score, distance, materials
    OverlayScreens.tsx Menu, pause and death overlays
    TouchControls.tsx Coarse-pointer on-screen controls
    Icons.tsx         Pixel-style inline SVG icons
  App.tsx             Page chrome and stage layout
  index.css           Tailwind layers, scanlines, overlays, pixel canvas rules
```

The simulation is unit-independent of rendering: React only receives a throttled HUD snapshot, while the canvas draws every frame directly from the engine. Physics and sprite coordinates live in 480×270 canvas space.

In development only, the live engine is exposed as `window.__deadline` for debugging (spawning zombies, inspecting state). It is stripped from production builds.

## Balance notes

- Waves peak at `min(18, 3 + wave * 2)` zombies; waves advance every 42 seconds.
- The run opens with a short grace period before the first spawns reach you.
- Spawn sides alternate strictly, and a zombie that ended up behind a running survivor sprints briefly (5.6× walk speed, capped) to close the gap instead of being left off-screen.
- Zombies shove the one in front of them forward rather than both backing off, so a fast flanker never gets stuck behind a slow walker.
- Welding costs 40 materials and restores 25 condition.
