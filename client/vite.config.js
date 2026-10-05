import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // This is an npm workspace: without this, react-router can resolve a different
  // copy of react than the app does and the app fails with "Invalid hook call".
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router', 'react-router-dom', 'react-leaflet'],
  },
  server: {
    port: 5173,
    // Same-origin /api in dev keeps the browser off CORS entirely.
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});