import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://cofreutil.com.br',
  output: 'static',
  integrations: [react(), tailwind()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  vite: {
    optimizeDeps: {
      include: ['pdf-lib', 'pdfjs-dist', 'qrcode'],
      exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
    },
  },
});
