import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// In development the API runs separately (npm run dev:api, port 4000); Vite proxies /api to it,
// so the browser only ever talks to one origin and the backend stays authoritative.
const apiTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:4000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Libraries that are only reached through lazy imports. Without this, the dev server discovers them
  // the first time they are needed, re-bundles, and reloads the whole page (losing the user's place).
  optimizeDeps: {
    include: ['swiper/react', 'swiper/modules', 'gsap', 'gsap/ScrollTrigger', 'lenis'],
  },
  server: {
    port: 3000,
    // ws: true also forwards the /api/live WebSocket (live prices).
    proxy: { '/api': { target: apiTarget, changeOrigin: true, ws: true } },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
