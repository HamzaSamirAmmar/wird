import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Our own worker (src/sw.ts) rather than a generated one: it also handles push and
      // Background Sync, and writes pushed duties into the same Dexie cache as the app.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['favicon-32.png', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'ورد — الورد اليومي',
        short_name: 'ورد',
        description: 'تتبع الورد اليومي: حفظ جديد، مراجعة صغرى، مراجعة كبرى',
        lang: 'ar',
        dir: 'rtl',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#F3F7F7',
        theme_color: '#02636C',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/maskable-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      injectManifest: {
        // json: the muṣḥaf text asset must be precached, or the reader is online-only.
        // woff2: the self-hosted fonts (Amiri for the muṣḥaf) — offline typography.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,json}'],
        // The legacy FCM worker lives at its own scope and must exist verbatim at /.
        globIgnores: ['firebase-messaging-sw.js'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  server: {
    port: 5174,
  },
});
