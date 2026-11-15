import type { GameActions } from '../game/useGameEngine'
import { clock, pad } from '../game/format'
import type { HudState } from '../game/types'
import { PlankIcon, SkullIcon } from './Icons'

function Keycap({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center border border-bone/20 bg-bone/[0.06] px-1.5 font-pixel text-[8px] leading-none text-bone">
      {children}
    </kbd>
  )
}

function ControlRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex w-[84px] shrink-0 items-center gap-1">
        {keys.map((key) => (
          <Keycap key={key}>{key}</Keycap>
        ))}
      </span>
      <span className="font-pixel text-[8px] uppercase tracking-[0.1em] text-bone-faint">
        {label}
      </span>
    </div>
  )
}

function ControlSheet({ compact = false }: { compact?: boolean }) {
  return (
    <div className="border border-bone/15 bg-ink-950/50">
      <div className="flex items-center justify-between border-b border-bone/10 px-3 py-2">
        <span className="font-pixel text-[8px] uppercase tracking-[0.18em] text-bone-dim">
          Field manual
        </span>
        <span className="font-pixel text-[7px] uppercase tracking-[0.12em] text-bone-faint">
          Keyboard / mouse
        </span>
      </div>
      <div className={`grid grid-cols-2 gap-x-6 gap-y-2.5 px-3 py-3 ${compact ? '' : 'sm:gap-y-3'}`}>
        <ControlRow keys={['A', 'D']} label="Move" />
        <ControlRow keys={['SPACE']} label="Jump" />
        <ControlRow keys={['S']} label="Crouch" />
        <ControlRow keys={['LMB']} label="Fire" />
        <ControlRow keys={['1', '2', '3']} label="Swap weapon" />
        <ControlRow keys={['MOUSE']} label="Aim" />
        <ControlRow keys={['H']} label="Weld armor" />
        <ControlRow keys={['ESC']} label="Pause" />
      </div>
      {!compact && (
        <div className="border-t border-dashed border-bone/15 px-3 py-2 font-pixel text-[7px] leading-relaxed text-bone-faint">
          Touch controls appear on phones. Audio is synthesized live — no downloads.
        </div>
      )}
    </div>
  )
}

