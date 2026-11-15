import { GameCanvas } from './components/GameCanvas'

function BrandMark() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4 text-amber-rail"
      shapeRendering="crispEdges"
      aria-hidden
    >
      <rect x="2" y="11" width="12" height="1" fill="currentColor" opacity="0.7" />
      <rect x="3" y="8" width="2" height="2" fill="currentColor" />
      <rect x="11" y="8" width="2" height="2" fill="currentColor" />
      <rect x="6" y="2" width="6" height="1" fill="currentColor" opacity="0.5" />
      <rect x="7" y="3" width="5" height="5" fill="currentColor" opacity="0.85" />
      <rect x="8" y="4" width="2" height="2" fill="#070b12" />
      <rect x="4" y="5" width="2" height="4" fill="currentColor" opacity="0.5" />
    </svg>
  )
}

export default function App() {
  return (
    <div className="app-shell relative flex min-h-dvh flex-col overflow-hidden bg-ink-950 text-bone">
      <div className="pointer-events-none absolute -left-32 -top-40 h-96 w-96 rounded-full bg-rust/[0.08] blur-[110px]" />
      <div className="pointer-events-none absolute -bottom-40 right-0 h-[28rem] w-[28rem] rounded-full bg-steel/[0.06] blur-[130px]" />

      <header className="app-chrome relative z-10 flex h-11 shrink-0 items-center justify-between border-b border-bone/[0.07] px-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <BrandMark />
          <span className="font-display text-[9px] leading-none tracking-tight text-bone">
            DEADLINE
          </span>
          <span className="hidden h-3 w-px bg-bone/15 sm:block" />
          <span className="hidden font-pixel text-[7px] uppercase tracking-[0.16em] text-bone-faint sm:block">
            Endless rail survival
          </span>
        </div>
        <div className="flex items-center gap-4 font-pixel text-[7px] uppercase tracking-[0.14em] text-bone-faint">
          <span className="hidden items-center gap-1.5 sm:flex">
            <span className="h-1.5 w-1.5 animate-pulse-soft bg-rust-light" />
            Night service
          </span>
          <span className="hidden text-bone/20 md:inline">/</span>
          <span className="hidden md:inline">Mile 0 · 02:47</span>
          <span className="sm:hidden">Mile 0</span>
        </div>
      </header>

      <main className="app-main relative z-10 flex flex-1 flex-col items-center justify-center gap-2 px-2 py-2 sm:px-4">
        <div className="stage-frame shrink-0">
          <GameCanvas />
        </div>
        <p className="font-pixel text-[6px] uppercase tracking-[0.14em] text-bone-faint/70 sm:hidden">
          Best played in landscape · touch controls enabled
        </p>
      </main>

      <footer className="app-chrome relative z-10 hidden h-8 shrink-0 items-center justify-between gap-4 border-t border-bone/[0.07] px-3 font-pixel text-[7px] uppercase tracking-[0.1em] text-bone-faint sm:flex sm:px-6">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>A / D — move</span>
          <span className="text-bone/15">·</span>
          <span>Space — jump</span>
          <span className="text-bone/15">·</span>
          <span>S — crouch</span>
          <span className="text-bone/15">·</span>
          <span>LMB — fire</span>
        </span>
        <span className="flex items-center gap-3">
          <span className="hidden md:inline">1 / 2 / 3 — weapons</span>
          <span className="hidden text-bone/15 md:inline">·</span>
          <span className="hidden md:inline">H — weld</span>
          <span className="text-rust-light/70">No saves</span>
        </span>
      </footer>
    </div>
  )
}
