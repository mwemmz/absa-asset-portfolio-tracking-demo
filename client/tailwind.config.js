/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Absa-flavoured palette: red, white, dark grey.
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
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(16 24 40 / 0.06), 0 1px 3px 0 rgb(16 24 40 / 0.10)',
        pop: '0 10px 30px -12px rgb(16 24 40 / 0.25)',
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