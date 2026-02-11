/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Rose Gold Palette
        'rose-gold': {
          50: '#fdf8f6',
          100: '#f9ede7',
          200: '#f0ddd3',
          300: '#ecd4c0',
          400: '#d9a07a',
          500: '#c9956c',
          600: '#b8845c',
          700: '#a67c52',
          800: '#8b6442',
          900: '#6b4d32',
        },
        // Dark backgrounds
        'void': '#000000',
        'dark': {
          50: '#1a1816',
          100: '#151312',
          200: '#12100e',
          300: '#0c0a08',
          400: '#080604',
          500: '#000000',
        },
      },
      fontFamily: {
        'display': ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        'mono': ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      backdropBlur: {
        'xs': '2px',
        'morphic': '20px',
        'strong': '40px',
      },
      boxShadow: {
        'glow-sm': '0 0 20px rgba(217, 160, 122, 0.3)',
        'glow': '0 0 40px rgba(217, 160, 122, 0.4)',
        'glow-lg': '0 0 60px rgba(217, 160, 122, 0.5)',
        'glow-xl': '0 0 80px rgba(217, 160, 122, 0.6), 0 0 120px rgba(217, 160, 122, 0.3)',
        'morphic': '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      },
      animation: {
        'pulse-glow': 'pulseGlow 3s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'typing': 'typing 1s ease-in-out infinite',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(217, 160, 122, 0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(217, 160, 122, 0.6)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        typing: {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.5 },
        },
      },
    },
  },
  plugins: [],
}
