/**
 * Tiny synthesized SFX kit. No external assets, no loading, no dependencies.
 * The AudioContext is created lazily on the first user gesture so browser
 * autoplay policies are respected.
 */
export class SoundKit {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noiseBuffer: AudioBuffer | null = null
  private _muted = false

  get muted(): boolean {
    return this._muted
  }

  setMuted(value: boolean): void {
    this._muted = value
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(value ? 0 : 0.7, this.ctx.currentTime, 0.02)
    }
  }

  unlock(): void {
    if (typeof window === 'undefined') return
    if (!this.ctx) {
      const Ctor = window.AudioContext
      if (!Ctor) return
      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.gain.value = this._muted ? 0 : 0.7
      this.master.connect(this.ctx.destination)

      const length = Math.floor(this.ctx.sampleRate * 0.7)
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1
      this.noiseBuffer = buffer
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  private get ready(): boolean {
    return Boolean(this.ctx && this.master && this.noiseBuffer)
  }

  private noise(
    duration: number,
    filterType: BiquadFilterType,
    frequency: number,
    volume: number,
    endFrequency?: number,
  ): void {
    if (!this.ready || this._muted) return
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer!
    const filter = ctx.createBiquadFilter()
    filter.type = filterType
    filter.frequency.setValueAtTime(frequency, ctx.currentTime)
    if (endFrequency !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), ctx.currentTime + duration)
    }
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(volume, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration)
    src.connect(filter)
    filter.connect(gain)
    gain.connect(this.master!)
    src.start()
    src.stop(ctx.currentTime + duration)
  }

  private tone(
    type: OscillatorType,
    duration: number,
    frequency: number,
    volume: number,
    endFrequency?: number,
    attack = 0.004,
  ): void {
    if (!this.ready || this._muted) return
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(frequency, ctx.currentTime)
    if (endFrequency !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), ctx.currentTime + duration)
    }
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + attack)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration)
    osc.connect(gain)
    gain.connect(this.master!)
    osc.start()
    osc.stop(ctx.currentTime + duration + 0.01)
  }

  pistol(): void {
    this.noise(0.09, 'bandpass', 1500, 0.22, 400)
    this.tone('square', 0.08, 180, 0.1, 60)
  }

  mg(): void {
    this.noise(0.045, 'highpass', 900, 0.09, 1600)
    this.tone('square', 0.04, 130, 0.045, 70)
  }

  melee(): void {
    this.noise(0.14, 'bandpass', 600, 0.16, 1800)
  }

  hit(): void {
    this.noise(0.07, 'lowpass', 800, 0.14, 300)
    this.tone('sine', 0.07, 110, 0.08, 60)
  }

  kill(): void {
    this.noise(0.22, 'lowpass', 620, 0.14, 160)
    this.tone('sawtooth', 0.16, 90, 0.05, 40)
  }

  hurt(): void {
    this.tone('sawtooth', 0.22, 170, 0.12, 70)
    this.noise(0.14, 'lowpass', 500, 0.1, 120)
  }

  empty(): void {
    this.tone('square', 0.035, 880, 0.04, 520)
  }

  pickup(): void {
    this.tone('square', 0.06, 660, 0.05, 660)
    window.setTimeout(() => this.tone('square', 0.07, 990, 0.045, 990), 45)
  }

  weld(): void {
    this.noise(0.3, 'bandpass', 1200, 0.1, 3000)
    this.tone('triangle', 0.25, 320, 0.05, 640)
  }

  wave(): void {
    this.tone('sawtooth', 0.7, 72, 0.09, 58, 0.12)
    this.tone('sawtooth', 0.6, 96, 0.05, 72, 0.18)
  }

  ui(): void {
    this.tone('square', 0.03, 540, 0.035, 620)
  }

  death(): void {
    this.tone('sawtooth', 1.1, 140, 0.12, 35, 0.01)
    this.noise(0.9, 'lowpass', 400, 0.12, 80)
  }
}

export const sound = new SoundKit()
