import type { GameActions } from '../game/useGameEngine'
import type { HudState, WeaponHud } from '../game/types'
import { WELD_COST, WEAPONS } from '../game/constants'
import { clock, pad } from '../game/format'
import {
  PauseIcon,
  PlayIcon,
  PlankIcon,
  SkullIcon,
  SpeakerIcon,
  WeaponIcon,
} from './Icons'

function Plate({
  children,
  className = '',
  accent = 'amber',
}: {
  children: React.ReactNode
  className?: string
  accent?: 'amber' | 'rust'
}) {
  return (
    <div
      className={`relative border border-bone/15 bg-ink-900/85 px-2 py-1.5 shadow-[0_6px_20px_rgba(0,0,0,0.5)] sm:px-3 sm:py-2 ${className}`}
    >
      <span
        className={`absolute left-0 top-0 h-[2px] w-5 ${
          accent === 'amber' ? 'bg-amber-rail/80' : 'bg-rust/80'
        }`}
      />
      <span className="absolute bottom-0 right-0 h-1.5 w-[2px] bg-bone/20" />
      {children}
    </div>
  )
}

function Vitals({ hud }: { hud: HudState }) {
  const pct = hud.health / hud.maxHealth
  const low = pct <= 0.3
  const tone = pct > 0.55 ? 'bg-amber-rail' : pct > 0.3 ? 'bg-rust-light' : 'bg-blood'
  const segments = 10
  const filled = Math.ceil((hud.health / hud.maxHealth) * segments)

  return (
    <Plate className="min-w-[140px] sm:min-w-[184px]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[8px] uppercase tracking-[0.16em] text-bone-faint sm:text-[9px]">
          Condition
        </span>
        {low && (
          <span className="animate-pulse-soft text-[7px] uppercase tracking-[0.1em] text-blood sm:text-[8px]">
            Critical
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-end gap-2">
        <div className="flex gap-[2px]">
          {Array.from({ length: segments }).map((_, index) => (
            <span
              key={index}
              className={`h-[7px] w-[8px] border border-black/30 sm:h-[9px] sm:w-[11px] ${
                index < filled ? tone : 'bg-bone/10'
              }`}
            />
          ))}
        </div>
        <span
          className={`font-display text-[10px] leading-none sm:text-[12px] ${
            low ? 'text-blood' : 'text-bone'
          }`}
        >
          {hud.health}
        </span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[8px] leading-none text-bone-faint lg:hidden">
        <span>
          {pad(hud.distance, 4)}
          <span className="text-bone-faint/70">M</span>
        </span>
        <span>WAVE {pad(hud.wave, 2)}</span>
      </div>
    </Plate>
  )
}

function Odometer({ hud }: { hud: HudState }) {
  return (
    <Plate className="hidden lg:block">
      <div className="flex items-baseline gap-1.5">
        <span className="text-[8px] uppercase tracking-[0.16em] text-bone-faint sm:text-[9px]">
          Dist
        </span>
        <span className="font-display text-[14px] leading-none text-amber-rail">
          {pad(hud.distance, 4)}
        </span>
        <span className="text-[8px] leading-none text-bone-faint">M</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[8px] leading-none text-bone-faint">
        <span>WAVE {pad(hud.wave, 2)}</span>
        <span className="text-bone/20">/</span>
        <span>{clock(hud.time)}</span>
      </div>
    </Plate>
  )
}

function Ledger({ hud }: { hud: HudState }) {
  return (
    <Plate className="min-w-[140px] text-right sm:min-w-[176px]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[8px] uppercase tracking-[0.16em] text-bone-faint sm:text-[9px]">
          Score
        </span>
        <span className="font-display text-[11px] leading-none text-bone sm:text-[13px]">
          {pad(hud.score, 6)}
        </span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[9px] leading-none">
        <span className="flex items-center gap-1 text-amber-rail" title="Building materials">
          <PlankIcon className="h-3.5 w-3.5" />
          <span className="font-pixel">{hud.materials}</span>
          <span className="hidden text-[7px] uppercase tracking-[0.12em] text-bone-faint sm:inline">
            mats
          </span>
        </span>
        <span className="flex items-center gap-1 text-bone-dim" title="Zombies killed">
          <SkullIcon className="h-3.5 w-3.5 text-bone-faint" />
          <span className="font-pixel">{hud.kills}</span>
        </span>
        {hud.multiplier > 1 && (
          <span className="animate-pulse-soft font-pixel text-[10px] text-amber-hot">
            ×{hud.multiplier}
          </span>
        )}
      </div>
    </Plate>
  )
}

function WeaponButton({
  weapon,
  onSelect,
}: {
  weapon: WeaponHud
  onSelect: () => void
}) {
  const def = WEAPONS[weapon.id]
  const ammo = weapon.ammo < 0 ? '∞' : String(weapon.ammo)
  const dry = weapon.ammo === 0
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={weapon.active}
      title={`${def.name} — ${def.hint}`}
      className={`group relative flex items-center gap-1.5 border px-2 py-1.5 text-left transition-colors duration-100 sm:gap-2 sm:px-2.5 sm:py-2 ${
        weapon.active
          ? 'border-amber-rail/70 bg-ink-700/95 shadow-amber-glow'
          : 'border-bone/10 bg-ink-900/80 hover:border-bone/30 hover:bg-ink-800/90'
      }`}
    >
      <span
        className={`absolute left-0 top-0 h-full w-[2px] ${
          weapon.active ? 'bg-amber-rail' : 'bg-transparent'
        }`}
      />
      <span
        className={`absolute right-1 top-1 font-pixel text-[7px] leading-none ${
          weapon.active ? 'text-amber-rail' : 'text-bone-faint/70'
        }`}
      >
        {weapon.slot}
      </span>
      <span
        className={`flex h-5 w-6 shrink-0 items-center justify-center sm:h-6 sm:w-7 ${
          weapon.active ? 'text-bone' : 'text-bone-dim'
        }`}
      >
        <WeaponIcon id={weapon.id} className="h-4 w-5" />
      </span>
      <span className="min-w-0">
        <span
          className={`block truncate pr-2 font-pixel text-[8px] uppercase leading-none tracking-wide sm:text-[9px] ${
            weapon.active ? 'text-bone' : 'text-bone-dim'
          }`}
        >
          <span className="hidden sm:inline">{def.name}</span>
          <span className="sm:hidden">{def.name === 'Machine gun' ? 'MG' : def.name}</span>
        </span>
        <span
          className={`mt-1.5 block font-pixel text-[9px] leading-none sm:text-[10px] ${
            dry ? 'text-blood' : weapon.active ? 'text-amber-rail' : 'text-bone-faint'
          }`}
        >
          {ammo}
          {weapon.ammo >= 0 && (
            <span className="ml-1 text-[7px] text-bone-faint">
              {weapon.id === 'pistol' ? '9MM' : 'RDS'}
            </span>
          )}
        </span>
      </span>
    </button>
  )
}

export function UIHUD({ hud, actions }: { hud: HudState; actions: GameActions }) {
  if (hud.phase === 'menu' || hud.phase === 'dead') return null

  const low = hud.health / hud.maxHealth <= 0.3

  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none">
      {low && (
        <div className="absolute inset-0 animate-pulse-soft bg-[radial-gradient(ellipse_at_center,transparent_38%,rgba(130,20,16,0.26)_100%)]" />
      )}

      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-1.5 p-2 sm:p-3">
        <Vitals hud={hud} />
        <Odometer hud={hud} />
        <Ledger hud={hud} />
      </div>

      {hud.toast && (
        <div
          key={hud.toast.id}
          className={`absolute left-1/2 top-[84px] flex -translate-x-1/2 animate-toast-in items-center gap-2 border bg-ink-900/95 px-3 py-2 shadow-[0_8px_22px_rgba(0,0,0,0.45)] sm:top-[94px] ${
            hud.toast.tone === 'warn'
              ? 'border-rust/70'
              : hud.toast.tone === 'good'
                ? 'border-rot/60'
                : 'border-bone/25'
          }`}
          role="status"
        >
          <span
            className={`h-1.5 w-1.5 ${
              hud.toast.tone === 'warn'
                ? 'bg-rust-light'
                : hud.toast.tone === 'good'
                  ? 'bg-rot-pale'
                  : 'bg-amber-rail'
            }`}
          />
          <span className="whitespace-nowrap font-pixel text-[8px] uppercase tracking-[0.12em] text-bone sm:text-[9px]">
            {hud.toast.text}
          </span>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-1.5 p-2 sm:p-2.5">
        <div className="pointer-events-auto flex items-end gap-1">
          {hud.weapons.map((weapon) => (
            <WeaponButton
              key={weapon.id}
              weapon={weapon}
              onSelect={() => actions.selectWeapon(weapon.id)}
            />
          ))}
        </div>

        <div className="pointer-events-auto flex items-end gap-1">
          <button
            type="button"
            onClick={actions.weld}
            disabled={!hud.canWeld}
            title={`Weld armor plating — ${WELD_COST} materials, restores 25 condition (H)`}
            className={`border px-2 py-1.5 text-left transition-colors duration-100 sm:px-2.5 sm:py-2 ${
              hud.canWeld
                ? 'border-amber-rail/50 bg-ink-800/90 text-amber-rail hover:border-amber-rail hover:bg-ink-700'
                : 'cursor-not-allowed border-bone/10 bg-ink-900/70 text-bone-faint/50'
            }`}
          >
            <span className="block font-pixel text-[9px] uppercase leading-none tracking-wide">
              Weld <span className="text-[8px]">+25</span>
            </span>
            <span className="mt-1.5 block font-pixel text-[7px] leading-none text-bone-faint">
              {WELD_COST} MATS <span className="hidden sm:inline">· H</span>
            </span>
          </button>

          <button
            type="button"
            onClick={actions.togglePause}
            aria-label={hud.phase === 'paused' ? 'Resume run' : 'Pause run'}
            className="flex h-[34px] w-[32px] items-center justify-center border border-bone/15 bg-ink-900/85 text-bone-dim transition-colors hover:border-bone/35 hover:text-bone sm:h-[36px] sm:w-[34px]"
          >
            {hud.phase === 'paused' ? <PlayIcon /> : <PauseIcon />}
          </button>

          <button
            type="button"
            onClick={actions.toggleMute}
            aria-label={hud.muted ? 'Unmute audio' : 'Mute audio'}
            className="flex h-[34px] w-[32px] items-center justify-center border border-bone/15 bg-ink-900/85 text-bone-dim transition-colors hover:border-bone/35 hover:text-bone sm:h-[36px] sm:w-[34px]"
          >
            <SpeakerIcon muted={hud.muted} />
          </button>
        </div>
      </div>
    </div>
  )
}
