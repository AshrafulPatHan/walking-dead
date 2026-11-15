export function pad(value: number, digits: number): string {
  return Math.max(0, Math.floor(value)).toString().padStart(digits, '0')
}

export function clock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
