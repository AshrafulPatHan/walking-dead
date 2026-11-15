import { useRef } from 'react'
import { VIEW_H, VIEW_W } from '../game/constants'
import { useGameEngine } from '../game/useGameEngine'
import { UIHUD } from './UIHUD'
import { DeathScreen, PauseScreen, StartScreen } from './OverlayScreens'
import { TouchControls } from './TouchControls'

export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { hud, actions } = useGameEngine(canvasRef)
  const showHud = hud.phase === 'playing' || hud.phase === 'paused'

  return (
    <div className="relative aspect-video w-full overflow-hidden border border-bone/15 bg-ink-950 shadow-[0_30px_90px_rgba(0,0,0,0.75),0_0_0_1px_rgba(0,0,0,0.9)]">
      <canvas
        ref={canvasRef}
        width={VIEW_W}
        height={VIEW_H}
        className={`pixel-canvas absolute inset-0 h-full w-full ${
          hud.phase === 'playing' ? 'cursor-none' : 'cursor-default'
        }`}
        aria-label="DEADLINE — a pixel-art survivor walking an endless railway line."
      >
        DEADLINE game scene.
      </canvas>

      <div className="stage-vignette pointer-events-none absolute inset-0 z-10" />

      {showHud && <UIHUD hud={hud} actions={actions} />}
      {hud.phase === 'playing' && <TouchControls actions={actions} />}
      {hud.phase === 'menu' && <StartScreen hud={hud} actions={actions} />}
      {hud.phase === 'paused' && <PauseScreen hud={hud} actions={actions} />}
      {hud.phase === 'dead' && <DeathScreen hud={hud} actions={actions} />}

      <div className="scanlines pointer-events-none absolute inset-0 z-40 opacity-[0.45]" />
      <div className="pointer-events-none absolute inset-0 z-40 shadow-[inset_0_0_50px_rgba(0,0,0,0.55)]" />

      <span className="pointer-events-none absolute left-2 top-2 z-40 h-3 w-3 border-l border-t border-amber-rail/45" />
      <span className="pointer-events-none absolute right-2 top-2 z-40 h-3 w-3 border-r border-t border-amber-rail/45" />
      <span className="pointer-events-none absolute bottom-2 left-2 z-40 h-3 w-3 border-b border-l border-amber-rail/45" />
      <span className="pointer-events-none absolute bottom-2 right-2 z-40 h-3 w-3 border-b border-r border-amber-rail/45" />
    </div>
  )
}
