import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { sound } from './audio'
import { VIEW_H, VIEW_W, WEAPONS } from './constants'
import { GameEngine } from './engine'
import { renderGame } from './render'
import type { HudState, WeaponId } from './types'

export type VirtualControl = 'left' | 'right' | 'jump' | 'crouch' | 'fire'

export interface GameActions {
  start: () => void
  restart: () => void
  pause: () => void
  resume: () => void
  togglePause: () => void
  toMenu: () => void
  selectWeapon: (id: WeaponId) => void
  cycleWeapon: () => void
  weld: () => void
  toggleMute: () => void
  setVirtual: (control: VirtualControl, pressed: boolean) => void
}

export interface UseGameEngineResult {
  hud: HudState
  actions: GameActions
}

export function useGameEngine(canvasRef: React.RefObject<HTMLCanvasElement>): UseGameEngineResult {
  const engineRef = useRef<GameEngine | null>(null)
  if (!engineRef.current) engineRef.current = new GameEngine()
  const engine = engineRef.current

  const [hud, setHud] = useState<HudState>(() => engine.getHud(sound.muted))

  const sync = useCallback(() => {
    setHud(engine.getHud(sound.muted))
  }, [engine])

  const toggleMute = useCallback(() => {
    sound.unlock()
    sound.setMuted(!sound.muted)
    setHud(engine.getHud(sound.muted))
  }, [engine])

  const actions = useMemo<GameActions>(
    () => ({
      start: () => {
        sound.unlock()
        engine.startRun()
        sync()
      },
      restart: () => {
        sound.unlock()
        engine.startRun()
        sync()
      },
      pause: () => {
        engine.pause()
        sync()
      },
      resume: () => {
        engine.resume()
        sync()
      },
      togglePause: () => {
        if (engine.phase === 'playing') engine.pause()
        else if (engine.phase === 'paused') engine.resume()
        sync()
      },
      toMenu: () => {
        engine.toMenu()
        sync()
      },
      selectWeapon: (id: WeaponId) => {
        engine.selectWeapon(id)
        sync()
      },
      cycleWeapon: () => {
        engine.cycleWeapon(1)
        sync()
      },
      weld: () => {
        engine.weld()
        sync()
      },
      toggleMute,
      setVirtual: (control, pressed) => {
        if (pressed) sound.unlock()
        engine.input[control] = pressed
        if (control === 'fire' && pressed) {
          engine.input.mouseActive = false
        }
      },
    }),
    [engine, sync, toggleMute],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    let reducedMotion = media.matches
    const onMotionChange = () => {
      reducedMotion = media.matches
    }
    media.addEventListener('change', onMotionChange)

    let raf = 0
    let last = performance.now()
    let accumulator = 0
    let hudAccumulator = 0
    const STEP = 1 / 60

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const raw = Math.min(0.1, Math.max(0, (now - last) / 1000))
      last = now
      accumulator += raw
      let steps = 0
      while (accumulator >= STEP && steps < 5) {
        engine.update(STEP)
        accumulator -= STEP
        steps += 1
      }
      if (steps === 5) accumulator = 0

      renderGame(ctx, engine, reducedMotion)

      hudAccumulator += raw
      if (hudAccumulator >= 0.07) {
        hudAccumulator = 0
        setHud(engine.getHud(sound.muted))
      }
    }
    raf = requestAnimationFrame(loop)

    let keyFire = false
    let pointerFire = false
    const refreshFire = () => {
      engine.input.fire = keyFire || pointerFire
    }

    const toLogical = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      return {
        x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * VIEW_W,
        y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * VIEW_H,
      }
    }

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      const point = toLogical(event)
      engine.input.aimX = point.x
      engine.input.aimY = point.y
      engine.input.mouseActive = true
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      event.preventDefault()
      if (event.pointerType === 'mouse') {
        const point = toLogical(event)
        engine.input.aimX = point.x
        engine.input.aimY = point.y
        engine.input.mouseActive = true
      }
      pointerFire = true
      refreshFire()
      sound.unlock()
    }

    const onPointerUp = () => {
      pointerFire = false
      refreshFire()
    }

    const onPointerLeave = () => {
      pointerFire = false
      refreshFire()
    }

    const onContextMenu = (event: MouseEvent) => event.preventDefault()

    const onKeyDown = (event: KeyboardEvent) => {
      const code = event.code
      if (
        code === 'Space' ||
        code === 'ArrowUp' ||
        code === 'ArrowDown' ||
        code === 'ArrowLeft' ||
        code === 'ArrowRight'
      ) {
        event.preventDefault()
      }
      if (event.repeat) return

      switch (code) {
        case 'KeyA':
        case 'ArrowLeft':
          engine.input.left = true
          break
        case 'KeyD':
        case 'ArrowRight':
          engine.input.right = true
          break
        case 'KeyW':
        case 'ArrowUp':
        case 'Space':
          engine.input.jump = true
          break
        case 'KeyS':
        case 'ArrowDown':
          engine.input.crouch = true
          break
        case 'KeyF':
        case 'KeyJ':
          keyFire = true
          refreshFire()
          sound.unlock()
          break
        case 'Digit1':
          engine.selectWeapon('pipe')
          sync()
          break
        case 'Digit2':
          engine.selectWeapon('pistol')
          sync()
          break
        case 'Digit3':
          engine.selectWeapon('mg')
          sync()
          break
        case 'KeyQ':
          engine.cycleWeapon(1)
          sync()
          break
        case 'KeyH':
          engine.weld()
          sync()
          break
        case 'KeyM':
          sound.unlock()
          sound.setMuted(!sound.muted)
          setHud(engine.getHud(sound.muted))
          break
        case 'Escape':
        case 'KeyP': {
          if (engine.phase === 'playing') engine.pause()
          else if (engine.phase === 'paused') engine.resume()
          sync()
          break
        }
        case 'Enter': {
          sound.unlock()
          if (engine.phase === 'menu' || engine.phase === 'dead') {
            engine.startRun()
            sync()
          } else if (engine.phase === 'paused') {
            engine.resume()
            sync()
          }
          break
        }
        case 'KeyR': {
          if (engine.phase === 'dead') {
            sound.unlock()
            engine.startRun()
            sync()
          }
          break
        }
        default:
          break
      }
    }

    const onKeyUp = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'KeyA':
        case 'ArrowLeft':
          engine.input.left = false
          break
        case 'KeyD':
        case 'ArrowRight':
          engine.input.right = false
          break
        case 'KeyW':
        case 'ArrowUp':
        case 'Space':
          engine.input.jump = false
          break
        case 'KeyS':
        case 'ArrowDown':
          engine.input.crouch = false
          break
        case 'KeyF':
        case 'KeyJ':
          keyFire = false
          refreshFire()
          break
        default:
          break
      }
    }

    const resetInput = () => {
      engine.input.left = false
      engine.input.right = false
      engine.input.jump = false
      engine.input.crouch = false
      keyFire = false
      pointerFire = false
      refreshFire()
    }

    const onBlur = () => {
      resetInput()
      if (engine.phase === 'playing') {
        engine.pause()
        sync()
      }
    }

    const onVisibility = () => {
      if (document.hidden) onBlur()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    document.addEventListener('visibilitychange', onVisibility)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointerleave', onPointerLeave)
    canvas.addEventListener('contextmenu', onContextMenu)

    if (import.meta.env.DEV) {
      // Handy for balancing and visual QA in the browser console.
      ;(window as unknown as { __deadline?: GameEngine }).__deadline = engine
    }

    return () => {
      cancelAnimationFrame(raf)
      media.removeEventListener('change', onMotionChange)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      canvas.removeEventListener('contextmenu', onContextMenu)
    }
  }, [canvasRef, engine, sync])

  return { hud, actions }
}

export const WEAPON_LABELS = WEAPONS
