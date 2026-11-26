import type { Config } from 'tailwindcss';
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        graphite: { 900: '#101316', 800: '#161a1e', 700: '#1c2126', 600: '#242a30', 500: '#2e353c' },
        line: { DEFAULT: '#333b43', bright: '#434d57' },
        bone: { DEFAULT: '#e7eaed', dim: '#b3bbc3', mute: '#848d96' },
        champagne: { DEFAULT: '#c9a063', dim: '#8d6f42', bright: '#ddb97f' },
        verdict: { clear: '#4fa97e', marginal: '#e07b39', bad: '#ce4038', unknown: '#7c858f' },
      },
      fontFamily: {
        sans: ['Archivo', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
