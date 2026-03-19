/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        syne: ['Syne', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['10px', { lineHeight: '1.4' }],
      },
      colors: {
        // Match example.html / OllamaDesk palette
        dark: {
          bg: '#0a0b0d',
          surface: '#111318',
          elevated: '#181c22',
          raised: '#1f2430',
          shelf: '#252c3a',
          border: '#2d3444',
          text: '#eef0f4',
          muted: '#9aa3b2',
          dim: '#525d70',
        },
        accent: {
          DEFAULT: '#00e5c0',
          dim: 'rgba(0, 229, 192, 0.12)',
          mid: 'rgba(0, 229, 192, 0.3)',
        },
        desk: {
          blue: '#3d8ef5',
          /** Lighter blue — pairs with `desk.blue` for wordmark / two-tone UI */
          blueBright: '#93c5fd',
          purple: '#a78bfa',
          orange: '#fb923c',
          green: '#4ade80',
          red: '#f87171',
          yellow: '#fbbf24',
        },
      },
      boxShadow: {
        desk: '0 8px 32px rgba(0, 0, 0, 0.5)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.2s ease-out',
      },
    },
  },
  plugins: [],
};