export function StartScreen({ hud, actions }: { hud: HudState; actions: GameActions }) {
  return (
    <div className="stage-overlay stage-overlay-backdrop absolute inset-0 z-30 overflow-y-auto bg-[linear-gradient(90deg,rgba(4,7,12,0.98)_0%,rgba(4,7,12,0.94)_30%,rgba(4,7,12,0.62)_50%,rgba(4,7,12,0.14)_67%,rgba(4,7,12,0)_100%)]">
      <div className="flex min-h-full items-center px-3 py-3 sm:px-8 sm:py-6 md:px-10 md:py-8">
        <div className="w-full max-w-[548px] animate-screen-in">
          <div className="mb-2 inline-flex items-center gap-2 border border-bone/15 bg-ink-900/70 px-2 py-1 sm:mb-4">
            <span className="h-1.5 w-1.5 animate-pulse-soft bg-rust-light" />
            <span className="font-pixel text-[8px] uppercase tracking-[0.2em] text-bone-dim sm:text-[9px]">
              Night service / Mile 0
            </span>
          </div>

          <h1 className="font-display text-[clamp(1.75rem,min(7vw,10vh),4.1rem)] leading-[0.95] text-bone [text-shadow:3px_3px_0_#6d2a1c,6px_6px_0_rgba(0,0,0,0.55)]">
            DEADLINE
          </h1>
          <div className="mt-2 flex items-center gap-2 sm:mt-4">
            <span className="h-[2px] w-8 bg-rust" />
            <p className="font-pixel text-[11px] leading-relaxed text-bone-dim sm:text-[12px]">
              The last train never came. The dead did.
            </p>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5 sm:mt-4">
            {['Infinite line', 'Three weapons', 'One life'].map((tag) => (
              <span
                key={tag}
                className="border border-bone/10 bg-ink-900/60 px-1.5 py-0.5 font-pixel text-[7px] uppercase tracking-[0.14em] text-bone-faint sm:text-[8px]"
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="manual-on-tall mt-4">
            <ControlSheet />
          </div>

          <button
            type="button"
            onClick={actions.start}
            className="mt-4 flex w-full items-center justify-between border border-amber-hot/70 bg-amber-rail px-4 py-3 text-ink-950 shadow-[4px_4px_0_#5a2418] transition-colors hover:bg-amber-hot focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-hot active:translate-x-[2px] active:translate-y-[2px] active:shadow-none sm:mt-5 sm:py-3.5"
          >
            <span className="font-display text-[11px] leading-none">START RUN</span>
            <span className="flex items-center gap-2 font-pixel text-[8px] uppercase tracking-[0.14em] text-ink-900/70">
              <span className="hidden sm:inline">Press</span>
              <Keycap>ENTER</Keycap>
            </span>
          </button>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 font-pixel text-[7px] uppercase tracking-[0.1em] text-bone-faint sm:mt-3">
            <span className="hidden sm:inline">Fresh terrain every run. No saves, no checkpoints.</span>
            <span className="sm:hidden">On-screen controls active</span>
            <button
              type="button"
              onClick={actions.toggleMute}
              className="pointer-events-auto border-b border-dashed border-bone/25 pb-0.5 text-bone-dim transition-colors hover:text-bone"
            >
              Audio {hud.muted ? 'off' : 'on'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function PauseScreen({ hud, actions }: { hud: HudState; actions: GameActions }) {
  return (
    <div className="stage-overlay absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-ink-950/80 p-3 backdrop-blur-[2px] sm:p-6">
      <div className="w-full max-w-[440px] animate-screen-in border border-bone/20 bg-ink-900/95 shadow-[0_24px_70px_rgba(0,0,0,0.7)]">
        <div className="flex items-center justify-between border-b border-bone/10 px-3 py-2">
          <span className="flex items-center gap-2 font-pixel text-[7px] uppercase tracking-[0.16em] text-bone-dim">
            <span className="h-1.5 w-1.5 bg-amber-rail" />
            Signal held
          </span>
          <span className="font-pixel text-[6px] uppercase tracking-[0.12em] text-bone-faint">
            Seed {hud.seed}
          </span>
        </div>
        <div className="p-4 sm:p-5">
          <h2 className="font-display text-xl leading-none text-bone sm:text-2xl">HOLD THE LINE</h2>
          <p className="mt-2 font-pixel text-[8px] leading-relaxed text-bone-dim">
            Catch your breath. They are still walking.
          </p>

          <div className="mt-4 grid grid-cols-3 divide-x divide-bone/10 border border-bone/10 bg-ink-950/50 text-center">
            <div className="px-2 py-2">
              <div className="font-pixel text-[6px] uppercase tracking-[0.12em] text-bone-faint">
                Dist
              </div>
              <div className="mt-1 font-display text-[9px] text-bone">{pad(hud.distance, 4)}m</div>
            </div>
            <div className="px-2 py-2">
              <div className="font-pixel text-[6px] uppercase tracking-[0.12em] text-bone-faint">
                Kills
              </div>
              <div className="mt-1 font-display text-[9px] text-bone">{hud.kills}</div>
            </div>
            <div className="px-2 py-2">
              <div className="font-pixel text-[6px] uppercase tracking-[0.12em] text-bone-faint">
                Score
              </div>
              <div className="mt-1 font-display text-[9px] text-amber-rail">{pad(hud.score, 6)}</div>
            </div>
          </div>

          <div className="manual-on-tall mt-4">
            <ControlSheet compact />
          </div>

          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={actions.resume}
              className="flex w-full items-center justify-between border border-amber-rail bg-amber-rail px-3 py-2.5 text-ink-950 transition-colors hover:bg-amber-hot focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-hot"
            >
              <span className="font-display text-[9px]">RESUME</span>
              <span className="font-pixel text-[7px] uppercase text-ink-900/60">Esc</span>
            </button>
            <button
              type="button"
              onClick={actions.restart}
              className="flex w-full items-center justify-between border border-bone/20 bg-ink-800/60 px-3 py-2 text-bone-dim transition-colors hover:border-bone/35 hover:text-bone"
            >
              <span className="font-pixel text-[8px] uppercase tracking-[0.1em]">
                Restart run — new terrain
              </span>
              <span className="font-pixel text-[7px] text-bone-faint">Free</span>
            </button>
            <button
              type="button"
              onClick={actions.toMenu}
              className="w-full border border-transparent px-3 py-1.5 font-pixel text-[7px] uppercase tracking-[0.12em] text-bone-faint transition-colors hover:text-bone-dim"
            >
              Abandon run and return to platform
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function DeathScreen({ hud, actions }: { hud: HudState; actions: GameActions }) {
  const survived = clock(hud.time)
  return (
    <div className="stage-overlay absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-[radial-gradient(ellipse_at_center,rgba(30,10,10,0.72)_0%,rgba(4,7,12,0.94)_72%)] p-3 backdrop-blur-[1px] sm:p-6">
      <div className="w-full max-w-[520px] animate-screen-in border border-rust/35 bg-ink-900/95 shadow-[0_30px_90px_rgba(0,0,0,0.8)]">
        <div className="flex items-center justify-between border-b border-bone/10 px-3 py-2">
          <span className="flex items-center gap-2 font-pixel text-[7px] uppercase tracking-[0.16em] text-rust-light">
            <span className="h-1.5 w-1.5 bg-blood" />
            Run terminated
          </span>
          <span className="font-pixel text-[6px] uppercase tracking-[0.12em] text-bone-faint">
            Seed {hud.seed}
          </span>
        </div>

        <div className="p-4 sm:p-5">
          <h2 className="font-display text-[clamp(1.4rem,4.6vw,2rem)] leading-none text-bone [text-shadow:3px_3px_0_#6d2a1c]">
            END OF LINE
          </h2>
          <p className="mt-3 max-w-[44ch] font-pixel text-[8px] leading-relaxed text-bone-dim sm:text-[9px]">
            You made it {hud.distance} {hud.distance === 1 ? 'metre' : 'metres'} past the last
            signal. {hud.kills} {hud.kills === 1 ? 'zombie' : 'zombies'} went down first.
          </p>

          <div className="mt-4 border border-bone/15 bg-ink-950/60">
            <div className="flex items-center justify-between border-b border-bone/10 px-3 py-2.5">
              <span className="font-pixel text-[7px] uppercase tracking-[0.16em] text-bone-faint">
                Final score
              </span>
              <span className="font-display text-lg leading-none text-amber-rail">
                {pad(hud.score, 6)}
              </span>
            </div>
            <div className="grid grid-cols-3 divide-x divide-bone/10">
              <div className="px-2 py-2 text-center">
                <div className="font-pixel text-[6px] uppercase tracking-[0.1em] text-bone-faint">
                  Distance
                </div>
                <div className="mt-1 font-display text-[9px] text-bone">{pad(hud.distance, 4)}m</div>
              </div>
              <div className="px-2 py-2 text-center">
                <div className="font-pixel text-[6px] uppercase tracking-[0.1em] text-bone-faint">
                  Survived
                </div>
                <div className="mt-1 font-display text-[9px] text-bone">{survived}</div>
              </div>
              <div className="px-2 py-2 text-center">
                <div className="font-pixel text-[6px] uppercase tracking-[0.1em] text-bone-faint">
                  Wave
                </div>
                <div className="mt-1 font-display text-[9px] text-bone">{pad(hud.wave, 2)}</div>
              </div>
              <div className="flex items-center justify-center gap-1.5 border-t border-bone/10 px-2 py-2">
                <SkullIcon className="h-3 w-3 text-bone-faint" />
                <span className="font-pixel text-[8px] text-bone-dim">{hud.kills} kills</span>
              </div>
              <div className="flex items-center justify-center gap-1.5 border-t border-bone/10 px-2 py-2">
                <PlankIcon className="h-3 w-3" />
                <span className="font-pixel text-[8px] text-bone-dim">{hud.materials} mats</span>
              </div>
              <div className="flex items-center justify-center gap-1.5 border-t border-bone/10 px-2 py-2">
                <span className="font-pixel text-[6px] uppercase tracking-[0.1em] text-bone-faint">
                  Best streak
                </span>
                <span className="font-pixel text-[8px] text-amber-rail">×{hud.bestMultiplier}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={actions.restart}
              className="flex w-full items-center justify-between border border-amber-hot/70 bg-amber-rail px-3 py-2.5 text-ink-950 shadow-[3px_3px_0_#5a2418] transition-colors hover:bg-amber-hot focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-hot active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              <span className="font-display text-[9px]">RIDE AGAIN</span>
              <span className="font-pixel text-[7px] uppercase text-ink-900/60">Enter</span>
            </button>
            <button
              type="button"
              onClick={actions.toMenu}
              className="w-full border border-bone/15 bg-ink-800/40 px-3 py-2 font-pixel text-[7px] uppercase tracking-[0.12em] text-bone-dim transition-colors hover:border-bone/30 hover:text-bone"
            >
              Back to platform
            </button>
          </div>

          <p className="mt-3 text-center font-pixel text-[6px] uppercase tracking-[0.1em] text-bone-faint">
            New terrain, new dead. Nothing carries over.
          </p>
        </div>
      </div>
    </div>
  )
}
