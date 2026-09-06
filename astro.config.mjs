import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://cofreutil.com.br',
  output: 'static',
  integrations: [
    react(),
    tailwind(),
    sitemap({
      filter: (page) => {
        const blocked = [
          '/admin',
          '/testes',
          '/homologacao',
          '/privado',
          '/obrigado',
        ];
        const url = new URL(page);
        return !blocked.some((path) => url.pathname.startsWith(path));
      },
      serialize: (item) => {
        const url = new URL(item.url);
        const path = url.pathname;

        if (path === '/' || path === '') {
          return {
            ...item,
            priority: 1.0,
            changefreq: 'daily',
          };
        }

        if (path.startsWith('/ferramentas/')) {
          return {
            ...item,
            priority: 0.9,
            changefreq: 'weekly',
          };
        }

        if (path.startsWith('/blog')) {
          return {
            ...item,
            priority: 0.8,
            changefreq: 'weekly',
          };
        }

        return {
          ...item,
          priority: 0.5,
          changefreq: 'monthly',
        };
      },
      entryLimit: 10000,
      lastmod: new Date(),
    }),
  ],
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
