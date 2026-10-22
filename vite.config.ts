import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Nooit vanzelf herladen (bv. midden in een scoreinvoer): de app toont een melding "Nieuwe versie" (UpdateBanner).
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Sanapolis Darts',
        short_name: 'Darts',
        description: 'Maandelijks dartstoernooi in Brasserie ’t Oud Sanatorium',
        lang: 'nl-BE',
        theme_color: '#0a0a0b',
        background_color: '#f4f4f5',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        categories: ['sports'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
        shortcuts: [
          { name: 'Ranking', url: '/ranking', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'Scores invoeren', short_name: 'Scores', url: '/score', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'Beheer', url: '/beheer', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // De kalender (Netlify-functie) is geen pagina van de app.
        navigateFallbackDenylist: [/^\/kalender\.ics/],
        // Enkel de Latijnse lettertypebestanden offline klaarzetten; de rest (Grieks, Cyrillisch…) laadt de browser pas als het nodig is.
        globPatterns: ['**/*.{js,css,html,svg,png}', '**/inter-latin*.woff2'],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    testTimeout: 60_000,
  },
});
