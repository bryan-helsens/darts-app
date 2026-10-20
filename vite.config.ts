import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Sanapolis Darts',
        short_name: 'Darts',
        description: 'Maandelijks dartstoernooi in Brasserie ’t Oud Sanatorium',
        lang: 'nl-BE',
        theme_color: '#0a0a0b',
        background_color: '#f4f4f5',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        navigateFallback: '/index.html',
        // Enkel de Latijnse lettertypebestanden offline klaarzetten; de rest (Grieks, Cyrillisch…) laadt de browser pas als het nodig is.
        globPatterns: ['**/*.{js,css,html,svg}', '**/inter-latin*.woff2'],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    testTimeout: 60_000,
  },
});
