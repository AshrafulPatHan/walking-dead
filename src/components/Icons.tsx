import type { WeaponId } from '../game/types'

type IconProps = { className?: string }

const base = 'block'

export function PipeIcon({ className = 'h-4 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 20 14" className={`${base} ${className}`} shapeRendering="crispEdges" aria-hidden>
      <rect x="2" y="6" width="13" height="2" fill="currentColor" />
      <rect x="2" y="6" width="13" height="1" fill="#d5dce0" opacity="0.7" />
      <rect x="14" y="4" width="3" height="5" fill="currentColor" />
      <rect x="15" y="4" width="1" height="3" fill="#d5dce0" opacity="0.5" />
      <rect x="4" y="8" width="4" height="1" fill="currentColor" opacity="0.5" />
    </svg>
  )
}

export function PistolIcon({ className = 'h-4 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 20 14" className={`${base} ${className}`} shapeRendering="crispEdges" aria-hidden>
      <rect x="3" y="4" width="11" height="4" fill="currentColor" />
      <rect x="12" y="3" width="6" height="2" fill="currentColor" />
      <rect x="3" y="3" width="9" height="1" fill="#d5dce0" opacity="0.5" />
      <rect x="4" y="8" width="4" height="5" fill="currentColor" />
      <rect x="8" y="8" width="2" height="1" fill="currentColor" opacity="0.6" />
      <rect x="5" y="9" width="1" height="2" fill="#0c131e" />
    </svg>
  )
}

export function MgIcon({ className = 'h-4 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 20 14" className={`${base} ${className}`} shapeRendering="crispEdges" aria-hidden>
      <rect x="2" y="5" width="13" height="3" fill="currentColor" />
      <rect x="14" y="4" width="5" height="2" fill="currentColor" />
      <rect x="2" y="4" width="12" height="1" fill="#d5dce0" opacity="0.5" />
      <rect x="1" y="8" width="4" height="2" fill="currentColor" opacity="0.7" />
      <rect x="6" y="8" width="3" height="4" fill="currentColor" />
      <rect x="11" y="8" width="2" height="3" fill="currentColor" opacity="0.8" />
      <rect x="17" y="5" width="2" height="1" fill="#0c131e" />
    </svg>
  )
}

export function WeaponIcon({ id, className }: { id: WeaponId; className?: string }) {
  if (id === 'pipe') return <PipeIcon className={className} />
  if (id === 'pistol') return <PistolIcon className={className} />
  return <MgIcon className={className} />
}

export function PlankIcon({ className = 'h-3.5 w-3.5' }: IconProps) {
  return (
    <svg viewBox="0 0 14 14" className={`${base} ${className}`} shapeRendering="crispEdges" aria-hidden>
      <rect x="1" y="3" width="12" height="2" fill="#b57a45" />
      <rect x="1" y="3" width="12" height="1" fill="#e0a86b" />
      <rect x="1" y="6" width="12" height="2" fill="#8d5a33" />
      <rect x="1" y="6" width="12" height="1" fill="#b57a45" />
      <rect x="1" y="9" width="12" height="2" fill="#6f4527" />
      <rect x="1" y="9" width="12" height="1" fill="#8d5a33" />
      <rect x="3" y="3" width="1" height="2" fill="#4a2d18" />
      <rect x="10" y="6" width="1" height="2" fill="#4a2d18" />
    </svg>
  )
}

export function SkullIcon({ className = 'h-3 w-3' }: IconProps) {
  return (
    <svg viewBox="0 0 12 12" className={`${base} ${className}`} shapeRendering="crispEdges" aria-hidden>
      <rect x="2" y="1" width="8" height="2" fill="currentColor" />
      <rect x="1" y="3" width="10" height="4" fill="currentColor" />
      <rect x="2" y="7" width="8" height="2" fill="currentColor" />
      <rect x="3" y="9" width="6" height="2" fill="currentColor" opacity="0.7" />
      <rect x="3" y="4" width="2" height="2" fill="#070b12" />
      <rect x="7" y="4" width="2" height="2" fill="#070b12" />
      <rect x="5" y="7" width="2" height="1" fill="#070b12" />
    </svg>
  )
}

export function SpeakerIcon({ muted, className = 'h-3.5 w-3.5' }: IconProps & { muted: boolean }) {
  return (
    <svg viewBox="0 0 14 14" className={`${base} ${className}`} shapeRendering="crispEdges" aria-hidden>
      <rect x="1" y="5" width="3" height="4" fill="currentColor" />
      <rect x="4" y="3" width="2" height="8" fill="currentColor" />
      <rect x="6" y="2" width="1" height="10" fill="currentColor" />
      {muted ? (
        <>
          <rect x="9" y="5" width="1" height="1" fill="currentColor" />
          <rect x="10" y="6" width="1" height="2" fill="currentColor" />
          <rect x="11" y="8" width="1" height="1" fill="currentColor" />
          <rect x="11" y="4" width="1" height="1" fill="currentColor" />
          <rect x="10" y="5" width="1" height="1" fill="currentColor" opacity="0.4" />
        </>
      ) : (
        <>
          <rect x="9" y="5" width="1" height="4" fill="currentColor" opacity="0.7" />
          <rect x="11" y="3" width="1" height="8" fill="currentColor" opacity="0.5" />
          <rect x="13" y="1" width="1" height="12" fill="currentColor" opacity="0.25" />
        </>
      )}
    </svg>
  )
}

export function PauseIcon({ className = 'h-3.5 w-3.5' }: IconProps) {
  return (
    <svg viewBox="0 0 12 12" className={`${base} ${className}`} shapeRendering="crispEdges" aria-hidden>
      <rect x="2" y="2" width="3" height="8" fill="currentColor" />
      <rect x="7" y="2" width="3" height="8" fill="currentColor" />
    </svg>
  )
}

export function PlayIcon({ className = 'h-3.5 w-3.5' }: IconProps) {
  return (
    <svg viewBox="0 0 12 12" className={`${base} ${className}`} shapeRendering="crispEdges" aria-hidden>
      <rect x="3" y="2" width="2" height="8" fill="currentColor" />
      <rect x="5" y="3" width="2" height="6" fill="currentColor" />
      <rect x="7" y="4" width="2" height="4" fill="currentColor" />
    </svg>
  )
}

export function CrosshairIcon({ className = 'h-3.5 w-3.5' }: IconProps) {
  return (
    <svg viewBox="0 0 12 12" className={`${base} ${className}`} shapeRendering="crispEdges" aria-hidden>
      <rect x="5" y="0" width="2" height="4" fill="currentColor" />
      <rect x="5" y="8" width="2" height="4" fill="currentColor" />
      <rect x="0" y="5" width="4" height="2" fill="currentColor" />
      <rect x="8" y="5" width="4" height="2" fill="currentColor" />
      <rect x="5" y="5" width="2" height="2" fill="currentColor" />
    </svg>
  )
}
