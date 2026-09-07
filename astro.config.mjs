import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://www.cofreutil.com.br',
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
        const rawPath = url.pathname;
        const path = rawPath === '/' ? '/' : rawPath.replace(/\/$/, '');

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

        if (
          path === '/willian-scariott' ||
          path === '/seguranca-e-arquitetura' ||
          path === '/changelog'
        ) {
          return {
            ...item,
            priority: 0.7,
            changefreq: 'monthly',
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
  vite: {
    optimizeDeps: {
      include: ['pdf-lib', 'pdfjs-dist', 'qrcode'],
      exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
    },
  },
});
