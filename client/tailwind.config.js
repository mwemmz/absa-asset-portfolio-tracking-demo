/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Workspace canvas: a deep cool slate that lets white cards read as surfaces.
        canvas: '#dee3ea',
        // Lusaka 1 palette: red, white, dark grey.
        brand: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#e11d2e',
          600: '#c8102e',
          700: '#a20d26',
          800: '#7f0f20',
          900: '#68101e',
        },
        ink: {
          50: '#f6f7f8',
          100: '#eceef0',
          200: '#d5d9de',
          300: '#b0b8c0',
          400: '#85909b',
          500: '#65707b',
          600: '#4d5761',
          700: '#3c444c',
          800: '#272d34',
          900: '#191d22',
          950: '#0e1114',
        },
        status: {
          moving: '#0f9d58',
          stopped: '#d97706',
          offline: '#6b7280',
          tampered: '#c8102e',
        },
      },
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      letterSpacing: {
        label: '0.08em',
        tightish: '-0.01em',
        display: '-0.02em',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(16 24 40 / 0.05), 0 3px 8px -4px rgb(16 24 40 / 0.12), 0 16px 32px -22px rgb(16 24 40 / 0.35)',
        pop: '0 2px 6px 0 rgb(16 24 40 / 0.08), 0 20px 44px -22px rgb(16 24 40 / 0.4)',
        lift: '0 4px 10px -4px rgb(16 24 40 / 0.14), 0 26px 52px -24px rgb(16 24 40 / 0.45)',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '70%': { transform: 'scale(2.2)', opacity: '0' },
          '100%': { transform: 'scale(2.2)', opacity: '0' },
        },
        flash: {
          '0%, 100%': { backgroundColor: 'transparent' },
          '50%': { backgroundColor: 'rgb(254 226 226)' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 2.4s cubic-bezier(0.24, 0, 0.38, 1) infinite',
        flash: 'flash 1.2s ease-in-out 2',
      },
    },
  },
  plugins: [],
};