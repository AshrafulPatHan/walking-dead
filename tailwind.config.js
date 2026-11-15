/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#04070c',
          900: '#070b12',
          800: '#0c131e',
          700: '#111a28',
          600: '#182435',
        },
        bone: {
          DEFAULT: '#e8dfc6',
          dim: '#bdb59f',
          faint: '#8b8878',
        },
        amber: {
          rail: '#f0b45a',
          hot: '#ffd089',
          deep: '#c4863a',
        },
        rust: {
          DEFAULT: '#b4472f',
          dark: '#7d2f1f',
          light: '#d96745',
        },
        steel: {
          DEFAULT: '#6f8296',
          dark: '#3c4a5c',
          light: '#9aabbb',
        },
        rot: {
          DEFAULT: '#98a45f',
          dark: '#5c6637',
          pale: '#c0c88b',
        },
        blood: '#d3402e',
      },
      fontFamily: {
        display: ['"Press Start 2P"', 'monospace'],
        pixel: ['Silkscreen', 'monospace'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        plate: '0 0 0 1px rgba(232,223,198,0.14), 0 10px 30px rgba(0,0,0,0.55)',
        'inset-hair': 'inset 0 0 0 1px rgba(232,223,198,0.08)',
        'amber-glow': '0 0 18px rgba(240,180,90,0.18)',
      },
      keyframes: {
        flicker: {
          '0%, 100%': { opacity: '1' },
          '42%': { opacity: '1' },
          '43%': { opacity: '0.55' },
          '44%': { opacity: '1' },
          '71%': { opacity: '0.8' },
          '72%': { opacity: '1' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
        drift: {
          '0%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-3px)' },
          '100%': { transform: 'translateY(0px)' },
        },
        toastIn: {
          '0%': { opacity: '0', transform: 'translateY(-4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        screenIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        flicker: 'flicker 7s steps(1, end) infinite',
        'pulse-soft': 'pulseSoft 1.6s ease-in-out infinite',
        drift: 'drift 3.4s ease-in-out infinite',
        'toast-in': 'toastIn 180ms ease-out both',
        'screen-in': 'screenIn 260ms ease-out both',
      },
    },
  },
  plugins: [],
}
