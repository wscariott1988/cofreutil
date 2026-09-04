import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  output: 'static',
  integrations: [react(), tailwind()],
  headers: {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  },
  vite: {
    optimizeDeps: {
      include: ['pdf-lib', 'pdfjs-dist', 'qrcode'],
      exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
    },
  },
});
