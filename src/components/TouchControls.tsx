import type { GameActions, VirtualControl } from '../game/useGameEngine'

function HoldButton({
  control,
  label,
  ariaLabel,
  actions,
  className = '',
}: {
  control: VirtualControl
  label: string
  ariaLabel: string
  actions: GameActions
  className?: string
}) {
  const release = () => actions.setVirtual(control, false)
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className={`touch-none select-none border border-bone/25 bg-ink-900/80 font-pixel text-[15px] text-bone-dim transition-colors active:border-amber-rail/80 active:bg-amber-rail/20 active:text-bone ${className}`}
      onPointerDown={(event) => {
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        actions.setVirtual(control, true)
      }}
      onPointerUp={(event) => {
        event.preventDefault()
        release()
      }}
      onPointerCancel={release}
      onPointerLeave={release}
      onLostPointerCapture={release}
      onContextMenu={(event) => event.preventDefault()}
    >
      {label}
    </button>
  )
}

export function TouchControls({ actions }: { actions: GameActions }) {
  return (
    <div className="touch-only pointer-events-none absolute inset-x-0 bottom-14 z-[25] items-end justify-between px-3">
      <div className="pointer-events-auto grid grid-cols-3 grid-rows-2 gap-1">
        <span />
        <HoldButton
          control="jump"
          label="▲"
          ariaLabel="Jump"
          actions={actions}
          className="h-10 w-10"
        />
        <span />
        <HoldButton
          control="left"
          label="◀"
          ariaLabel="Move left"
          actions={actions}
          className="h-10 w-10"
        />
        <HoldButton
          control="crouch"
          label="▼"
          ariaLabel="Crouch"
          actions={actions}
          className="h-10 w-10"
        />
        <HoldButton
          control="right"
          label="▶"
          ariaLabel="Move right"
          actions={actions}
          className="h-10 w-10"
        />
      </div>

      <div className="pointer-events-auto flex flex-col items-end gap-1.5">
        <button
          type="button"
          onClick={actions.cycleWeapon}
          className="touch-none border border-bone/25 bg-ink-900/80 px-2 py-1 font-pixel text-[7px] uppercase tracking-[0.1em] text-bone-dim active:border-amber-rail/80 active:text-bone"
        >
          Swap gun
        </button>
        <HoldButton
          control="fire"
          label="FIRE"
          ariaLabel="Fire weapon"
          actions={actions}
          className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 border-amber-rail/60 text-[10px] text-amber-rail"
        />
        <span className="pr-1 font-pixel text-[5px] uppercase tracking-[0.14em] text-bone-faint">
          Auto aim
        </span>
      </div>
    </div>
  )
}
